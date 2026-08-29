"""Unit tests for YOLO regional scoring helpers (no Torch/YOLO required)."""

import unittest

from app.services.region_embeddings import aggregate_regional_score, max_region_similarity_by_type
from app.services.region_detection import merge_regions
from app.services.region_scoring_config import normalized_region_weights


class TestRegionScoring(unittest.TestCase):
    def test_merge_prefers_yolo_over_heuristic(self):
        yolo = [{"region_type": "logo", "confidence": 0.9, "bbox": [0, 0, 10, 10]}]
        heur = [{"region_type": "logo", "confidence": 0.5, "bbox": [1, 1, 9, 9]}]
        merged = merge_regions(yolo, heur)
        self.assertEqual(len(merged), 1)
        self.assertEqual(merged[0]["confidence"], 0.9)

    def test_max_region_similarity_by_type(self):
        cust = [{"region_type": "logo", "vector": [1.0, 0.0]}]
        ref = [{"region_type": "logo", "vector": [1.0, 0.0]}]
        scores = max_region_similarity_by_type(cust, ref)
        self.assertAlmostEqual(scores["logo"], 1.0, places=3)

    def test_aggregate_regional_score(self):
        per_type = {"logo": 0.9, "label": 0.8}
        score = aggregate_regional_score(per_type)
        self.assertGreater(score, 0.75)

    def test_normalized_weights_sum(self):
        w = normalized_region_weights({"logo": 1.0, "label": 1.0})
        self.assertAlmostEqual(sum(w.values()), 1.0, places=4)


if __name__ == "__main__":
    unittest.main()
