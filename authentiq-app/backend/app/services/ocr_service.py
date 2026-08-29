"""
OCR service for label / serial verification.

Engines (tried in order, first success wins):
    1. EasyOCR    — GPU-optional, good on product labels
    2. PaddleOCR  — optional heavy engine, env-gated (AUTHENTIQ_PADDLEOCR_ENABLED=true)
    3. Tesseract  — fallback, system-installed binary required

If no engine is available, returns empty text — callers fall back to visual-only scoring.

All original public functions are fully preserved:
    normalize_ocr_text()
    extract_text_from_image_bytes()
    fuzzy_text_similarity()

New additions:
    extract_text_structured()   — field-level extraction (serial, batch, product_code)
    get_ocr_slots()             — returns the set of slots OCR should run on (env-configurable)
    verify_ocr_fields()         — structured product-metadata fuzzy matching (name, brand,
                                  manufacturer, address, MRP, pack size, batch, dates)
"""

from __future__ import annotations

import logging
import os
import re
from difflib import SequenceMatcher
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ── Engine availability flags (lazy-resolved on first call) ───────────────────
_easyocr_reader = None
_paddleocr_reader = None
_last_engine = "none"

# PaddleOCR is opt-in — it is a ~1.5 GB download with system lib requirements.
_PADDLEOCR_ENABLED: bool = os.getenv(
    "AUTHENTIQ_PADDLEOCR_ENABLED", "false"
).lower() in ("1", "true", "yes")

# Minimum OCR confidence to include a detected text block.
# Blocks below this threshold are discarded to reduce noisy text in comparisons.
_OCR_MIN_CONFIDENCE: float = float(os.getenv("AUTHENTIQ_OCR_MIN_CONFIDENCE", "0.50"))

# Slots to run OCR on (comma-separated, e.g. "label" or "front,back,label").
# Defaults to all three core slots.  Set to "label" to restrict if OCR latency
# on front/back is unacceptable.
_OCR_SLOTS_RAW: str = os.getenv("AUTHENTIQ_OCR_SLOTS", "front,back,label")


# ── Field extraction patterns ─────────────────────────────────────────────────
# These are applied to the RAW (non-normalized) OCR string so punctuation is available.
_FIELD_PATTERNS: Dict[str, str] = {
    # Serial: SN-XXXX, S/N XXXX, Serial: XXXX
    "serial": r"(?:SN[-\s:]?|S/N\s*|Serial\s*:?\s*)([A-Z0-9\-]{4,20})",
    # Batch: B-XXXX, Batch: XXXX, Lot: XXXX, LOT#XXXX
    "batch": r"(?:Batch\s*:?\s*|LOT\s*#?\s*|Lot\s*:?\s*|B[-\s:]?)([A-Z0-9\-]{2,16})",
    # Product code: PC-XXXX, SKU XXXX, Code: XXXX
    "product_code": r"(?:PC[-\s:]?|SKU\s*:?\s*|Code\s*:?\s*|REF\s*:?\s*)([A-Z0-9\-]{3,20})",
    # MRP / price: MRP Rs. 99, MRP: 149.00, Price Rs 200
    "mrp": r"(?:MRP\.?\s*(?:Rs\.?\s*)?|Price\s+Rs\.?\s*)(\d+(?:\.\d{1,2})?)",
    # Net quantity / pack size: 100g, 500ml, 1kg, 200 gm, NET WT 50g
    "net_quantity": r"(?:Net\s*(?:Wt|Qty|Content|Vol|Volume)\.?\s*:?\s*|NET\s+WT\.?\s*)(\d+(?:\.\d+)?\s*(?:g|gm|kg|ml|L|ltr|pcs|units|tabs|capsules)?)",
    # Manufacturing date: Mfg: Jan 2025 / Mfg. Date: 01/2025
    "mfg_date": r"(?:Mfg\.?\s*(?:Date)?\s*:?\s*)(\d{1,2}[\/\-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4})",
    # Expiry / best before: Exp: 12/2026 / Best Before: Jun 2027
    "exp_date": r"(?:Exp(?:iry)?\.?\s*(?:Date)?\s*:?\s*|Best\s+Before\s*:?\s*|BB\s*:?\s*)(\d{1,2}[\/\-]\d{2,4}|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s*\d{4})",
}

