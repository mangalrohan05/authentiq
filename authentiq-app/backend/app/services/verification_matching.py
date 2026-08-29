"""
Category-aligned OpenCLIP verification with alignment-aware ROI scoring (v6).

Per-slot pipeline:
    1. Slot-filtered references → global CLIP cosine → pick best reference
    2. ORB + RANSAC homography → warp customer onto reference geometry
    3. OpenCLIP on aligned image + YOLO/patch regions (aligned when possible)
    4. ROI SSIM/MSE/color on logo, hologram, serial, label, qr
    5. OCR text match + structured product-field fuzzy verification (label slot)
    6. Weighted ensemble + ROI fraud penalty → slot score
    7. Dynamic slot weighting: label 45% > front 30% > back 20% > proof 5%
       (proof slot absent → weight redistributed proportionally)
"""

from __future__ import annotations

import logging
import os
import tempfile
import time
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

import numpy as np

from app.services.alignment_service import align_customer_to_reference, alignment_meta_for_api
from app.services.embedding_compat import embedding_matches_model, normalize_view_type
from app.services.image_paths import resolve_image_fs_path
from app.services import vlm_config, vlm_decision
from app.services.qwen_vl_service import (
    verify_product_authenticity,
    verify_product_authenticity_voting,
)
from app.services.pipeline_config import (
    ALIGN_MIN_INLIERS,
    ALIGN_ROI_MIN_FOR_ENSEMBLE,
    pipeline_config_snapshot,
)
from app.services.roi_pixel_service import compare_aligned_roi_metrics
from app.services.ocr_service import (
    extract_text_from_image_bytes,
    extract_text_structured,
    fuzzy_text_similarity,
    verify_ocr_fields,
)
from app.services.openclip_service import (
    cosine_similarity,
    generate_embedding_from_bytes,
    get_active_model_signature,
    get_model_singleton,
    verification_strength_label,
)
from app.services.dimension_service import compute_dimension_similarity_from_bytes
from app.services.feature_matching_service import (
    match_features,
    feature_config_snapshot,
)
from app.services.patch_embeddings import (
    GLOBAL_PATCH_BLEND,
    PATCH_ENABLED_SLOTS,
    compute_patch_stats,
    generate_patch_embeddings_from_bytes,
    max_patch_similarity,
)
from app.services.region_embeddings import (
    EMBEDDING_STRATEGY_VERSION,
    compare_region_sets,
    generate_region_embeddings_from_bytes,
)
from app.services.region_scoring_config import (
    SLOT_VISUAL_BLEND,
    YOLO_ENABLED,
    scoring_config_snapshot,
)
from app.services.threshold_config import resolve_verification_thresholds

logger = logging.getLogger(__name__)
# Add temporary file handler for debugging (cross-platform temp dir)
_verification_log_path = Path(tempfile.gettempdir()) / "authentiq_verification.log"
_log_path_str = str(_verification_log_path.resolve())

# We check if a FileHandler with this path is already registered.
# Only if not, we instantiate and add it, preventing file handle leaks and duplicate logs.
has_handler = False
for h in logger.handlers:
    if isinstance(h, logging.FileHandler):
        try:
            if str(Path(h.baseFilename).resolve()) == _log_path_str:
                has_handler = True
                break
        except Exception:
            pass

if not has_handler:
    fh = logging.FileHandler(_verification_log_path)
    fh.setLevel(logging.INFO)
    formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
    fh.setFormatter(formatter)
    logger.addHandler(fh)

CUSTOMER_SLOT_VENDOR_VIEWS: Dict[str, List[str]] = {
    "front": ["front", "front_view"],
    "back": ["back", "back_view", "packaging"],
    "label": ["labels", "holograms", "barcode_qr", "seals"],
    "proof": ["other", "side", "additional_markers", "seals", "proof"],
}

CUSTOMER_FIELD_ALIASES: Dict[str, str] = {"packaging": "back"}

# Base weights for dynamic slot weighting system.
# Label carries the most weight (identity-critical), proof is optional.
# When proof is absent, its weight is redistributed proportionally.
_BASE_SLOT_WEIGHTS: Dict[str, float] = {
    "label": 0.45,
    "front": 0.30,
    "back": 0.20,
    "proof": 0.05,
}
CORE_SCORING_SLOTS = ("front", "back", "label")
EXTENDED_SCORING_SLOTS = ("front", "back", "label", "proof")
OPTIONAL_SLOTS = frozenset({"proof"})


def get_dynamic_slot_weights(active_slots: List[str]) -> Dict[str, float]:
    """
    Compute normalized slot weights for the given set of active (scored) slots.

    Base weights: label=0.45, front=0.30, back=0.20, proof=0.05
    If a slot is absent its base weight is redistributed proportionally
    across the remaining active slots so the total always sums to 1.0.

    Args:
        active_slots: list of slot names that were actually scored.

    Returns:
        dict mapping slot -> normalized weight (sums to 1.0).
    """
    present = {s for s in active_slots if s in _BASE_SLOT_WEIGHTS}
    absent = {s for s in _BASE_SLOT_WEIGHTS if s not in present}

    if not present:
        n = len(active_slots)
        return {s: 1.0 / n for s in active_slots} if n else {}

    base_present = sum(_BASE_SLOT_WEIGHTS[s] for s in present)
    absent_weight = sum(_BASE_SLOT_WEIGHTS[s] for s in absent)

    if base_present <= 0:
        return {s: 1.0 / len(present) for s in present}

    weights: Dict[str, float] = {}
    for s in present:
        base = _BASE_SLOT_WEIGHTS[s]
        weights[s] = base + (absent_weight * base / base_present)

    total = sum(weights.values())
    if total > 0 and abs(total - 1.0) > 1e-9:
        weights = {s: w / total for s, w in weights.items()}

    return weights

def canonical_customer_slot(image_type: str) -> str:
    key = normalize_view_type(image_type)
    return CUSTOMER_FIELD_ALIASES.get(key, key)


