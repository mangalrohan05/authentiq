"""
VLM authentication service (v7) — Qwen2.5-VL as the primary adjudicator.

This replaces the old pairwise "±0.35 nudge" QwenVL usage. The model now
receives, in a single call:

    * the full registered product metadata (name, brand, SKU, manufacturer,
      country of origin, MRP, barcode, batch, description, ...),
    * every available reference view of the genuine product
      (front / back / label / hologram / seal / barcode, each labelled), and
    * every customer-uploaded image (each labelled with its slot),

and returns a *structured* judgement: per-attribute match/mismatch, an itemised
list of defects each with a severity, a metadata-consistency table, an overall
authenticity probability and a verdict. The downstream decision layer
(`vlm_decision.py`) turns that into the final score, where any CRITICAL defect
vetoes an otherwise-similar look-alike.

Transport: OpenAI-compatible `/v1/chat/completions` (vLLM or Ollama serving
Qwen2.5-VL). Uses `httpx` (a declared dependency). No third-party data egress
unless AUTHENTIQ_VLM_API_URL points off-box.

There is deliberately NO similarity-based mock that can return "authentic":
when the model is unreachable the caller fails closed (needs_review).
"""

from __future__ import annotations

import base64
import io
import json
import logging
import time
from typing import Any, Dict, List, Optional

from app.services import vlm_config as cfg

logger = logging.getLogger(__name__)


# Re-exported so existing importers keep working after the refactor.
VLM_ENABLED = cfg.VLM_ENABLED


# ── Image encoding ───────────────────────────────────────────────────────────
def _encode_pil(img: "Any", max_dim: int) -> Optional[str]:
    """Downscale a PIL image (long side -> max_dim) and return a JPEG data URL."""
    try:
        img = img.convert("RGB")
        longest = max(img.width, img.height)
        if max_dim and longest > max_dim:
            scale = max_dim / float(longest)
            img = img.resize((max(1, int(img.width * scale)), max(1, int(img.height * scale))))
        buf = io.BytesIO()
        img.save(buf, format="JPEG", quality=cfg.VLM_JPEG_QUALITY)
        return f"data:image/jpeg;base64,{base64.b64encode(buf.getvalue()).decode('utf-8')}"
    except Exception as exc:
        logger.warning("[VLM] PIL encode failed (%s)", exc)
        return None


def _encode_image(image_bytes: bytes, max_dim: Optional[int] = None) -> Optional[str]:
    """Downscale (long side -> max_dim, default VLM_IMAGE_MAX_DIM) and return a JPEG data URL."""
    if not image_bytes:
        return None
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(image_bytes))
        url = _encode_pil(img, max_dim if max_dim is not None else cfg.VLM_IMAGE_MAX_DIM)
        if url:
            return url
        raise ValueError("encode returned None")
    except Exception as exc:  # PIL missing or undecodable — fall back to raw bytes
        logger.warning("[VLM] Image re-encode failed (%s); sending raw bytes", exc)
        try:
            header = "image/png" if image_bytes.startswith(b"\x89PNG") else "image/jpeg"
            return f"data:{header};base64,{base64.b64encode(image_bytes).decode('utf-8')}"
        except Exception:
            return None


# Security regions worth a high-res close-up, most-diagnostic first. These are the
# hardest features for a counterfeiter to reproduce and the first place a fake
# gives itself away — exactly what the 1024px full-image downscale used to destroy.
_SECURITY_CROP_PRIORITY = ("hologram", "logo", "qr", "barcode", "serial", "label")


def _security_region_crops(image_bytes: bytes) -> List[Dict[str, str]]:
    """High-resolution crops of detected security regions for one image (audit 1.4).

    Returns [{"region_type": str, "url": data_url}], at most VLM_MAX_CROPS_PER_IMAGE.
    Best-effort: any failure returns [] so the caller still sends the full image.
    """
    if not (cfg.VLM_REGION_CROPS_ENABLED and image_bytes):
        return []
    try:
        # Deferred import: avoids loading YOLO/region deps unless crops are used.
        from app.services.region_detection import detect_authenticity_regions, regions_to_crops

        regions, _meta = detect_authenticity_regions(image_bytes)
        priority = {t: i for i, t in enumerate(_SECURITY_CROP_PRIORITY)}
        wanted = [r for r in regions if r.get("region_type") in priority]
        wanted.sort(key=lambda r: (priority[r["region_type"]], -float(r.get("confidence", 0.0))))
        wanted = wanted[: max(0, cfg.VLM_MAX_CROPS_PER_IMAGE)]
        if not wanted:
            return []

        out: List[Dict[str, str]] = []
        for rc in regions_to_crops(image_bytes, wanted):
            crop = rc.get("crop")
            if crop is None:
                continue
            url = _encode_pil(crop, cfg.VLM_CROP_MAX_DIM)
            if url:
                out.append({"region_type": str(rc.get("region_type", "region")), "url": url})
        return out
    except Exception as exc:
        logger.warning("[VLM] Region-crop generation failed (%s); full image only", exc)
        return []