# Product metadata fields to fuzzy-match from a product registry dict.
# Maps product dict key → human label for logging.
_PRODUCT_META_FIELDS: Dict[str, str] = {
    "name": "Product Name",
    "brand_name": "Brand Name",
    "brand": "Brand Name",
    "manufacturer_name": "Manufacturer Name",
    "manufacturer": "Manufacturer Name",
    "manufacturer_address": "Manufacturer Address",
    "address": "Address",
    "mrp": "MRP",
    "net_quantity": "Net Quantity",
    "pack_size": "Pack Size",
    "batch_number": "Batch Number",
    "batch": "Batch Number",
}

# Minimum fuzzy ratio to count a field as "matched"
_FIELD_MATCH_THRESHOLD: float = 0.60


# ── Public helpers ─────────────────────────────────────────────────────────────

def get_ocr_slots() -> frozenset:
    """
    Returns the set of slot names on which OCR should be attempted.
    Controlled by AUTHENTIQ_OCR_SLOTS env var (default: "front,back,label").
    """
    parts = [s.strip().lower() for s in _OCR_SLOTS_RAW.split(",") if s.strip()]
    return frozenset(parts) if parts else frozenset({"front", "back", "label"})


def normalize_ocr_text(text: str) -> str:
    """
    Normalize raw OCR text to uppercase alphanumeric only.
    Used for fuzzy similarity comparison.
    """
    if not text:
        return ""
    upper = text.upper()
    upper = re.sub(r"[^A-Z0-9]", "", upper)
    return upper


def extract_text_from_image_bytes(image_bytes: bytes) -> Tuple[str, str]:
    """
    Run OCR on raw image bytes.

    Returns:
        (normalized_text, engine_name)
        normalized_text: uppercase alphanumeric-only string
        engine_name: "easyocr" | "paddleocr" | "tesseract" | "none"
    """
    from io import BytesIO

    from PIL import Image

    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        logger.warning("[OCR] Could not open image: %s", exc)
        return "", "none"

    raw = _run_ocr_on_pil(image)
    return normalize_ocr_text(raw), _last_engine or "none"


def extract_text_structured(image_bytes: bytes) -> Dict:
    """
    Extract raw OCR text AND attempt field-level parsing for known patterns.

    Returns:
        {
            "raw_text": str,           — non-normalized full OCR output
            "normalized_text": str,    — uppercase alphanumeric
            "engine": str,
            "fields": {
                "serial":       str | None,
                "batch":        str | None,
                "product_code": str | None,
                "mrp":          str | None,
                "net_quantity":  str | None,
                "mfg_date":     str | None,
                "exp_date":     str | None,
            },
        }
    """
    from io import BytesIO
    from PIL import Image

    _empty_fields: Dict[str, Optional[str]] = {
        "serial": None, "batch": None, "product_code": None,
        "mrp": None, "net_quantity": None, "mfg_date": None, "exp_date": None,
    }

    try:
        image = Image.open(BytesIO(image_bytes)).convert("RGB")
    except Exception as exc:
        logger.warning("[OCR] Could not open image for structured extract: %s", exc)
        return {
            "raw_text": "",
            "normalized_text": "",
            "engine": "none",
            "fields": _empty_fields,
        }

    raw = _run_ocr_on_pil(image)
    engine = _last_engine or "none"
    fields: Dict[str, Optional[str]] = {}
    for field_name, pattern in _FIELD_PATTERNS.items():
        m = re.search(pattern, raw, re.IGNORECASE)
        fields[field_name] = m.group(1).strip() if m else None

    return {
        "raw_text": raw,
        "normalized_text": normalize_ocr_text(raw),
        "engine": engine,
        "fields": fields,
    }


