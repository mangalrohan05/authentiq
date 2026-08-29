#!/usr/bin/env python3
"""
Lightweight baseline evaluation for Authentiq OpenCLIP verification.

Measures:
- Self-similarity (reference vs itself) — expect ~0.98+
- Cross-view similarity within same product
- Slot-weighted aggregate vs raw global cosine
- Device and timing

Run from backend/: python scripts/baseline_verification_eval.py
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path
from statistics import mean, median
from typing import Any, Dict, List, Optional

# backend root on path
BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
os.chdir(BACKEND_ROOT)

from app.services.openclip_service import (  # noqa: E402
    cosine_similarity,
    generate_embedding_from_bytes,
    get_model_singleton,
)
from app.services.verification_matching import (  # noqa: E402
    compute_weighted_verification_score,
    run_verification_scoring,
    score_slot,
)
from app.services.embedding_compat import normalize_view_type  # noqa: E402
from app.services import metrics as counterfeit_metrics  # noqa: E402


STATIC = BACKEND_ROOT / "static"
PRODUCTS_JSON = STATIC / "db_backup" / "products.json"
# Optional labelled evaluation set: a JSON list of {"score": <0..1 authenticity>,
# "label": 1|0}  (1 = genuine, 0 = counterfeit). Produce it by scoring a held-out,
# human-labelled set of real + known-counterfeit scans through the pipeline.
LABELED_SCORES_JSON = STATIC / "eval" / "labeled_scores.json"


def evaluate_labeled_set() -> Optional[Dict[str, Any]]:
    """Report the metrics that actually matter (recall@FPR, precision, PR/ROC-AUC).

    Raw accuracy is deliberately NOT reported as a headline: on an imbalanced,
    asymmetric problem a 'say genuine always' model looks ~98% accurate and
    catches zero counterfeits. Requires a labelled genuine/counterfeit score set.
    """
    if not LABELED_SCORES_JSON.is_file():
        print(
            "\n[counterfeit metrics] No labelled score set found at "
            f"{LABELED_SCORES_JSON.relative_to(BACKEND_ROOT)} — cannot report "
            "counterfeit recall/precision/AUC yet.\n"
            "  Accuracy alone is meaningless here (imbalanced + asymmetric). Build a "
            "held-out set of human-labelled genuine + known-counterfeit scans, score them "
            "through the pipeline, and write [{\"score\": <0..1>, \"label\": 1|0}, ...]."
        )
        return None
    with open(LABELED_SCORES_JSON) as f:
        rows = json.load(f)
    y_true = [int(r["label"]) for r in rows]
    y_score = [float(r["score"]) for r in rows]
    report = counterfeit_metrics.compute_metrics(y_true, y_score)
    print("\n" + counterfeit_metrics.format_report(report))
    return report


def load_products() -> List[dict]:
    if not PRODUCTS_JSON.is_file():
        return []
    with open(PRODUCTS_JSON) as f:
        return json.load(f)


def resolve_path(url: str) -> Optional[Path]:
    if not url:
        return None
    rel = url.lstrip("/")
    p = BACKEND_ROOT / rel
    return p if p.is_file() else None


def embed_file(path: Path) -> Dict[str, Any]:
    with open(path, "rb") as f:
        data = f.read()
    return generate_embedding_from_bytes(data, str(path))


def main() -> int:
    products = load_products()
    if not products:
        print("No products.json found")
        return 1

    singleton = get_model_singleton()
    t_load = time.perf_counter()
    if not singleton.ensure_loaded():
        print(f"OpenCLIP failed to load: {singleton._load_error}")
        return 1
    load_ms = (time.perf_counter() - t_load) * 1000
    device = str(singleton.get_device())

    self_sims: List[float] = []
    cross_sims: List[float] = []
    slot_self_scores: List[float] = []
    failures = 0

    for product in products:
        refs = product.get("reference_images") or []
        paths: List[tuple] = []
        for ref in refs:
            p = resolve_path(ref.get("url", ""))
            if p:
                paths.append((ref, p))

        # Self-similarity per reference image
        for ref, path in paths:
            t0 = time.perf_counter()
            emb = embed_file(path)
            infer_ms = (time.perf_counter() - t0) * 1000
            if not emb.get("success"):
                failures += 1
                continue
            vec = emb["embedding"]
            sim = cosine_similarity(vec, vec)
            self_sims.append(sim)

            view = normalize_view_type(ref.get("view_type", "other"))
            slot_map = {
                "front": "front",
                "front_view": "front",
                "back": "back",
                "back_view": "back",
                "packaging": "back",
                "labels": "label",
                "label": "label",
                "holograms": "label",
                "barcode_qr": "label",
                "seals": "label",
            }
            slot = slot_map.get(view)
            if slot:
                cached = [
                    {
                        "id": ref.get("id"),
                        "view_type": ref.get("view_type"),
                        "embedding_vector": vec,
                        "embedding_model": emb.get("embedding_model"),
                        "embedding_pretrained": emb.get("embedding_pretrained"),
                    }
                ]
                with open(path, "rb") as f:
                    raw = f.read()
                sr = score_slot(
                    vec,
                    cached,
                    slot,
                    {"model": emb.get("embedding_model"), "pretrained": emb.get("embedding_pretrained")},
                    image_bytes=raw if slot == "label" else None,
                )
                slot_self_scores.append(sr["slot_score"])

        # Cross-similarity within product (same slot views)
        by_slot: Dict[str, List] = {}
        for ref, path in paths:
            view = normalize_view_type(ref.get("view_type", "other"))
            slot_map = {
                "front": "front",
                "front_view": "front",
                "back": "back",
                "back_view": "back",
                "packaging": "back",
                "labels": "label",
                "holograms": "label",
            }
            slot = slot_map.get(view)
            if not slot:
                continue
            emb = embed_file(path)
            if emb.get("success"):
                by_slot.setdefault(slot, []).append(emb["embedding"])

        for slot, vecs in by_slot.items():
            if len(vecs) < 2:
                continue
            for i in range(len(vecs)):
                for j in range(i + 1, len(vecs)):
                    cross_sims.append(cosine_similarity(vecs[i], vecs[j]))

    # Simulated 3-slot verify using first product with >=3 refs
    pipeline_scores: List[float] = []
    for product in products:
        refs = product.get("reference_images") or []
        if len(refs) < 3:
            continue
        cached = []
        customer = []
        for ref in refs[:3]:
            p = resolve_path(ref.get("url", ""))
            if not p:
                continue
            with open(p, "rb") as f:
                raw = f.read()
            emb = generate_embedding_from_bytes(raw, str(p))
            if not emb.get("success"):
                continue
            view = normalize_view_type(ref.get("view_type", "front"))
            slot_map = {
                "front": "front",
                "front_view": "front",
                "back": "back",
                "back_view": "back",
                "packaging": "back",
                "labels": "label",
                "holograms": "label",
            }
            slot = slot_map.get(view, "front")
            cached.append(
                {
                    **ref,
                    "embedding_vector": emb["embedding"],
                    "embedding_model": emb.get("embedding_model"),
                    "embedding_pretrained": emb.get("embedding_pretrained"),
                }
            )
            customer.append(
                {
                    "image_type": slot,
                    "embedding": emb["embedding"],
                    "image_bytes": raw if slot == "label" else None,
                }
            )
        if len(customer) >= 3:
            scoring = run_verification_scoring(customer, cached)
            pipeline_scores.append(scoring["aggregate_confidence"])
            break

    def pct_ge(vals: List[float], t: float) -> float:
        if not vals:
            return 0.0
        return 100.0 * sum(1 for v in vals if v >= t) / len(vals)

    report = {
        "device": device,
        "model_load_ms": round(load_ms, 1),
        "n_self_pairs": len(self_sims),
        "self_similarity": {
            "mean": round(mean(self_sims), 4) if self_sims else None,
            "median": round(median(self_sims), 4) if self_sims else None,
            "min": round(min(self_sims), 4) if self_sims else None,
            "pct_ge_0.95": round(pct_ge(self_sims, 0.95), 1),
            "pct_ge_0.99": round(pct_ge(self_sims, 0.99), 1),
        },
        "slot_self_score": {
            "mean": round(mean(slot_self_scores), 4) if slot_self_scores else None,
            "median": round(median(slot_self_scores), 4) if slot_self_scores else None,
            "min": round(min(slot_self_scores), 4) if slot_self_scores else None,
            "pct_ge_0.92_authentic_threshold": round(pct_ge(slot_self_scores, 0.92), 1),
        },
        "cross_view_similarity": {
            "mean": round(mean(cross_sims), 4) if cross_sims else None,
            "n_pairs": len(cross_sims),
        },
        "simulated_same_image_pipeline_score": pipeline_scores[0] if pipeline_scores else None,
        # NOT a detection-accuracy figure: this only checks genuine-vs-itself
        # self-consistency of the encoder. Real counterfeit accuracy needs a
        # labelled set — see evaluate_labeled_set() / counterfeit metrics below.
        "self_similarity_sanity_pct": None,
        "notes": [
            "self_similarity_sanity_pct is an encoder sanity check, NOT counterfeit "
            "detection accuracy. Counterfeit recall/precision/AUC require a labelled set."
        ],
    }

    # Heuristic: self slot score >= 0.92 counts as correct for genuine-same-image
    if slot_self_scores:
        acc = pct_ge(slot_self_scores, 0.92)
        report["self_similarity_sanity_pct"] = round(acc, 1)
        if acc < 95:
            report["notes"].append(
                "Slot-weighted self scores below 92% explain 67–87% customer scores "
                "(top-2 mean across refs, patch/OCR blend, multi-slot weights)."
            )
    if self_sims and mean(self_sims) > 0.99 and slot_self_scores and mean(slot_self_scores) < 0.92:
        report["notes"].append(
            "Raw embedding self-similarity is near-perfect but pipeline slot scores are lower — "
            "aggregation/threshold calibration is the bottleneck, not the encoder."
        )

    print(json.dumps(report, indent=2))

    # The metrics that actually matter for a counterfeit detector (if a labelled set exists).
    evaluate_labeled_set()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