def filter_references_for_slot(
    cached_images: List[dict],
    slot: str,
    model_sig: Dict[str, str],
) -> Tuple[List[dict], bool]:
    allowed = {normalize_view_type(v) for v in CUSTOMER_SLOT_VENDOR_VIEWS.get(slot, [])}
    compatible = [
        img
        for img in cached_images
        if img.get("embedding_vector") and embedding_matches_model(img, model_sig)
    ]
    if not compatible:
        # Last resort: any reference with a vector (e.g. legacy tags missing pretrained)
        from app.services.embedding_compat import EXPECTED_EMBEDDING_DIM

        legacy = [
            img
            for img in cached_images
            if img.get("embedding_vector")
            and len(img.get("embedding_vector") or []) == EXPECTED_EMBEDDING_DIM
        ]
        if legacy:
            logger.warning(
                "[Verify] No refs passed strict model filter; using %d legacy embedding(s)",
                len(legacy),
            )
            compatible = legacy
    if not compatible:
        return [], False

    matched = [img for img in compatible if normalize_view_type(img.get("view_type")) in allowed]
    if matched:
        return matched, False

    logger.warning(
        "[Verify] No reference views for slot=%s (allowed=%s); fallback to %d compatible refs",
        slot,
        sorted(allowed),
        len(compatible),
    )
    return compatible, True


def calibrate_similarity(sim: float) -> float:
    """
    Calibrate raw OpenCLIP/regional cosine similarity to improve separation.
    Maps:
      - [0.0, 0.65] -> [0.0, 0.30] (factor of 0.4615)
      - [0.65, 0.80] -> [0.30, 0.80] (linear interpolation)
      - [0.80, 1.00] -> [0.80, 1.00] (identity)
    """
    if sim <= 0.0:
        return 0.0
    if sim <= 0.65:
        return float(sim * (0.30 / 0.65))
    if sim >= 0.80:
        return float(min(1.0, sim))
    return float(0.30 + (sim - 0.65) * (0.50 / 0.15))


def _load_reference_bytes(ref_img: dict) -> Optional[bytes]:
    url = ref_img.get("url", "")
    path = resolve_image_fs_path(url)
    if not path or not os.path.isfile(path):
        return None
    try:
        with open(path, "rb") as f:
            return f.read()
    except OSError as exc:
        logger.warning("[Verify] Could not load reference image %s: %s", path, exc)
        return None


def _pick_best_reference(
    matched_refs: List[dict],
    per_ref: List[Dict[str, Any]],
) -> Optional[dict]:
    if not matched_refs:
        return None
    if not per_ref:
        return matched_refs[0]
    by_id = {img.get("id"): img for img in matched_refs}
    best_entry = max(per_ref, key=lambda p: p.get("similarity", 0.0))
    ref_id = best_entry.get("reference_id")
    if ref_id and ref_id in by_id:
        return by_id[ref_id]
    return matched_refs[0]


def _load_reference_patches(ref_img: dict) -> List[Dict[str, Any]]:
    stored = ref_img.get("patch_embeddings")
    if stored:
        return list(stored)
    url = ref_img.get("url", "")
    path = resolve_image_fs_path(url)
    if not path or not os.path.isfile(path):
        return []
    try:
        with open(path, "rb") as f:
            return generate_patch_embeddings_from_bytes(f.read())
    except OSError as exc:
        logger.warning("[Verify] Could not load reference patches %s: %s", path, exc)
        return []


def _global_similarity_for_slot(
    query_embedding: List[float],
    matched_refs: List[dict],
) -> Tuple[float, List[Dict[str, Any]]]:
    per_ref: List[Dict[str, Any]] = []
    sims: List[float] = []
    logger.info(f"[_global_similarity_for_slot] START. Matched refs count: {len(matched_refs)}")
    for img in matched_refs:
        sim = cosine_similarity(query_embedding, img["embedding_vector"])
        view = normalize_view_type(img.get("view_type"))
        per_ref.append({"view_type": view, "similarity": sim, "reference_id": img.get("id")})
        sims.append(sim)
        logger.info(f"[_global_similarity_for_slot] Ref: {img.get('id')} View: {view} Similarity: {sim}")
    
    sorted_sims = sorted(sims, reverse=True)
    if len(sorted_sims) == 0:
        best_sim = 0.0
    elif len(sorted_sims) == 1:
        best_sim = sorted_sims[0]
    elif len(sorted_sims) == 2:
        best_sim = 0.70 * sorted_sims[0] + 0.30 * sorted_sims[1]
    else:
        best_sim = 0.60 * sorted_sims[0] + 0.30 * sorted_sims[1] + 0.10 * sorted_sims[2]
        
    best_sim = float(best_sim)
    logger.info(f"[_global_similarity_for_slot] Selected best similarity: {best_sim}")
    return best_sim, per_ref

def _patch_similarity_for_slot(
    customer_patches: List[Dict[str, Any]],
    matched_refs: List[dict],
) -> float:
    """Best max-patch similarity across all reference images (backward-compat)."""
    if not customer_patches:
        return 0.0
    best = 0.0
    for ref in matched_refs:
        ref_patches = _load_reference_patches(ref)
        if ref_patches:
            best = max(best, max_patch_similarity(customer_patches, ref_patches, cosine_similarity))
    return float(best)


def _patch_stats_for_slot(
    customer_patches: List[Dict[str, Any]],
    matched_refs: List[dict],
) -> Dict[str, Any]:
    """Aggregate avg/min/max patch stats across best-matching reference image."""
    if not customer_patches:
        return {"avg": 0.0, "min": 0.0, "max": 0.0, "count": 0}
    best_stats: Dict[str, Any] = {"avg": 0.0, "min": 0.0, "max": 0.0, "count": 0}
    for ref in matched_refs:
        ref_patches = _load_reference_patches(ref)
        if ref_patches:
            stats = compute_patch_stats(customer_patches, ref_patches, cosine_similarity)
            if stats["avg"] > best_stats["avg"]:
                best_stats = stats
    return best_stats


