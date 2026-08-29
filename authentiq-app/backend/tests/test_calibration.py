"""Unit tests for the Platt calibration layer (audit item 1.8).

Covers the identity-by-default contract, fitting from labelled data, the
monotonic mapping, active/inactive gating, and param persistence round-trip.
Pure-logic: no models, DB, or network.
"""

from __future__ import annotations

import json

from app.services import calibration_layer
from app.services.calibration_layer import PlattCalibrator


def test_identity_when_unfitted():
    c = PlattCalibrator()
    for s in (0.0, 0.25, 0.5, 0.75, 1.0):
        assert c.apply(s) == s
    assert c.is_active() is False


def test_fit_from_labeled_data_is_monotonic_and_active(monkeypatch):
    # Enable calibration globally for this test (module-level gate).
    monkeypatch.setattr(calibration_layer, "_CALIBRATION_ENABLED", True)
    c = PlattCalibrator()

    # Separable: genuine scored high, counterfeit low.
    scores = [0.95, 0.9, 0.85, 0.8, 0.2, 0.15, 0.1, 0.05]
    labels = [1, 1, 1, 1, 0, 0, 0, 0]
    result = c.fit_from_labeled_data(scores, labels, persist=False)

    assert result["n"] == 8
    assert c.is_active() is True
    # Calibrated mapping must stay monotonic in the raw score.
    calibrated = [c.apply(s) for s in [0.0, 0.2, 0.5, 0.8, 1.0]]
    assert calibrated == sorted(calibrated)
    # A clearly-genuine raw score should calibrate high, a clearly-fake one low.
    assert c.apply(0.95) > 0.5
    assert c.apply(0.05) < 0.5


def test_fit_requires_both_classes():
    c = PlattCalibrator()
    try:
        c.fit_from_labeled_data([0.9, 0.8, 0.7], [1, 1, 1], persist=False)
        assert False, "expected ValueError for single-class labels"
    except ValueError:
        pass


def test_save_and_load_params_roundtrip(tmp_path):
    path = str(tmp_path / "platt_params.json")
    c1 = PlattCalibrator()
    c1.fit(a=2.5, b=-1.0, sample_count=123)
    saved = c1.save_params(path)
    assert saved == path
    with open(path) as f:
        data = json.load(f)
    assert data["a"] == 2.5 and data["b"] == -1.0 and data["sample_count"] == 123

    c2 = PlattCalibrator()
    assert c2.load_params(path) is True
    assert c2._fitted is True
    assert c2._a == 2.5 and c2._b == -1.0


def test_load_params_missing_file_is_false():
    c = PlattCalibrator()
    assert c.load_params("/nonexistent/path/platt_params.json") is False