def verify_ocr_fields(
    ocr_text: str,
    product: Optional[Dict[str, Any]],
) -> Tuple[float, Dict[str, Any]]:
    """
    Compare extracted OCR text against structured product registry metadata using
    sliding-window fuzzy matching.

    Checks the following product fields (when present in `product` dict):
        - name / product name
        - brand_name / brand
        - manufacturer_name / manufacturer
        - manufacturer_address / address
        - mrp
        - net_quantity / pack_size
        - batch_number / batch

    Algorithm:
        For each product field value, slide a window of similar length over the
        OCR text and compute SequenceMatcher ratio at each position. The maximum
        ratio across all windows becomes the field-level match score.
        Only tokens above _OCR_MIN_CONFIDENCE are used (confidence already
        filtered at extraction time). Overall score = mean of all attempted fields.

    Returns:
        (score: float 0-1, details: dict)
        details keys:
            "fields_checked": int
            "fields_matched": int
            "field_scores": {field_name: float}
            "overall_score": float
    """
    if not ocr_text or not product:
        return 0.0, {
            "fields_checked": 0,
            "fields_matched": 0,
            "field_scores": {},
            "overall_score": 0.0,
        }

    norm_ocr = normalize_ocr_text(ocr_text)
    if not norm_ocr:
        return 0.0, {
            "fields_checked": 0,
            "fields_matched": 0,
            "field_scores": {},
            "overall_score": 0.0,
        }

    field_scores: Dict[str, float] = {}
    attempted_scores: List[float] = []

    # Iterate over known metadata field mappings
    seen_values: set = set()
    for key, label in _PRODUCT_META_FIELDS.items():
        raw_value = product.get(key)
        if not raw_value:
            continue
        value_norm = normalize_ocr_text(str(raw_value))
        if not value_norm or value_norm in seen_values:
            continue
        seen_values.add(value_norm)

        score = _sliding_window_fuzzy(norm_ocr, value_norm)
        field_scores[label] = round(score, 4)
        attempted_scores.append(score)
        logger.debug(
            "[OCR:verify_fields] field=%s value='%s' score=%.3f",
            label, raw_value, score,
        )

    fields_matched = sum(1 for s in attempted_scores if s >= _FIELD_MATCH_THRESHOLD)
    overall = float(sum(attempted_scores) / len(attempted_scores)) if attempted_scores else 0.0

    return overall, {
        "fields_checked": len(attempted_scores),
        "fields_matched": fields_matched,
        "field_scores": field_scores,
        "overall_score": round(overall, 4),
    }


def fuzzy_text_similarity(text_a: str, text_b: str) -> float:
    """
    Compute 0–1 similarity between two text strings using normalized edit distance.

    Both inputs are normalized (uppercase alphanumeric) before comparison.
    Uses Python's SequenceMatcher which computes the ratio of matching characters —
    equivalent to (2 × matching_chars) / total_chars, i.e. normalized edit similarity.
    """
    a = normalize_ocr_text(text_a)
    b = normalize_ocr_text(text_b)
    if not a and not b:
        return 1.0
    if not a or not b:
        return 0.0
    if a == b:
        return 1.0
    return float(SequenceMatcher(None, a, b).ratio())


# ── Internal helpers ───────────────────────────────────────────────────────────