def _ocr_similarity_for_slot(
    customer_bytes: Optional[bytes],
    matched_refs: List[dict],
    *,
    structured: bool = False,
    product: Optional[Dict[str, Any]] = None,
) -> Tuple[Optional[float], str, Optional[Dict]]:
    """
    Run OCR on the customer image and compare against reference OCR text.
    When `product` is provided, also runs structured product-field fuzzy
    verification (name, brand, manufacturer, MRP, pack size, batch, dates)
    using verify_ocr_fields() and blends the result into the final score.

    Returns:
        (ocr_similarity | None, engine_name, ocr_fields | None)
        ocr_fields includes both raw field extraction AND product metadata
        match details under the key 'product_field_verification'.
    """
    if not customer_bytes:
        return None, "none", None

    if structured:
        structured_result = extract_text_structured(customer_bytes)
        cust_text = structured_result.get("normalized_text", "")
        cust_engine = structured_result.get("engine", "none")
        ocr_fields: Optional[Dict] = structured_result.get("fields")
    else:
        cust_text, cust_engine = extract_text_from_image_bytes(customer_bytes)
        ocr_fields = None

    if not cust_text:
        return None, cust_engine, ocr_fields

    # ── Reference-image text comparison ──────────────────────────────────────
    ref_sim = 0.0
    for ref in matched_refs:
        ref_text = ref.get("ocr_text_normalized") or ""
        if not ref_text and ref.get("url"):
            path = resolve_image_fs_path(ref.get("url", ""))
            if path and os.path.isfile(path):
                try:
                    with open(path, "rb") as f:
                        ref_text, _ = extract_text_from_image_bytes(f.read())
                except OSError:
                    ref_text = ""
        if ref_text:
            ref_sim = max(ref_sim, fuzzy_text_similarity(cust_text, ref_text))

    # ── Product metadata field verification ──────────────────────────────────
    final_score = ref_sim
    product_field_details: Optional[Dict] = None
    if product:
        prod_score, prod_details = verify_ocr_fields(cust_text, product)
        product_field_details = prod_details
        if prod_details.get("fields_checked", 0) > 0:
            # Blend: 60% reference-image similarity + 40% product-metadata match
            final_score = 0.60 * ref_sim + 0.40 * prod_score
            logger.debug(
                "[OCR] Blended score: ref_sim=%.3f prod_score=%.3f -> %.3f",
                ref_sim, prod_score, final_score,
            )

    if product_field_details is not None:
        if ocr_fields is None:
            ocr_fields = {}
        ocr_fields["product_field_verification"] = product_field_details

    return float(final_score) if final_score > 0 else None, cust_engine, ocr_fields


def _combine_visual_score(
    global_sim: float,
    patch_sim: float,
    use_patch: bool,
    regional_sim: float = 0.0,
    use_regional: bool = False,
) -> float:
    if use_regional and regional_sim > 0:
        g = SLOT_VISUAL_BLEND["global"]
        r = SLOT_VISUAL_BLEND["regional"]
        base = float(g * global_sim + r * regional_sim)
    else:
        base = global_sim

    if not use_patch:
        return base
    pg = GLOBAL_PATCH_BLEND["global"]
    pp = GLOBAL_PATCH_BLEND["patch"]
    if patch_sim <= 0:
        return base
    return float(pg * base + pp * patch_sim)


def _load_reference_regions(ref_img: dict) -> List[Dict[str, Any]]:
    stored = ref_img.get("region_embeddings")
    if stored:
        return list(stored)
    url = ref_img.get("url", "")
    path = resolve_image_fs_path(url)
    if not path or not os.path.isfile(path):
        return []
    try:
        with open(path, "rb") as f:
            payload = generate_region_embeddings_from_bytes(f.read())
        return payload.get("regions") or []
    except OSError as exc:
        logger.warning("[Verify] Could not load reference regions %s: %s", path, exc)
        return []


def _regional_similarity_for_slot(
    customer_regions: List[Dict[str, Any]],
    matched_refs: List[dict],
) -> Tuple[float, Dict[str, float]]:
    if not customer_regions:
        return 0.0, {}
    ref_region_lists = []
    for ref in matched_refs:
        regs = _load_reference_regions(ref)
        if regs:
            ref_region_lists.append(regs)
    if not ref_region_lists:
        return 0.0, {}
    cmp = compare_region_sets(customer_regions, ref_region_lists)
    return float(cmp["regional_score"]), cmp.get("region_scores") or {}