# ── Prompt construction ──────────────────────────────────────────────────────
_METADATA_LABELS = [
    ("name", "Product name"),
    ("brand", "Brand"),
    ("brand_name", "Brand"),
    ("variant_name", "Variant"),
    ("category", "Category"),
    ("description", "Description"),
    ("sku", "SKU"),
    ("serial_number", "Serial number"),
    ("barcode", "Barcode (EAN/UPC)"),
    ("hsn_code", "HSN code"),
    ("batch_number", "Batch number"),
    ("pack_size", "Pack size"),
    ("net_quantity", "Net quantity"),
    ("mrp", "MRP / price"),
    ("manufacturer_name", "Manufacturer"),
    ("manufacturer_address", "Manufacturer address"),
    ("country_of_origin", "Country of origin"),
]


def _build_metadata_block(product: Optional[Dict[str, Any]]) -> str:
    if not product:
        return "(no registered metadata provided)"
    seen = set()
    lines: List[str] = []
    for key, label in _METADATA_LABELS:
        if label in seen:
            continue
        val = product.get(key)
        if val is None or str(val).strip() == "":
            continue
        seen.add(label)
        lines.append(f"  - {label}: {str(val).strip()}")
    return "\n".join(lines) if lines else "(no registered metadata provided)"


def _ground_truth_block(product: Optional[Dict[str, Any]]) -> str:
    """Ground truth for the scan prompt.

    Prefers the pre-analysed Authentication Profile (built once at product
    creation from vendor metadata + the reference images) so the scan-time model
    only has to COMPARE against a rich known spec rather than re-derive it.
    Falls back to the raw registered metadata when no ready profile exists
    (legacy products, or profile still building/failed).
    """
    prof = (product or {}).get("authentication_profile") or {}
    spec = str(prof.get("spec", "")).strip()
    if prof.get("status") == "ready" and spec:
        return "GENUINE PRODUCT AUTHENTICATION PROFILE (pre-analysed ground truth):\n" + spec
    return "Registered product metadata (ground truth):\n" + _build_metadata_block(product)


def _system_prompt() -> str:
    return (
        "You are a forensic product-authentication expert specialised in detecting "
        "COUNTERFEITS, including subtle ones. Counterfeit units are often 90-98% "
        "visually identical to the genuine article, so do NOT conclude 'authentic' "
        "merely because the overall shape, colour and layout look right — compare the "
        "fine details against the reference views: logo geometry, typography, security "
        "printing, print quality, codes, and any text that must agree with the "
        "registered metadata.\n\n"
        "EVIDENCE DISCIPLINE — these rules govern everything else:\n"
        "1. Report ONLY what you can actually observe in THESE customer images. Never "
        "infer a defect from what counterfeits typically look like, and never restate "
        "an example from these instructions as though you had observed it.\n"
        "2. If a detail is illegible, glared, cropped, out of frame, or too "
        "low-resolution to judge, mark it 'unclear'. 'unclear' is the REQUIRED answer "
        "for anything you cannot verify — do NOT record it as 'mismatch', and do NOT "
        "record it as 'match'. Being unable to see something is NEVER evidence against "
        "the product.\n"
        "3. An 'unclear' detail is NOT a defect and must never appear in `defects`.\n"
        "4. Raise a defect only when you can name the specific element, say where it is, "
        "and state what differs from the reference. If you cannot point to it precisely, "
        "it is not a defect.\n"
        "5. When the customer images match the reference views and the visible text "
        "agrees with the registered metadata, you MUST conclude 'authentic' — a genuine "
        "product that matches its own references must not be flagged. Poor lighting, "
        "glare, angle, focus and resolution are NOT counterfeit signals.\n"
        "6. Reserve 'critical' for a clear, unmistakable counterfeit signal — never for "
        "ambiguity, never for image quality.\n"
        "7. Keep your verdict consistent with your own findings: if you report no "
        "defects and no confirmed metadata mismatches, the verdict must be 'authentic'."
    )


