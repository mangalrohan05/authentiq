"""Quality gate is advisory, not a hard reject for usable images (audit item 1.12).

Verifies the recalibration: a below-preferred-but-usable image passes with an
advisory flag, and only a genuinely-tiny image is rejected. Regression guard for
the two bugs: `too_small` being treated as critical, and `extreme_glare` reusing
the soft glare threshold.
"""

from __future__ import annotations

import io

import numpy as np
import pytest
from PIL import Image

from app.services import image_quality
from app.services.image_quality import validate_customer_image_bytes


def _jpeg(w: int, h: int) -> bytes:
    arr = np.full((h, w, 3), (120, 110, 100), dtype=np.uint8)
    arr[::4, :] = (200, 190, 180)  # stripes → real contrast, not a flat image
    buf = io.BytesIO()
    Image.fromarray(arr).save(buf, format="JPEG", quality=90)
    return buf.getvalue()


def test_below_preferred_but_usable_passes_as_advisory():
    r = validate_customer_image_bytes(_jpeg(250, 250), image_type="front")
    assert r["passed"] is True                     # not a hard reject anymore
    assert "too_small" in r["quality_flags"]       # still surfaced as guidance
    assert "too_tiny" not in r["quality_flags"]


def test_genuinely_tiny_image_is_rejected():
    r = validate_customer_image_bytes(_jpeg(120, 120), image_type="front")
    assert r["passed"] is False
    assert "too_tiny" in r["quality_flags"]


def test_extreme_glare_threshold_is_separate_from_soft():
    # The extreme (hard-reject) glare threshold must be looser than the soft one,
    # otherwise ordinary glare falsely rejects valid photos.
    assert image_quality.QUALITY_EXTREME_GLARE_RATIO > image_quality.QUALITY_MAX_GLARE_RATIO


def test_too_small_not_in_critical_set_semantics():
    # A usable-size image with soft flags must still pass overall.
    r = validate_customer_image_bytes(_jpeg(280, 280), image_type="label")
    assert r["passed"] is True


# ── Specular glare must measure REFLECTIONS, not whiteness ───────────────────
# Regression: glare was `np.sum(gray > 240) / size`, so a white or light-coloured
# subject scored as glare purely for being bright. Real measurements: a white
# sugar product reference scored 0.6662 and a tea label 0.4722 — both above the
# 0.35 hard-reject threshold — so valid photos of light packaging were thrown out
# before the AI ever saw them.
def test_white_subject_is_not_measured_as_glare():
    import numpy as np
    from app.services.image_quality import _specular_glare_ratio
    white = np.full((800, 800), 255, dtype=np.uint8)   # entirely white frame
    assert _specular_glare_ratio(white) < image_quality.QUALITY_MAX_GLARE_RATIO


def test_small_blown_highlights_are_still_measured_as_glare():
    import numpy as np
    from app.services.image_quality import _specular_glare_ratio
    frame = np.full((400, 400), 90, dtype=np.uint8)    # dark-ish frame
    # Scatter compact blown-out specular blobs (each far below the 5%-of-frame
    # cap, so they count as glare rather than as a large white subject).
    for y in range(0, 400, 40):
        for x in range(0, 400, 40):
            frame[y:y + 18, x:x + 18] = 255
    ratio = _specular_glare_ratio(frame)
    assert ratio > image_quality.QUALITY_MAX_GLARE_RATIO, ratio


def test_glare_ratio_stays_a_fraction():
    import numpy as np
    from app.services.image_quality import _specular_glare_ratio
    for arr in (
        np.zeros((50, 50), dtype=np.uint8),
        np.full((50, 50), 255, dtype=np.uint8),
        np.random.randint(0, 256, (60, 60), dtype=np.uint8),
    ):
        assert 0.0 <= _specular_glare_ratio(arr) <= 1.0
