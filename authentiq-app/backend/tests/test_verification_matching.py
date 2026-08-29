"""Unit tests for category-aligned verification scoring (no Torch required)."""

import unittest

from app.services.verification_matching import (
    _combine_visual_score,
    compute_weighted_verification_score,
    filter_references_for_slot,
    get_dynamic_slot_weights,
)
from app.services.patch_embeddings import GLOBAL_PATCH_BLEND
from app.services.openclip_service import (
    assess_authenticity,
    AUTHENTICITY_THRESHOLDS,
    verification_strength_label,
)


def _unit_vec(seed: float) -> list:
    import math

    return [math.sin(seed + i * 0.1) for i in range(8)]


class TestVerificationMatching(unittest.TestCase):
    def test_filter_front_only(self):
        vec_a = [1.0] + [0.0] * 511
        vec_b = [0.0, 1.0] + [0.0] * 510
        refs = [
            {"id": "1", "view_type": "front_view", "embedding_vector": vec_a},
            {"id": "2", "view_type": "labels", "embedding_vector": vec_b},
        ]
        matched, fallback = filter_references_for_slot(
            refs, "front", {"model": "ViT-B-32", "pretrained": "test"}
        )
        self.assertEqual(len(matched), 1)
        self.assertFalse(fallback)

    def test_weighted_aggregate(self):
        # Each slot dict must include num_comparisons > 0 for the slot to be counted.
        # Expected score is derived from get_dynamic_slot_weights so it stays correct
        # if base weights are ever re-tuned.
        slots = {
            "front": {"slot_score": 0.95, "num_comparisons": 1},
            "back": {"slot_score": 0.85, "num_comparisons": 1},
            "label": {"slot_score": 0.90, "num_comparisons": 1},
        }
        score = compute_weighted_verification_score(slots)
        dyn_weights = get_dynamic_slot_weights(list(slots.keys()))
        expected = sum(slots[s]["slot_score"] * dyn_weights.get(s, 0.0) for s in slots)
        self.assertAlmostEqual(score, expected, places=4)

    def test_thresholds_authentic(self):
        r = assess_authenticity(0.93, AUTHENTICITY_THRESHOLDS)
        self.assertEqual(r["status"], "authentic")

    def test_thresholds_needs_review(self):
        r = assess_authenticity(0.70, AUTHENTICITY_THRESHOLDS)
        self.assertEqual(r["status"], "needs_review")

    def test_thresholds_suspicious(self):
        r = assess_authenticity(0.50, AUTHENTICITY_THRESHOLDS)
        self.assertEqual(r["status"], "suspicious")

    def test_visual_patch_blend(self):
        g, p = GLOBAL_PATCH_BLEND["global"], GLOBAL_PATCH_BLEND["patch"]
        self.assertAlmostEqual(_combine_visual_score(0.8, 0.9, True), g * 0.8 + p * 0.9, places=3)
        self.assertAlmostEqual(_combine_visual_score(0.8, 0.0, True), 0.8, places=3)

    def test_verification_strength_not_risk_level(self):
        """87% likely_authentic → medium strength, low fraud risk."""
        r = assess_authenticity(0.87, AUTHENTICITY_THRESHOLDS)
        self.assertEqual(r["status"], "likely_authentic")
        self.assertEqual(r["risk_level"], "low")
        self.assertEqual(r["verification_strength"], "medium")
        self.assertEqual(verification_strength_label(0.87), "medium")


if __name__ == "__main__":
    unittest.main()