def _instruction_block(product: Optional[Dict[str, Any]]) -> str:
    schema = (
        "{\n"
        '  "authenticity_probability": <number 0.0-1.0, your calibrated probability the customer unit is GENUINE>,\n'
        '  "verdict": "authentic" | "suspicious" | "counterfeit",\n'
        '  "attribute_checks": {\n'
        "     // EVERY value below must be exactly one of: \"match\" | \"mismatch\" | \"unclear\" | \"na\".\n"
        "     // Never put descriptive text here. Use \"unclear\" when you cannot judge it.\n"
        '     "logo": "match|mismatch|unclear|na", "brand_text": "match|mismatch|unclear|na",\n'
        '     "label_text": "match|mismatch|unclear|na", "fonts": "match|mismatch|unclear|na",\n'
        '     "colors": "match|mismatch|unclear|na", "security_features": "match|mismatch|unclear|na",\n'
        '     "barcode_qr": "match|mismatch|unclear|na", "batch_serial": "match|mismatch|unclear|na",\n'
        '     "packaging": "match|mismatch|unclear|na", "shape": "match|mismatch|unclear|na",\n'
        '     "print_quality": "match|mismatch|unclear|na"\n'
        "  },\n"
        '  "defects": [\n'
        '     {"attribute": "<one of the attribute keys>", "view": "<front|back|label|...>",\n'
        '      "description": "<what is wrong and where>", "severity": "critical|major|minor"}\n'
        "  ],\n"
        '  "metadata_consistency": [\n'
        '     {"field": "<metadata field>", "printed_value": "<what the customer image shows, or null>",\n'
        '      "expected_value": "<registered value>", "match": true|false|"unclear"}\n'
        "  ],\n"
        '  "explanation": "<concise reasoning citing the specific evidence>"\n'
        "}"
    )
    return (
        "TASK: Decide whether the CUSTOMER UPLOAD images show a GENUINE unit of the "
        "registered product, or a counterfeit / tampered / wrong item.\n\n"
        f"{_ground_truth_block(product)}\n\n"
        "You are given REFERENCE images of the genuine product (multiple views), "
        "CUSTOMER UPLOAD images to verify, and — where available — high-resolution "
        "CUSTOMER CLOSE-UP crops of individual security regions (logo, hologram, QR/"
        "barcode, serial, label). Use the close-ups to judge fine details (micro-print, "
        "hologram texture, fine typography, print quality) that are not legible in the "
        "full image. Compare each customer image against the reference view(s) of the "
        "same side, AND cross-check any text/numbers visible in the customer images "
        "against the registered metadata above.\n\n"
        "METADATA RULE: set \"match\": \"unclear\" — NOT false — whenever `printed_value` "
        "is null, or the field is not legible/not visible in the customer images. "
        "\"match\": false means you can actually READ the printed value AND it genuinely "
        "differs from the registered value. A field you could not read is never a "
        "mismatch.\n\n"
        "Severity guidance:\n"
        "  - critical: a security feature (hologram/seal/security print) is missing or "
        "altered; the logo/brand mark is wrong; the barcode/QR is wrong or absent; or "
        "printed brand/manufacturer/barcode/SKU/serial disagrees with the metadata. "
        "Any single critical defect means the unit is NOT authentic.\n"
        "  - major: clear discrepancy in fonts, colours, layout, print quality or a "
        "non-identity metadata field (e.g. MRP, batch, pack size).\n"
        "  - minor: small imperfection that could plausibly be photography/lighting.\n\n"
        "Respond with ONLY a single JSON object (no markdown fences, no prose) of exactly "
        "this shape:\n"
        f"{schema}"
    )


def _build_messages(
    customer_images: List[Dict[str, Any]],
    reference_images: List[Dict[str, Any]],
    product: Optional[Dict[str, Any]],
) -> Optional[List[Dict[str, Any]]]:
    """Assemble an OpenAI-compatible multimodal message list.

    customer_images / reference_images: [{"label": str, "view": str, "bytes": bytes}]
    """
    content: List[Dict[str, Any]] = [{"type": "text", "text": _instruction_block(product)}]

    attached = 0
    # Reserve budget for customer images + their high-res security crops, so a long
    # list of reference views can't crowd out the crops that carry the counterfeit
    # signal (audit 1.4).
    ref_budget = cfg.VLM_MAX_IMAGES
    if cfg.VLM_REGION_CROPS_ENABLED and customer_images:
        reserve = min(
            len(customer_images) * (1 + max(0, cfg.VLM_MAX_CROPS_PER_IMAGE)),
            max(0, cfg.VLM_MAX_IMAGES - 1),  # always leave room for >= 1 reference
        )
        ref_budget = max(1, cfg.VLM_MAX_IMAGES - reserve)

    # References first so the model establishes the "genuine" baseline.
    if reference_images:
        content.append({"type": "text", "text": "=== REFERENCE IMAGES (genuine product) ==="})
        for ref in reference_images:
            if attached >= ref_budget or attached >= cfg.VLM_MAX_IMAGES:
                break
            url = _encode_image(ref.get("bytes", b""))
            if not url:
                continue
            content.append(
                {"type": "text", "text": f"REFERENCE — view: {ref.get('view', 'unknown')}"}
            )
            content.append({"type": "image_url", "image_url": {"url": url}})
            attached += 1

    content.append({"type": "text", "text": "=== CUSTOMER UPLOAD (verify these) ==="})
    customer_attached = 0
    for cust in customer_images:
        if attached >= cfg.VLM_MAX_IMAGES:
            break
        cust_bytes = cust.get("bytes", b"")
        url = _encode_image(cust_bytes)
        if not url:
            continue
        slot = cust.get("view", "unknown")
        content.append({"type": "text", "text": f"CUSTOMER UPLOAD — slot: {slot}"})
        content.append({"type": "image_url", "image_url": {"url": url}})
        attached += 1
        customer_attached += 1

        # High-resolution crops of this image's security regions (audit 1.4) —
        # the full image is downscaled to VLM_IMAGE_MAX_DIM, so these close-ups are
        # where micro-print / hologram / ® / QR print quality stay legible.
        for crop in _security_region_crops(cust_bytes):
            if attached >= cfg.VLM_MAX_IMAGES:
                break
            content.append(
                {
                    "type": "text",
                    "text": (
                        f"CUSTOMER CLOSE-UP — slot: {slot}, region: {crop['region_type']} "
                        "(high-resolution crop; inspect fine security detail here)"
                    ),
                }
            )
            content.append({"type": "image_url", "image_url": {"url": crop["url"]}})
            attached += 1

    if customer_attached == 0:
        logger.warning("[VLM] No customer images could be encoded; aborting VLM call")
        return None

    return [
        {"role": "system", "content": _system_prompt()},
        {"role": "user", "content": content},
    ]