def _sliding_window_fuzzy(haystack: str, needle: str) -> float:
    """
    Slide a window of len(needle) over haystack and return the max fuzzy ratio.
    Falls back to full-string comparison if needle is longer than haystack.
    """
    if not needle or not haystack:
        return 0.0
    n = len(needle)
    h = len(haystack)
    if n >= h:
        return float(SequenceMatcher(None, haystack, needle).ratio())
    best = 0.0
    # Step by half needle length for speed
    step = max(1, n // 2)
    for i in range(0, h - n + 1, step):
        window = haystack[i: i + n]
        ratio = SequenceMatcher(None, window, needle).ratio()
        if ratio > best:
            best = ratio
        if best >= 1.0:
            break
    # Always check last window
    last_window = haystack[h - n:]
    ratio = SequenceMatcher(None, last_window, needle).ratio()
    best = max(best, ratio)
    return float(best)


# ── Internal OCR dispatch (engine cascade) ────────────────────────────────────

def _run_ocr_on_pil(image) -> str:
    """
    Attempt OCR using the available engine cascade.
    Sets _last_engine to the engine that produced output.
    Returns raw (non-normalized) text string.
    Text blocks below AUTHENTIQ_OCR_MIN_CONFIDENCE are discarded.
    """
    global _easyocr_reader, _paddleocr_reader, _last_engine
    _last_engine = "none"
    min_conf = _OCR_MIN_CONFIDENCE

    # ── 1. EasyOCR ───────────────────────────────────────────────────────────
    try:
        import easyocr  # type: ignore
        import numpy as np

        if _easyocr_reader is None:
            _easyocr_reader = easyocr.Reader(["en"], gpu=False, verbose=False)

        results = _easyocr_reader.readtext(np.array(image))
        # results: list of ([bbox], text, confidence)
        parts = [
            str(r[1])
            for r in results
            if len(r) > 2 and float(r[2]) >= min_conf
        ]
        if parts:
            _last_engine = "easyocr"
            return " ".join(parts)
    except ImportError:
        pass
    except Exception as exc:
        logger.debug("[OCR] EasyOCR failed: %s", exc)

    # ── 2. PaddleOCR (optional — enable via env) ─────────────────────────────
    if _PADDLEOCR_ENABLED:
        try:
            from paddleocr import PaddleOCR  # type: ignore
            import numpy as np

            if _paddleocr_reader is None:
                _paddleocr_reader = PaddleOCR(use_angle_cls=True, lang="en", show_log=False)

            img_arr = np.array(image)
            result = _paddleocr_reader.ocr(img_arr, cls=True)
            parts: List[str] = []
            if result:
                for line in result:
                    if line:
                        for item in line:
                            # item: [[bbox], [text, confidence]]
                            if item and len(item) > 1 and item[1]:
                                text_val = str(item[1][0])
                                conf_val = float(item[1][1]) if len(item[1]) > 1 else 0.0
                                if conf_val >= min_conf:
                                    parts.append(text_val)
            if parts:
                _last_engine = "paddleocr"
                return " ".join(parts)
        except ImportError:
            logger.debug("[OCR] PaddleOCR not installed (AUTHENTIQ_PADDLEOCR_ENABLED=true but package missing)")
        except Exception as exc:
            logger.debug("[OCR] PaddleOCR failed: %s", exc)

    # ── 3. Tesseract (system binary fallback) ────────────────────────────────
    # Tesseract does not expose per-word confidence in basic mode;
    # use image_to_data for confidence-filtered output when available.
    try:
        import pytesseract  # type: ignore

        try:
            import pandas as pd  # type: ignore
            data = pytesseract.image_to_data(image, output_type=pytesseract.Output.DATAFRAME)
            # Filter by confidence (-1 means N/A header rows)
            filtered = data[(data["conf"] != -1) & (data["conf"] / 100.0 >= min_conf)]
            words = filtered["text"].dropna().astype(str).tolist()
            raw = " ".join(w for w in words if w.strip())
        except Exception:
            # Fall back to simple image_to_string if pandas/data mode unavailable
            raw = pytesseract.image_to_string(image)

        if raw and raw.strip():
            _last_engine = "tesseract"
            return raw
    except ImportError:
        pass
    except Exception as exc:
        logger.debug("[OCR] Tesseract failed: %s", exc)

    return ""