def score_slot(
    query_embedding: List[float],
    cached_images: List[dict],
    slot: str,
    model_sig: Dict[str, str],
    *,
    image_bytes: Optional[bytes] = None,
    product: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Score one customer slot (v6: dimension + feature matching + RANSAC + OCR product fields)."""
    matched_refs, used_fallback = filter_references_for_slot(cached_images, slot, model_sig)
    use_patch = slot in PATCH_ENABLED_SLOTS
    use_regional = YOLO_ENABLED and bool(image_bytes)

    global_sim, per_ref = _global_similarity_for_slot(query_embedding, matched_refs)
    # Calibrate OpenCLIP similarities to improve separation for different products
    global_sim = calibrate_similarity(global_sim)
    for entry in per_ref:
        entry["similarity"] = calibrate_similarity(entry["similarity"])
    best_ref = _pick_best_reference(matched_refs, per_ref)

    alignment_meta: Dict[str, Any] = {"success": False, "message": "no_customer_image"}
    aligned_clip_sim: Optional[float] = None
    align_roi_sim: Optional[float] = None
    region_pixel_scores: Dict[str, Any] = {}
    alignment_reliable = False

    # New multi-stage pipeline components
    dimension_sim: Optional[float] = None
    dimension_metadata: Dict[str, Any] = {}
    feature_match_result: Dict[str, Any] = {}
    feature_match_score: Optional[float] = None
    ransac_score: Optional[float] = None

    if image_bytes and best_ref:
        ref_bytes = _load_reference_bytes(best_ref)
        if ref_bytes:
            # Stage 1: Dimension/Aspect Ratio Similarity
            dimension_result = compute_dimension_similarity_from_bytes(ref_bytes, image_bytes)
            dimension_sim = dimension_result.get("dimension_similarity")
            dimension_metadata = {
                "reference_width": dimension_result.get("reference_metadata", {}).get("width"),
                "reference_height": dimension_result.get("reference_metadata", {}).get("height"),
                "reference_aspect_ratio": dimension_result.get("reference_aspect_ratio"),
                "query_width": dimension_result.get("query_metadata", {}).get("width"),
                "query_height": dimension_result.get("query_metadata", {}).get("height"),
                "query_aspect_ratio": dimension_result.get("query_aspect_ratio"),
                "aspect_ratio_diff": dimension_result.get("aspect_ratio_diff"),
                "passes_threshold": dimension_result.get("passes_threshold"),
            }
            logger.info(
                f"[Verify] Dimension check for slot={slot}: "
                f"ref_ar={dimension_result.get('reference_aspect_ratio', 0):.3f}, "
                f"query_ar={dimension_result.get('query_aspect_ratio', 0):.3f}, "
                f"sim={dimension_sim:.3f}"
            )
            
            if not dimension_result.get("passes_threshold"):
                logger.info(
                    "[Verify] Dimension check flagged slot=%s (aspect-ratio mismatch); "
                    "recording as a signal for the VLM instead of hard-rejecting.",
                    slot,
                )

            # Stage 2: Feature Matching (SuperPoint+LightGlue or ORB)
            feature_match_result = match_features(image_bytes, ref_bytes)
            H_matrix = feature_match_result.get("H")
            inlier_count = feature_match_result.get("inliers", 0)
            good_matches = feature_match_result.get("good_matches", 0)
            
            if feature_match_result.get("success"):
                feature_match_score = feature_match_result.get("match_ratio")
                ransac_score = feature_match_result.get("ransac_score")
                logger.info(
                    f"[Verify] Feature matching for slot={slot}: "
                    f"method={feature_match_result.get('method')}, "
                    f"match_ratio={feature_match_score:.3f}, "
                    f"ransac_score={ransac_score:.3f}"
                )

            # Stage 3: Alignment (ORB + RANSAC homography)
            try:
                alignment_meta = align_customer_to_reference(
                    image_bytes, 
                    ref_bytes, 
                    H=H_matrix, 
                    inlier_count=inlier_count, 
                    good_matches=good_matches
                )
                inliers = int(alignment_meta.get("inlier_count") or 0)
                alignment_reliable = bool(
                    alignment_meta.get("success")
                    and inliers >= ALIGN_MIN_INLIERS
                )
                if alignment_meta.get("success") and alignment_meta.get("aligned_bytes"):
                    aligned_bytes = alignment_meta["aligned_bytes"]
                    roi_metrics = compare_aligned_roi_metrics(ref_bytes, aligned_bytes)
                    raw_roi = roi_metrics.get("align_roi_score")
                    regions_compared = int(roi_metrics.get("regions_compared") or 0)
                    region_pixel_scores = roi_metrics.get("region_pixel_scores") or {}
                    if (
                        alignment_reliable
                        and regions_compared >= 2
                        and raw_roi is not None
                        and float(raw_roi) >= ALIGN_ROI_MIN_FOR_ENSEMBLE
                    ):
                        align_roi_sim = float(raw_roi)

                    aligned_emb = generate_embedding_from_bytes(
                        aligned_bytes, source=f"aligned_{slot}"
                    )
                    if aligned_emb.get("success") and best_ref.get("embedding_vector"):
                        raw_aligned_sim = cosine_similarity(
                            aligned_emb["embedding"],
                            best_ref["embedding_vector"],
                        )
                        aligned_clip_sim = calibrate_similarity(raw_aligned_sim)
            except Exception as exc:
                logger.warning("[Verify] Alignment/ROI skipped for slot=%s: %s", slot, exc)
                alignment_meta = {"success": False, "message": str(exc)}

    # YOLO / patch on original customer photo (warped images break regional CLIP)
    customer_patches: List[Dict[str, Any]] = []
    if use_patch and image_bytes:
        customer_patches = generate_patch_embeddings_from_bytes(image_bytes)

    customer_regions: List[Dict[str, Any]] = []
    region_meta: Dict[str, Any] = {}
    if use_regional and image_bytes:
        reg_payload = generate_region_embeddings_from_bytes(image_bytes)
        customer_regions = reg_payload.get("regions") or []
        region_meta = reg_payload.get("meta") or {}

    compare_refs = matched_refs
    patch_sim = (
        _patch_similarity_for_slot(customer_patches, compare_refs) if use_patch else None
    )
    if patch_sim is not None:
        patch_sim = calibrate_similarity(patch_sim)

    regional_sim, region_scores = (
        _regional_similarity_for_slot(customer_regions, compare_refs)
        if use_regional
        else (0.0, {})
    )
    if use_regional:
        regional_sim = calibrate_similarity(regional_sim)

    ocr_sim: Optional[float] = None
    ocr_engine = "none"
    ocr_fields: Optional[Dict[str, Any]] = None
    if slot == "label":
        ocr_sim, ocr_engine, ocr_fields = _ocr_similarity_for_slot(
            image_bytes, compare_refs, structured=True, product=product
        )

    # ── v7: slot_score is a CLIP VISUAL-RETRIEVAL indicator only ──────────────
    # It shows how well this slot matches the reference views. It is NO LONGER
    # the authenticity decision — that is made holistically by the VLM stage in
    # run_verification_scoring(). No ensemble average, no optimistic score floors,
    # no per-slot VLM nudge. This is the fix for minor counterfeits scoring high:
    # a high visual match here does not by itself imply "authentic".
    visual_score = _combine_visual_score(
        global_sim,
        float(patch_sim or 0.0),
        use_patch and bool(patch_sim),
        regional_sim,
        use_regional and regional_sim > 0,
    )
    slot_score = float(min(1.0, max(0.0, visual_score)))
    fraud_penalty_applied = False
    fraud_penalty = 0.0
    clip_breakdown = {
        "global_clip": round(float(global_sim), 4),
        "aligned_clip": round(float(aligned_clip_sim), 4) if aligned_clip_sim is not None else None,
        "regional": round(float(regional_sim), 4) if use_regional else None,
        "patch": round(float(patch_sim), 4) if patch_sim is not None else None,
        "ocr": round(float(ocr_sim), 4) if ocr_sim is not None else None,
        "note": "CLIP retrieval signals only — VLM makes the authenticity decision",
    }

    # Per-slot VLM removed: authenticity is decided by ONE holistic VLM call over
    # all slots + all reference views + product metadata (see run_verification_scoring).
    vlm_result: Optional[Dict[str, Any]] = None
    vlm_applied = False
    vlm_verdict = "none"

    method = "v7_clip_retrieval_vlm_primary"
    if slot == "label":
        method += "_ocr"

    return {
        "slot": slot,
        "slot_score": slot_score,
        "global_similarity": global_sim,
        "aligned_clip_similarity": aligned_clip_sim,
        "align_roi_similarity": align_roi_sim,
        "alignment": alignment_meta_for_api(alignment_meta),
        "region_pixel_scores": region_pixel_scores,
        "fraud_penalty_applied": fraud_penalty_applied,
        "fraud_penalty": fraud_penalty,
        "regional_similarity": regional_sim if use_regional else None,
        "region_scores": region_scores if use_regional else None,
        "patch_similarity": patch_sim if use_patch else None,
        "patch_stats": _patch_stats_for_slot(customer_patches, compare_refs) if use_patch else None,
        "visual_similarity": visual_score,
        "ocr_similarity": ocr_sim,
        "ocr_engine": ocr_engine,
        "ocr_fields": ocr_fields,  # structured field extraction + product metadata match details
        "score_breakdown": clip_breakdown,
        "ensemble_meta": {
            "note": "ensemble scoring removed in v7 — VLM-primary decision",
        },
        # New multi-stage pipeline results
        "dimension_similarity": dimension_sim,
        "dimension_metadata": dimension_metadata,
        "feature_match_result": {
            "method": feature_match_result.get("method"),
            "match_ratio": feature_match_result.get("match_ratio"),
            "keypoints1": feature_match_result.get("keypoints1"),
            "keypoints2": feature_match_result.get("keypoints2"),
            "good_matches": feature_match_result.get("good_matches"),
            "inliers": feature_match_result.get("inliers"),
            "outliers": feature_match_result.get("outliers"),
            "ransac_score": feature_match_result.get("ransac_score"),
            "passes_ransac_threshold": feature_match_result.get("passes_ransac_threshold"),
            "success": feature_match_result.get("success"),
        },
        "best_reference_id": best_ref.get("id") if best_ref else None,
        "max_similarity": float(max((p["similarity"] for p in per_ref), default=0.0)),
        "min_similarity": float(min((p["similarity"] for p in per_ref), default=0.0)),
        "num_comparisons": len(per_ref),
        "matched_view_types": sorted({p["view_type"] for p in per_ref}),
        "per_reference_similarities": per_ref,
        "used_fallback": used_fallback,
        "scoring_method": method,
        "patch_regions_customer": len(customer_patches),
        "yolo_regions_customer": len(customer_regions),
        "yolo_meta": region_meta if use_regional else None,
        "vlm_applied": vlm_applied,
        "vlm_verdict": vlm_verdict,
        "vlm_result": vlm_result,
    }


def compute_weighted_verification_score(slot_results: Dict[str, Dict[str, Any]]) -> float:
    """
    Compute the final weighted verification score using dynamic slot weights.

    Uses get_dynamic_slot_weights() based on active slots scored.
    Base weights: label=45%, front=30%, back=20%, proof=5%.
    Missing slots have their weight redistributed proportionally.
    """
    scored_slots = []
    for slot in EXTENDED_SCORING_SLOTS:
        if slot not in slot_results:
            logger.warning(
                "[Verify] Slot '%s' was not scored (missing in customer uploads)", slot
            )
            continue
        res = slot_results[slot]
        if res.get("num_comparisons", 0) == 0:
            logger.warning(
                "[Verify] Slot '%s' had no reference comparisons, score defaults to 0.0", slot
            )
            continue
        scored_slots.append(slot)

    if not scored_slots:
        logger.warning("[Verify] No slots could be scored against references.")
        return 0.0

    dynamic_weights = get_dynamic_slot_weights(scored_slots)
    weighted_sum = sum(
        slot_results[s]["slot_score"] * dynamic_weights.get(s, 0.0)
        for s in scored_slots
    )
    final_score = float(min(1.0, max(0.0, weighted_sum)))
    logger.info(
        "[Verify] Dynamic weighted score: %.4f | slots=%s | weights=%s",
        final_score,
        scored_slots,
        {s: round(dynamic_weights.get(s, 0.0), 3) for s in scored_slots},
    )
    return final_score


def _slot_display_name(slot: str) -> str:
    return {"front": "Front Match", "back": "Back Match", "label": "Label Match"}.get(
        slot, slot.title()
    )


# ── VLM stage helpers (v7) ───────────────────────────────────────────────────
_VLM_REFERENCE_VIEW_PRIORITY = (
    "front", "front_view", "back", "back_view", "labels", "holograms",
    "seals", "barcode_qr", "packaging", "side", "side_view",
)


def _vlm_priority_index(view_type: str) -> int:
    try:
        return _VLM_REFERENCE_VIEW_PRIORITY.index(view_type)
    except ValueError:
        return len(_VLM_REFERENCE_VIEW_PRIORITY)


def _collect_vlm_customer_images(
    customer_embeddings: List[Dict[str, Any]],
) -> List[Dict[str, Any]]:
    out: List[Dict[str, Any]] = []
    for cust in customer_embeddings:
        b = cust.get("image_bytes")
        if not b:
            continue
        out.append({"view": canonical_customer_slot(cust.get("image_type", "")), "bytes": b})
    return out


def _collect_vlm_reference_images(
    cached_images: List[dict],
    slot_results: Dict[str, Dict[str, Any]],
    num_customer_images: int,
    max_total_refs: Optional[int] = None,
) -> List[Dict[str, Any]]:
    """Pick the reference views to show the VLM: the CLIP-chosen best ref per slot,
    then broad view coverage (front/back/label + security views), bounded so the
    total image count stays within the server's per-prompt limit.

    max_total_refs, when set, further caps the reference count — used when a
    pre-built authentication profile already describes the genuine product, so a
    couple of grounding images suffice (fewer image tokens ⇒ faster scans)."""
    cap = max(1, vlm_config.VLM_MAX_IMAGES - max(0, num_customer_images))
    if max_total_refs is not None:
        cap = max(1, min(cap, int(max_total_refs)))
    by_id = {img.get("id"): img for img in cached_images if img.get("id")}

    ordered_ids: List[Any] = []
    # 1) Best reference per slot (already CLIP-matched).
    for res in slot_results.values():
        rid = res.get("best_reference_id")
        if rid and rid in by_id and rid not in ordered_ids:
            ordered_ids.append(rid)

    # 2) Coverage by view priority (ensures security views are shown).
    remaining = [
        img for img in cached_images if img.get("id") and img.get("id") not in ordered_ids
    ]
    remaining.sort(key=lambda im: _vlm_priority_index(normalize_view_type(im.get("view_type"))))
    per_view: Dict[str, int] = {}
    for img in ordered_ids:
        vt = normalize_view_type(by_id[img].get("view_type"))
        per_view[vt] = per_view.get(vt, 0) + 1
    for img in remaining:
        if len(ordered_ids) >= cap:
            break
        vt = normalize_view_type(img.get("view_type"))
        if per_view.get(vt, 0) >= vlm_config.VLM_MAX_REFS_PER_VIEW:
            continue
        ordered_ids.append(img.get("id"))
        per_view[vt] = per_view.get(vt, 0) + 1

    out: List[Dict[str, Any]] = []
    for iid in ordered_ids[:cap]:
        img = by_id.get(iid)
        if not img:
            continue
        b = _load_reference_bytes(img)
        if not b:
            continue
        out.append({"view": img.get("view_type") or "reference", "bytes": b})
    return out


def _build_vlm_report(
    vlm: Optional[Dict[str, Any]],
    decision: Dict[str, Any],
    clip_best: float,
    skipped: Optional[str] = None,
) -> Dict[str, Any]:
    vlm = vlm or {}
    return {
        "available": bool(vlm.get("available")),
        "method": vlm.get("method", "skipped" if skipped else "unavailable"),
        "verdict": vlm.get("verdict") or decision.get("vlm_verdict") or "unknown",
        "authenticity_probability": vlm.get("authenticity_probability"),
        "attribute_checks": vlm.get("attribute_checks", {}),
        "defects": vlm.get("defects", []),
        "metadata_consistency": vlm.get("metadata_consistency", []),
        "explanation": decision.get("explanation") or vlm.get("explanation", ""),
        "decision_source": decision.get("verdict_source"),
        "veto_applied": decision.get("veto_applied", False),
        "veto_reasons": decision.get("veto_reasons", []),
        "defect_counts": decision.get("defect_counts", {}),
        "metadata_mismatches": decision.get("metadata_mismatches", []),
        "final_score": decision.get("final_score"),
        "clip_best_similarity": round(float(clip_best), 4),
        "skipped_reason": skipped,
        "config": vlm_config.vlm_config_snapshot(),
        "error": vlm.get("error"),
    }


def _slot_is_identical(slot_result: Dict[str, Any]) -> bool:
    """True when this slot's customer image is pixel-identical to its reference.

    Demands agreement from three INDEPENDENT signals — semantic (CLIP embedding),
    geometric (ORB/RANSAC homography) and pixel-structural (per-region SSIM) — so
    no single metric can carry the decision on its own.
    """
    if not isinstance(slot_result, dict):
        return False

    if float(slot_result.get("global_similarity") or 0.0) < vlm_config.IDENTITY_MIN_GLOBAL:
        return False

    fm = slot_result.get("feature_match_result") or {}
    if not fm.get("success"):
        return False
    if float(fm.get("ransac_score") or 0.0) < vlm_config.IDENTITY_MIN_RANSAC:
        return False
    if float(fm.get("match_ratio") or 0.0) < vlm_config.IDENTITY_MIN_RANSAC:
        return False

    # Pixel-level structural agreement on EVERY measured region (min, not mean —
    # one tampered region must be able to veto the whole slot).
    region_scores = slot_result.get("region_pixel_scores") or {}
    ssims = [
        float(v.get("ssim"))
        for v in region_scores.values()
        if isinstance(v, dict) and v.get("ssim") is not None
    ]
    if not ssims:
        return False  # no pixel evidence at all → cannot claim identity
    return min(ssims) >= vlm_config.IDENTITY_MIN_SSIM


def _identity_matched_slots(
    slot_results: Dict[str, Dict[str, Any]]
) -> Optional[List[str]]:
    """Slots proven pixel-identical, or None if the fast path must NOT be taken.

    Fails closed: if any slot that carries comparable evidence is not identical,
    returns None so the VLM still adjudicates. A partial match (genuine front,
    counterfeit back) must never short-circuit to authentic.
    """
    if not vlm_config.IDENTITY_SHORTCIRCUIT_ENABLED or not slot_results:
        return None

    identical: List[str] = []
    for slot, result in slot_results.items():
        if not isinstance(result, dict):
            return None
        fm = result.get("feature_match_result") or {}
        has_evidence = bool(fm.get("success")) or bool(result.get("region_pixel_scores"))
        if not has_evidence:
            continue  # slot was not uploaded / not comparable — ignore it
        if not _slot_is_identical(result):
            return None
        identical.append(slot)

    if len(identical) < vlm_config.IDENTITY_MIN_SLOTS:
        return None
    return identical


def _run_vlm_stage(
    customer_embeddings: List[Dict[str, Any]],
    cached_images: List[dict],
    slot_results: Dict[str, Dict[str, Any]],
    product: Optional[dict],
    thresholds: Dict[str, float],
    clip_best: float,
) -> Tuple[Dict[str, Any], Dict[str, Any]]:
    """Holistic VLM adjudication → (decision, vlm_report)."""
    if not vlm_config.VLM_ENABLED:
        decision = vlm_decision.decide_unavailable("vlm_disabled", clip_best)
        return decision, _build_vlm_report(None, decision, clip_best, skipped="vlm_disabled")

    # CLIP gross-mismatch pre-filter: clearly a different product → skip the VLM.
    if clip_best < vlm_config.CLIP_GROSS_MISMATCH_MIN:
        logger.info(
            "[VLM] Gross mismatch (clip_best=%.3f < %.3f) — skipping VLM, marking suspicious",
            clip_best, vlm_config.CLIP_GROSS_MISMATCH_MIN,
        )
        decision = vlm_decision.decide_gross_mismatch(clip_best)
        return decision, _build_vlm_report(None, decision, clip_best, skipped="clip_gross_mismatch")

    # Identity short-circuit — the mirror image of the gross-mismatch filter above.
    # If every scored slot is pixel-identical to its reference, CLIP + ORB/RANSAC +
    # SSIM have already settled the question; sending it to a 7B VLM can only add a
    # chance to hallucinate a defect on an image that provably matches.
    identity_slots = _identity_matched_slots(slot_results)
    if identity_slots:
        logger.info(
            "[VLM] Identity match on %d slot(s) %s (CLIP≥%.2f, RANSAC≥%.2f, SSIM≥%.2f) "
            "— skipping VLM, marking authentic",
            len(identity_slots), identity_slots,
            vlm_config.IDENTITY_MIN_GLOBAL, vlm_config.IDENTITY_MIN_RANSAC,
            vlm_config.IDENTITY_MIN_SSIM,
        )
        decision = vlm_decision.decide_identity_match(clip_best, identity_slots)
        return decision, _build_vlm_report(None, decision, clip_best, skipped="identity_match")

    customer_images = _collect_vlm_customer_images(customer_embeddings)

    # If a pre-built authentication profile exists, the genuine product is already
    # richly characterised in the prompt (see qwen_vl_service._ground_truth_block),
    # so we only need a few grounding reference images instead of full coverage —
    # fewer image tokens ⇒ faster, cheaper scans.
    _prof = (product or {}).get("authentication_profile") or {}
    profile_ready = _prof.get("status") == "ready" and bool(str(_prof.get("spec", "")).strip())
    max_refs = max(1, len(customer_images)) if profile_ready else None

    reference_images = _collect_vlm_reference_images(
        cached_images, slot_results, len(customer_images), max_total_refs=max_refs
    )
    logger.info(
        "[VLM] Adjudicating with %d customer image(s) + %d reference view(s) (profile=%s)",
        len(customer_images), len(reference_images), "ready" if profile_ready else "none",
    )

    try:
        # Self-consistency voting (audit 1.5): N runs aggregated conservatively.
        # N defaults to AUTHENTIQ_VLM_SELF_CONSISTENCY_N; N=1 is the single pass.
        vlm = verify_product_authenticity_voting(customer_images, reference_images, product)
    except Exception as exc:  # never let the VLM crash the scan
        logger.warning("[VLM] verify_product_authenticity_voting raised: %s", exc, exc_info=True)
        decision = vlm_decision.decide_unavailable(f"vlm_exception:{exc}", clip_best)
        return decision, _build_vlm_report(None, decision, clip_best)

    if vlm.get("available"):
        decision = vlm_decision.decide_from_vlm(vlm, thresholds)
    else:
        decision = vlm_decision.decide_unavailable(vlm.get("error") or "vlm_unavailable", clip_best)
    report = _build_vlm_report(vlm, decision, clip_best)
    report["profile_used"] = profile_ready
    return decision, report


def run_verification_scoring(
    customer_embeddings: List[Dict[str, Any]],
    cached_images: List[dict],
    *,
    product: Optional[dict] = None,
    vendor: Optional[dict] = None,
) -> Dict[str, Any]:
    t0 = time.perf_counter()
    singleton = get_model_singleton()
    model_sig = get_active_model_signature()
    device = str(singleton.get_device()) if singleton.is_ready() else "not_loaded"
    thresholds = resolve_verification_thresholds(product, vendor)

    slot_results: Dict[str, Dict[str, Any]] = {}
    per_image_comparisons: List[Dict[str, Any]] = []

    # Prepare list of valid slots to process
    tasks: List[Tuple[Dict[str, Any], str]] = []
    for cust in customer_embeddings:
        raw_type = cust.get("image_type", "")
        slot = canonical_customer_slot(raw_type)
        if slot not in EXTENDED_SCORING_SLOTS:  # front, back, label, proof
            logger.warning("[Verify] Ignoring unknown customer image_type=%s", raw_type)
            continue
        tasks.append((cust, slot))

    if tasks:
        from concurrent.futures import ThreadPoolExecutor
        
        # Concurrently score all uploaded customer slots to minimize latency
        with ThreadPoolExecutor(max_workers=min(len(tasks), 4)) as executor:
            futures = {
                executor.submit(
                    score_slot,
                    cust["embedding"],
                    cached_images,
                    slot,
                    model_sig,
                    image_bytes=cust.get("image_bytes"),
                    product=product,
                ): slot
                for cust, slot in tasks
            }
            
            for future in futures:
                slot = futures[future]
                try:
                    result = future.result()
                    slot_results[slot] = result
                except Exception as exc:
                    logger.error(f"[Verify] Concurrency failure while scoring slot={slot}: {exc}", exc_info=True)
                    # Establish a fallback dictionary structure for the failed slot to keep pipeline stable
                    slot_results[slot] = {
                        "slot": slot,
                        "slot_score": 0.0,
                        "global_similarity": 0.0,
                        "aligned_clip_similarity": None,
                        "align_roi_similarity": None,
                        "alignment": {"success": False, "message": f"Error: {exc}"},
                        "region_pixel_scores": {},
                        "fraud_penalty_applied": False,
                        "fraud_penalty": 0.0,
                        "regional_similarity": None,
                        "region_scores": None,
                        "patch_similarity": None,
                        "patch_stats": None,
                        "visual_similarity": 0.0,
                        "ocr_similarity": None,
                        "ocr_engine": "none",
                        "ocr_fields": None,
                        "score_breakdown": {},
                        "ensemble_meta": {"active_components": [], "weight_normalization_applied": False},
                        "dimension_similarity": None,
                        "dimension_metadata": {},
                        "feature_match_result": {"success": False, "message": str(exc)},
                        "best_reference_id": None,
                        "max_similarity": 0.0,
                        "min_similarity": 0.0,
                        "num_comparisons": 0,
                        "matched_view_types": [],
                        "per_reference_similarities": [],
                        "used_fallback": False,
                        "scoring_method": f"concurrency_error_{exc}",
                        "patch_regions_customer": 0,
                        "yolo_regions_customer": 0,
                        "yolo_meta": None,
                        "vlm_applied": False,
                        "vlm_verdict": "none",
                        "vlm_result": None,
                    }

    # Build per_image_comparisons list preserving original order
    for cust, slot in tasks:
        if slot in slot_results:
            result = slot_results[slot]
            per_image_comparisons.append(
                {
                    "image_type": slot,
                    "display_name": _slot_display_name(slot),
                    "slot_score": result["slot_score"],
                    "average_similarity": result["slot_score"],
                    "global_similarity": result.get("global_similarity"),
                    "patch_similarity": result.get("patch_similarity"),
                    "patch_stats": result.get("patch_stats"),
                    "ocr_similarity": result.get("ocr_similarity"),
                    "ocr_match_percent": (
                        round(result["ocr_similarity"] * 100)
                        if result.get("ocr_similarity") is not None
                        else None
                    ),
                    "ocr_engine": result.get("ocr_engine"),
                    "ocr_fields": result.get("ocr_fields"),
                    "visual_similarity": result.get("visual_similarity"),
                    "regional_similarity": result.get("regional_similarity"),
                    "region_scores": result.get("region_scores"),
                    "aligned_clip_similarity": result.get("aligned_clip_similarity"),
                    "align_roi_similarity": result.get("align_roi_similarity"),
                    "alignment": alignment_meta_for_api(result.get("alignment") or {}),
                    "region_pixel_scores": result.get("region_pixel_scores"),
                    "score_breakdown": result.get("score_breakdown"),
                    "fraud_penalty_applied": result.get("fraud_penalty_applied"),
                    # New multi-stage pipeline metrics
                    "dimension_similarity": result.get("dimension_similarity"),
                    "dimension_metadata": result.get("dimension_metadata"),
                    "feature_match_result": result.get("feature_match_result"),
                    "max_similarity": result.get("max_similarity", 0.0),
                    "min_similarity": result.get("min_similarity", 0.0),
                    "matched_view_types": result.get("matched_view_types", []),
                    "used_fallback": result.get("used_fallback", False),
                    "num_comparisons": result.get("num_comparisons", 0),
                    "per_reference_similarities": result.get("per_reference_similarities", []),
                    "vlm_applied": result.get("vlm_applied", False),
                    "vlm_verdict": result.get("vlm_verdict", "none"),
                    "vlm_result": result.get("vlm_result"),
                }
            )

    missing_slots = [s for s in CORE_SCORING_SLOTS if s not in slot_results]

    # CLIP retrieval aggregate — kept for debug + the gross-mismatch pre-filter
    # ONLY. It is NO LONGER the authenticity decision (v7).
    clip_retrieval_aggregate = compute_weighted_verification_score(slot_results)
    clip_best = max(
        (float(slot_results[s].get("global_similarity") or 0.0) for s in slot_results),
        default=0.0,
    )
    identity_boost_applied = False  # removed in v7 (it forced optimistic scores)

    # ── VLM-PRIMARY DECISION ──────────────────────────────────────────────────
    decision, vlm_report = _run_vlm_stage(
        customer_embeddings, cached_images, slot_results, product, thresholds, clip_best
    )
    aggregate_confidence = float(decision["final_score"])
    authenticity = {
        "status": decision["status"],
        "risk_level": decision["risk_level"],
        "verification_strength": verification_strength_label(aggregate_confidence),
        "explanation": decision["explanation"],
        "confidence_score": aggregate_confidence,
    }

    elapsed_ms = (time.perf_counter() - t0) * 1000

    # Extended breakdown for API / debug
    global_similarity_mean = (
        float(np.mean([slot_results[s].get("global_similarity", 0.0) for s in slot_results]))
        if slot_results
        else 0.0
    )
    merged_region_scores: Dict[str, float] = {}
    for s in slot_results:
        rs = slot_results[s].get("region_scores") or {}
        for k, v in rs.items():
            merged_region_scores[k] = max(merged_region_scores.get(k, 0.0), float(v))

    # Compute slot contributions using dynamic weights for accurate logging
    _active_slots = list(slot_results.keys())
    _dyn_weights = get_dynamic_slot_weights(_active_slots)
    slot_contributions = {
        s: round(slot_results[s]["slot_score"] * _dyn_weights.get(s, 0.0), 4)
        for s in slot_results
    }

    log_payload = {
        "device": device,
        "model": model_sig.get("model"),
        "pretrained": model_sig.get("pretrained"),
        "embedding_strategy": EMBEDDING_STRATEGY_VERSION,
        "weighted_score": round(aggregate_confidence, 4),
        "clip_retrieval_aggregate": round(clip_retrieval_aggregate, 4),
        "clip_best_similarity": round(clip_best, 4),
        "vlm": {
            "available": vlm_report.get("available"),
            "method": vlm_report.get("method"),
            "verdict": vlm_report.get("verdict"),
            "decision_source": vlm_report.get("decision_source"),
            "veto_applied": vlm_report.get("veto_applied"),
            "defect_counts": vlm_report.get("defect_counts"),
        },
        "slot_scores": {s: round(slot_results[s]["slot_score"], 4) for s in slot_results},
        "global_similarities": {
            s: round(slot_results[s].get("global_similarity") or 0.0, 4) for s in slot_results
        },
        "patch_similarities": {
            s: slot_results[s].get("patch_similarity") for s in slot_results
        },
        "ocr_similarities": {
            s: slot_results[s].get("ocr_similarity") for s in slot_results
        },
        "regional_similarities": {
            s: slot_results[s].get("regional_similarity") for s in slot_results
        },
        "region_scores": merged_region_scores,
        # New multi-stage pipeline metrics
        "dimension_similarities": {
            s: round(slot_results[s].get("dimension_similarity") or 0.0, 4) for s in slot_results
        },
        "dimension_metadata": {
            s: slot_results[s].get("dimension_metadata", {}) for s in slot_results
        },
        "feature_match_results": {
            s: {
                "method": slot_results[s].get("feature_match_result", {}).get("method"),
                "match_ratio": slot_results[s].get("feature_match_result", {}).get("match_ratio"),
                "ransac_score": slot_results[s].get("feature_match_result", {}).get("ransac_score"),
                "inliers": slot_results[s].get("feature_match_result", {}).get("inliers"),
                "outliers": slot_results[s].get("feature_match_result", {}).get("outliers"),
            }
            for s in slot_results
        },
        "identity_boost_applied": identity_boost_applied,
        "yolo_config": scoring_config_snapshot(),
        "pipeline_config": pipeline_config_snapshot(),
        "feature_matching_config": feature_config_snapshot(),
        "slot_contributions": slot_contributions,
        "fallback_slots": [s for s, r in slot_results.items() if r.get("used_fallback")],
        "missing_slots": missing_slots,
        "thresholds": thresholds,
        "scoring_ms": round(elapsed_ms, 2),
    }
    logger.info("[Verify] Scoring complete %s", log_payload)

    return {
        "aggregate_confidence": aggregate_confidence,
        "weighted_final_score": aggregate_confidence,
        # v7: the VLM decision is authoritative. Routes should prefer this
        # `authenticity` dict over re-banding the raw score.
        "authenticity": authenticity,
        "vlm_report": vlm_report,
        "clip_retrieval_aggregate": clip_retrieval_aggregate,
        "clip_best_similarity": clip_best,
        "global_similarity": global_similarity_mean,
        "region_scores": merged_region_scores,
        "per_image_comparisons": per_image_comparisons,
        "slot_results": slot_results,
        "missing_slots": missing_slots,
        "slots_scored": [s for s in EXTENDED_SCORING_SLOTS if s in slot_results and slot_results[s].get("num_comparisons", 0) > 0],
        "model_signature": model_sig,
        "device": device,
        "thresholds": thresholds,
        "scoring_debug": log_payload,
        "processing_time_ms": round(elapsed_ms, 2),
        "identity_boost_applied": identity_boost_applied,
    }