# ── JSON parsing ─────────────────────────────────────────────────────────────
def _parse_model_json(content: str) -> Optional[Dict[str, Any]]:
    if not content:
        return None
    text = content.strip()
    if text.startswith("```"):
        # strip a ```json ... ``` fence
        lines = text.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].strip().startswith("```"):
            lines = lines[:-1]
        text = "\n".join(lines).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(text[start : end + 1])
            except json.JSONDecodeError:
                return None
    return None


# ── API call ─────────────────────────────────────────────────────────────────
def _call_api(
    messages: List[Dict[str, Any]],
    temperature: Optional[float] = None,
) -> Optional[Dict[str, Any]]:
    if not cfg.VLM_API_URL:
        logger.warning("[VLM] AUTHENTIQ_VLM_API_URL is not configured")
        return None

    try:
        import httpx
    except ImportError:
        logger.error("[VLM] httpx is not installed — cannot reach the VLM endpoint")
        return {"__error__": "httpx_not_installed"}

    headers = {"Content-Type": "application/json"}
    if cfg.VLM_API_KEY:
        headers["Authorization"] = f"Bearer {cfg.VLM_API_KEY}"

    payload: Dict[str, Any] = {
        "model": cfg.VLM_MODEL,
        "messages": messages,
        "temperature": cfg.VLM_TEMPERATURE if temperature is None else temperature,
        "max_tokens": cfg.VLM_MAX_TOKENS,
    }
    # Ask for JSON when the server supports it; harmless if ignored.
    payload["response_format"] = {"type": "json_object"}

    last_err: Optional[str] = None
    for attempt in range(1, cfg.VLM_MAX_RETRIES + 2):
        try:
            logger.info(
                "[VLM] POST %s model=%s (attempt %d/%d, images in prompt)",
                cfg.VLM_API_URL, cfg.VLM_MODEL, attempt, cfg.VLM_MAX_RETRIES + 1,
            )
            resp = httpx.post(
                cfg.VLM_API_URL, headers=headers, json=payload, timeout=cfg.VLM_TIMEOUT_S
            )
            resp.raise_for_status()
            data = resp.json()
            content = data["choices"][0]["message"]["content"]
            parsed = _parse_model_json(content)
            if parsed is None:
                last_err = "unparseable_model_output"
                logger.warning("[VLM] Could not parse model JSON (attempt %d)", attempt)
                # A retry may produce cleaner JSON.
            else:
                return parsed
        except httpx.HTTPStatusError as exc:
            last_err = f"http_{exc.response.status_code}"
            body = ""
            try:
                body = exc.response.text[:500]
            except Exception:
                pass
            logger.warning("[VLM] HTTP %s (attempt %d): %s", exc.response.status_code, attempt, body)
            # 400 Bad Request: if server (e.g. Ollama) rejects response_format, strip it and retry
            if exc.response.status_code == 400 and "response_format" in payload:
                logger.info("[VLM] Retrying without response_format parameter")
                payload.pop("response_format", None)
                continue
            if 400 <= exc.response.status_code < 500:
                break
        except Exception as exc:
            last_err = str(exc)
            logger.warning("[VLM] Request failed (attempt %d): %s", attempt, exc)

        if attempt <= cfg.VLM_MAX_RETRIES:
            time.sleep(cfg.VLM_RETRY_BACKOFF_S * attempt)

    logger.error("[VLM] Giving up after retries: %s", last_err)
    return {"__error__": last_err} if last_err else None


# ── Model keep-warm (fixes the ~70s cold-start reload) ───────────────────────
def _ollama_base_url() -> Optional[str]:
    """Ollama's native API base (for keep-alive), or None if the endpoint is not
    Ollama (vLLM/Triton keep the model resident, so no keep-warm is needed)."""
    url = cfg.VLM_API_URL or ""
    if not url or ("11434" not in url and "ollama" not in url.lower()):
        return None
    return url.split("/v1/")[0].rstrip("/")


