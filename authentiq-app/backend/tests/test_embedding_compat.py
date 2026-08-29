"""Embedding compatibility must not reject v3 refs after v4 pipeline upgrade."""

import unittest

from app.services.embedding_compat import embedding_matches_model


class TestEmbeddingCompat(unittest.TestCase):
    def test_v3_reference_works_with_v4_pipeline(self):
        ref = {
            "embedding_vector": [0.1] * 512,
            "embedding_model": "ViT-B-32",
            "embedding_pretrained": "laion2b_s34b_b79k",
            "embedding_strategy_version": "v3_global_yolo_region_patch_ocr",
        }
        sig = {"model": "ViT-B-32", "pretrained": "laion2b_s34b_b79k"}
        self.assertTrue(embedding_matches_model(ref, sig))

    def test_pretrained_mismatch_rejected(self):
        ref = {
            "embedding_vector": [0.1] * 8,
            "embedding_pretrained": "openai",
        }
        sig = {"model": "ViT-B-32", "pretrained": "laion2b_s34b_b79k"}
        self.assertFalse(embedding_matches_model(ref, sig))


if __name__ == "__main__":
    unittest.main()