def warm_up_model() -> bool:
    """Pin the VLM in memory so a scan never pays the cold ~70s model reload.

    Sends a tiny Ollama generate with keep_alive so the model stays loaded.
    Returns True if the model is (now) warm; a no-op returning False for non-Ollama
    servers or when disabled. Safe to call repeatedly (that is the point).
    """
    if not (cfg.VLM_ENABLED and cfg.VLM_KEEP_WARM_ENABLED):
        return False
    base = _ollama_base_url()
    if not base:
        return False
    try:
        import httpx

        keep = cfg.VLM_KEEP_ALIVE
        try:
            keep_val: Any = int(keep)  # "-1" -> -1 (forever)
        except (TypeError, ValueError):
            keep_val = keep  # duration string, e.g. "30m"
        resp = httpx.post(
            f"{base}/api/generate",
            json={"model": cfg.VLM_MODEL, "prompt": "ok", "stream": False, "keep_alive": keep_val},
            timeout=cfg.VLM_TIMEOUT_S,
        )
        resp.raise_for_status()
        return True
    except Exception as exc:
        logger.warning("[VLM] keep-warm ping failed: %s", exc)
        return False


# ── Normalisation ────────────────────────────────────────────────────────────
_VALID_SEVERITY = {"critical", "major", "minor"}


def _normalize_result(raw: Dict[str, Any], method: str) -> Dict[str, Any]:
    prob = raw.get("authenticity_probability")
    try:
        prob = float(prob)
        prob = max(0.0, min(1.0, prob))
    except (TypeError, ValueError):
        prob = None

    verdict = str(raw.get("verdict", "unknown")).strip().lower()
    if verdict not in ("authentic", "suspicious", "counterfeit"):
        verdict = "unknown"

    defects_in = raw.get("defects") or []
    defects: List[Dict[str, Any]] = []
    if isinstance(defects_in, list):
        for d in defects_in:
            if not isinstance(d, dict):
                continue
            sev = str(d.get("severity", "minor")).strip().lower()
            if sev not in _VALID_SEVERITY:
                sev = "minor"
            defects.append(
                {
                    "attribute": str(d.get("attribute", "unknown")),
                    "view": str(d.get("view", "")),
                    "description": str(d.get("description", "")).strip(),
                    "severity": sev,
                }
            )

    meta_in = raw.get("metadata_consistency") or []
    meta: List[Dict[str, Any]] = []
    if isinstance(meta_in, list):
        for m in meta_in:
            if not isinstance(m, dict):
                continue
            match_val = m.get("match")
            if isinstance(match_val, str):
                match_val = match_val.strip().lower()
                if match_val in ("true", "yes"):
                    match_val = True
                elif match_val in ("false", "no"):
                    match_val = False
            meta.append(
                {
                    "field": str(m.get("field", "")),
                    "printed_value": m.get("printed_value"),
                    "expected_value": m.get("expected_value"),
                    "match": match_val,
                }
            )

    checks_in = raw.get("attribute_checks") or {}
    checks: Dict[str, str] = {}
    if isinstance(checks_in, dict):
        for k, v in checks_in.items():
            checks[str(k)] = str(v).strip().lower()

    return {
        "available": True,
        "method": method,
        "verdict": verdict,
        "authenticity_probability": prob,
        "attribute_checks": checks,
        "defects": defects,
        "metadata_consistency": meta,
        "explanation": str(raw.get("explanation", "")).strip(),
        "raw": raw,
        "error": None,
    }


def _unavailable(reason: str) -> Dict[str, Any]:
    return {
        "available": False,
        "method": "unavailable",
        "verdict": "unknown",
        "authenticity_probability": None,
        "attribute_checks": {},
        "defects": [],
        "metadata_consistency": [],
        "explanation": "",
        "raw": None,
        "error": reason,
    }


def _dev_mock() -> Dict[str, Any]:
    """Explicit, non-production stub. NEVER returns 'authentic' — routes to review."""
    logger.warning("[VLM] Using AUTHENTIQ_VLM_DEV_MOCK — neutral needs-review result")
    return {
        "available": False,
        "method": "dev_mock",
        "verdict": "unknown",
        "authenticity_probability": None,
        "attribute_checks": {},
        "defects": [],
        "metadata_consistency": [],
        "explanation": "VLM dev mock active — no real model was consulted.",
        "raw": None,
        "error": "dev_mock",
    }


# ── Public entry point ───────────────────────────────────────────────────────
def verify_product_authenticity(
    customer_images: List[Dict[str, Any]],
    reference_images: List[Dict[str, Any]],
    product: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Holistic VLM authentication.

    Args:
        customer_images: [{"label"?, "view": slot, "bytes": jpeg/png bytes}]
        reference_images: [{"label"?, "view": view_type, "bytes": ...}]  (genuine)
        product: full registered product metadata dict.

    Returns a normalized result dict (see _normalize_result / _unavailable).
    `available=False` means the caller must fail closed (needs_review); it will
    never carry a similarity-derived "authentic" boost.
    """
    if not cfg.VLM_ENABLED:
        return _unavailable("vlm_disabled")
    if cfg.VLM_DEV_MOCK and not cfg.VLM_API_URL:
        return _dev_mock()
    if not customer_images:
        return _unavailable("no_customer_images")

    messages = _build_messages(customer_images, reference_images, product)
    if messages is None:
        return _unavailable("no_encodable_images")

    raw = _call_api(messages)
    if raw is None:
        return _unavailable("vlm_no_response")
    if "__error__" in raw:
        return _unavailable(f"vlm_error:{raw['__error__']}")

    return _normalize_result(raw, method="api")


# ── Self-consistency voting (audit 1.5) ──────────────────────────────────────
# A single VLM pass is high-variance. We run the judgement N times and aggregate
# CONSERVATIVELY: median probability, majority verdict (ties break to the more
# suspicious side), and we keep only the defects / metadata-mismatches that a
# MAJORITY of runs agree on — so one flaky optimistic run can't pass a fake and
# one flaky pessimistic run can't fail a genuine.

# Lower = more suspicious; used for conservative tie-breaks.
_VERDICT_ORDER = {"counterfeit": 0, "suspicious": 1, "unknown": 2, "authentic": 3}
_ATTR_ORDER = {"mismatch": 0, "unclear": 1, "na": 2, "": 3, "match": 4}


def _majority(values: List[str], order: Dict[str, int]) -> str:
    """Most common value; ties resolved to the most conservative (lowest order)."""
    from collections import Counter

    counts = Counter(v for v in values if v is not None)
    if not counts:
        return "unknown"
    top = max(counts.values())
    tied = [v for v, c in counts.items() if c == top]
    return min(tied, key=lambda v: order.get(v, 99))


def _call_api_repeated(
    messages: List[Dict[str, Any]], n: int, temperature: Optional[float]
) -> List[Optional[Dict[str, Any]]]:
    """Call the VLM `n` times, parallelised client-side (bounded)."""
    from concurrent.futures import ThreadPoolExecutor

    workers = max(1, min(n, cfg.VLM_SELF_CONSISTENCY_MAX_PARALLEL))
    results: List[Optional[Dict[str, Any]]] = [None] * n
    with ThreadPoolExecutor(max_workers=workers) as ex:
        futures = {ex.submit(_call_api, messages, temperature): i for i in range(n)}
        for fut, i in futures.items():
            try:
                results[i] = fut.result()
            except Exception as exc:  # never let one call kill the batch
                results[i] = {"__error__": str(exc)}
    return results


def _aggregate_votes(normalized: List[Dict[str, Any]], n_requested: int) -> Optional[Dict[str, Any]]:
    """Combine several normalized VLM results into one conservative verdict."""
    import math
    import statistics
    from collections import Counter

    avail = [r for r in normalized if r.get("available")]
    if not avail:
        return None
    k = len(avail)
    threshold = math.ceil(k / 2)  # a defect/mismatch must appear in >= half the runs

    probs = [r["authenticity_probability"] for r in avail if r.get("authenticity_probability") is not None]
    probability = round(statistics.median(probs), 6) if probs else None
    verdict = _majority([r.get("verdict", "unknown") for r in avail], _VERDICT_ORDER)

    # Defects agreed by >= threshold runs (counted once per run, keyed by attr+severity).
    dcount: Counter = Counter()
    drep: Dict[Any, Dict[str, Any]] = {}
    for r in avail:
        seen = set()
        for d in r.get("defects") or []:
            key = (str(d.get("attribute", "")).lower(), d.get("severity", "minor"))
            if key in seen:
                continue
            seen.add(key)
            dcount[key] += 1
            drep.setdefault(key, d)
    defects = [drep[key] for key, c in dcount.items() if c >= threshold]

    # Per-attribute majority (conservative tie-break toward "mismatch").
    attr_values: Dict[str, List[str]] = {}
    for r in avail:
        for key, val in (r.get("attribute_checks") or {}).items():
            attr_values.setdefault(key, []).append(val)
    attribute_checks = {key: _majority(vals, _ATTR_ORDER) for key, vals in attr_values.items()}

    # Metadata field flagged mismatch only if >= threshold runs say match is False.
    meta_false: Counter = Counter()
    meta_rep: Dict[str, Dict[str, Any]] = {}
    for r in avail:
        seen = set()
        for m in r.get("metadata_consistency") or []:
            field = str(m.get("field", "")).strip().lower()
            if not field or field in seen:
                continue
            seen.add(field)
            if m.get("match") is False:
                meta_false[field] += 1
                meta_rep.setdefault(field, m)
    metadata_consistency = [meta_rep[f] for f, c in meta_false.items() if c >= threshold]

    verdicts = [r.get("verdict", "unknown") for r in avail]
    explanation = (
        f"Self-consistency over {k}/{n_requested} VLM runs "
        f"(verdicts: {dict(Counter(verdicts))}; median P(genuine)="
        f"{probability if probability is not None else 'n/a'}). "
        "Reported defects/mismatches are those a majority of runs agreed on."
    )

    return {
        "available": True,
        "method": f"api_voting_{k}",
        "verdict": verdict,
        "authenticity_probability": probability,
        "attribute_checks": attribute_checks,
        "defects": defects,
        "metadata_consistency": metadata_consistency,
        "explanation": explanation,
        "raw": {
            "votes": [
                {"verdict": r.get("verdict"), "probability": r.get("authenticity_probability")}
                for r in avail
            ]
        },
        "error": None,
        "vote_count": k,
        "votes_requested": n_requested,
    }


def verify_product_authenticity_voting(
    customer_images: List[Dict[str, Any]],
    reference_images: List[Dict[str, Any]],
    product: Optional[Dict[str, Any]] = None,
    n: Optional[int] = None,
) -> Dict[str, Any]:
    """Self-consistency VLM authentication (audit 1.5).

    Builds the prompt ONCE (crops/refs computed a single time), calls the model
    N times, and returns a conservatively-aggregated result of the same shape as
    verify_product_authenticity so the decision layer is unchanged. N=1 is exactly
    the single-pass behaviour.
    """
    if not cfg.VLM_ENABLED:
        return _unavailable("vlm_disabled")
    if cfg.VLM_DEV_MOCK and not cfg.VLM_API_URL:
        return _dev_mock()
    if not customer_images:
        return _unavailable("no_customer_images")

    n = cfg.VLM_SELF_CONSISTENCY_N if n is None else n
    n = max(1, int(n))

    messages = _build_messages(customer_images, reference_images, product)
    if messages is None:
        return _unavailable("no_encodable_images")

    if n == 1:
        raw = _call_api(messages)
        if raw is None:
            return _unavailable("vlm_no_response")
        if "__error__" in raw:
            return _unavailable(f"vlm_error:{raw['__error__']}")
        return _normalize_result(raw, method="api")

    raw_results = _call_api_repeated(messages, n, cfg.VLM_SELF_CONSISTENCY_TEMPERATURE)
    normalized = [
        _normalize_result(r, method="api")
        for r in raw_results
        if r is not None and "__error__" not in r
    ]
    if not normalized:
        # Surface a representative error so the caller fails closed with a reason.
        err = next(
            (r.get("__error__") for r in raw_results if r and "__error__" in r),
            "vlm_no_response",
        )
        return _unavailable(f"vlm_error:{err}" if err != "vlm_no_response" else err)

    agg = _aggregate_votes(normalized, n)
    return agg if agg is not None else _unavailable("vlm_no_response")


# ── Product Authentication Profile (built ONCE at product creation) ───────────
# The heavy "understand this genuine product" reasoning is done here, at
# creation time, over the vendor metadata + all reference views. The result is a
# rich ground-truth spec cached on the product, so SCAN-time only has to compare
# a customer image against a known spec (faster, more accurate).

def _profile_system_prompt() -> str:
    return (
        "You are a product-authentication analyst building a GROUND-TRUTH profile of a "
        "GENUINE product from its official reference images and registered metadata. "
        "This profile is later used to detect counterfeits, so be precise and state ONLY "
        "what you can actually observe in the reference images or that is given in the "
        "metadata. Read every piece of visible text and catalogue every distinguishing "
        "and security feature. Do not invent features the product does not have."
    )


def _profile_instruction(declared_metadata: Optional[Dict[str, Any]]) -> str:
    schema = (
        "{\n"
        '  "summary": "<1-2 sentence description of the genuine product>",\n'
        '  "readable_text": {"<view e.g. front/back/label>": ["<exact text line>", ...]},\n'
        '  "identifiers": {"barcode": "<value or none>", "batch_format": "<pattern/example or none>", "serial_format": "<pattern/example or none>"},\n'
        '  "security_features": [{"feature": "<hologram|seal|watermark|security_print|qr|barcode|other>", "view": "<view>", "location": "<where on the product>", "appearance": "<what it looks like>"}],\n'
        '  "visual_signature": {"logo": "<logo design & placement>", "fonts": "<notable fonts/weights>", "colors": ["<dominant colours>"], "layout": "<layout notes>"},\n'
        '  "metadata_on_product": [{"field": "<metadata field>", "declared": "<registered value>", "visible": true, "printed_value": "<what is printed on the product, or null>"}],\n'
        '  "must_have": ["<the key features a genuine unit MUST show, for scan-time checking>"]\n'
        "}"
    )
    return (
        "TASK: Build a complete AUTHENTICATION PROFILE of this GENUINE product from the "
        "REFERENCE images and the registered metadata below.\n\n"
        "Registered metadata (vendor-provided):\n"
        f"{_build_metadata_block(declared_metadata)}\n\n"
        "From the reference images, extract EVERYTHING that identifies a genuine unit: all "
        "readable text/numbers per view; the format of any batch/lot/serial codes; every "
        "security feature actually present (hologram, seal, watermark, security print, QR, "
        "barcode) with its location and appearance; the logo design and placement; notable "
        "fonts, colours and layout; and any distinguishing marks. For each registered "
        "metadata field, note whether it is visibly printed on the product and its printed "
        "value. Only include features that are ACTUALLY present in the references — do NOT "
        "invent expectations; if a product has no hologram/batch/seal, simply omit it.\n\n"
        "Respond with ONLY a single JSON object (no markdown fences, no prose) of exactly "
        "this shape:\n"
        f"{schema}"
    )


def _build_profile_messages(
    reference_images: List[Dict[str, Any]],
    declared_metadata: Optional[Dict[str, Any]],
) -> Optional[List[Dict[str, Any]]]:
    content: List[Dict[str, Any]] = [
        {"type": "text", "text": _profile_instruction(declared_metadata)},
        {"type": "text", "text": "=== REFERENCE IMAGES (genuine product) ==="},
    ]
    attached = 0
    for ref in reference_images:
        if attached >= cfg.VLM_MAX_IMAGES:
            break
        url = _encode_image(ref.get("bytes", b""))
        if not url:
            continue
        content.append({"type": "text", "text": f"REFERENCE — view: {ref.get('view', 'unknown')}"})
        content.append({"type": "image_url", "image_url": {"url": url}})
        attached += 1
    if attached == 0:
        return None
    return [
        {"role": "system", "content": _profile_system_prompt()},
        {"role": "user", "content": content},
    ]


def render_profile_spec(extracted: Dict[str, Any], declared_metadata: Optional[Dict[str, Any]]) -> str:
    """Render the structured extraction into a compact text spec for the scan prompt."""
    if not isinstance(extracted, dict):
        return _build_metadata_block(declared_metadata)
    lines: List[str] = []

    summary = str(extracted.get("summary", "")).strip()
    if summary:
        lines.append(summary)

    md = _build_metadata_block(declared_metadata)
    if md and "no registered metadata" not in md:
        lines.append("\nRegistered metadata:")
        lines.append(md)

    rt = extracted.get("readable_text") or {}
    if isinstance(rt, dict) and rt:
        lines.append("\nText visible on the genuine product (by view):")
        for view, items in rt.items():
            if isinstance(items, list) and items:
                joined = "; ".join(str(x).strip() for x in items if str(x).strip())
                if joined:
                    lines.append(f"  - {view}: {joined}")

    ids = extracted.get("identifiers") or {}
    if isinstance(ids, dict):
        idbits = [f"{k}={v}" for k, v in ids.items() if v and str(v).strip().lower() not in ("none", "na", "null")]
        if idbits:
            lines.append("\nIdentifiers: " + ", ".join(idbits))

    sec = extracted.get("security_features") or []
    if isinstance(sec, list) and sec:
        lines.append("\nSecurity features present on the genuine product:")
        for s in sec:
            if not isinstance(s, dict):
                continue
            feat = str(s.get("feature", "")).strip()
            where = str(s.get("view", "")).strip() or str(s.get("location", "")).strip()
            appearance = str(s.get("appearance", "")).strip()
            if feat:
                lines.append(f"  - {feat} ({where}): {appearance}".rstrip(": ").strip())

    vs = extracted.get("visual_signature") or {}
    if isinstance(vs, dict):
        vbits = [f"{k}: {v}" for k, v in vs.items() if v and str(v).strip()]
        if vbits:
            lines.append("\nVisual signature — " + "; ".join(vbits[:4]))

    mh = extracted.get("must_have") or []
    if isinstance(mh, list) and mh:
        lines.append("\nA GENUINE unit must show: " + "; ".join(str(x).strip() for x in mh if str(x).strip()))

    spec = "\n".join(lines).strip()
    return spec or _build_metadata_block(declared_metadata)


def extract_product_profile(
    reference_images: List[Dict[str, Any]],
    declared_metadata: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Build the genuine-product authentication profile from reference images.

    reference_images: [{"view": view_type, "bytes": ...}]  (the official genuine views)
    Returns {status: ready|failed, spec, extracted, model, source_image_count, error}.
    On any failure the caller should store status='failed' and the scan path falls
    back to the raw-metadata prompt (backward compatible).
    """
    if not cfg.VLM_ENABLED:
        return {"status": "failed", "error": "vlm_disabled", "spec": "", "extracted": None,
                "model": cfg.VLM_MODEL, "source_image_count": 0}
    if cfg.VLM_DEV_MOCK and not cfg.VLM_API_URL:
        return {"status": "failed", "error": "dev_mock", "spec": "", "extracted": None,
                "model": cfg.VLM_MODEL, "source_image_count": 0}
    if not reference_images:
        return {"status": "failed", "error": "no_reference_images", "spec": "", "extracted": None,
                "model": cfg.VLM_MODEL, "source_image_count": 0}

    messages = _build_profile_messages(reference_images, declared_metadata)
    if messages is None:
        return {"status": "failed", "error": "no_encodable_images", "spec": "", "extracted": None,
                "model": cfg.VLM_MODEL, "source_image_count": 0}

    raw = _call_api(messages)
    if raw is None:
        return {"status": "failed", "error": "vlm_no_response", "spec": "", "extracted": None,
                "model": cfg.VLM_MODEL, "source_image_count": len(reference_images)}
    if "__error__" in raw:
        return {"status": "failed", "error": f"vlm_error:{raw['__error__']}", "spec": "",
                "extracted": None, "model": cfg.VLM_MODEL, "source_image_count": len(reference_images)}

    spec = render_profile_spec(raw, declared_metadata)
    return {
        "status": "ready",
        "spec": spec,
        "extracted": raw,
        "model": cfg.VLM_MODEL,
        "source_image_count": len(reference_images),
        "error": None,
    }
