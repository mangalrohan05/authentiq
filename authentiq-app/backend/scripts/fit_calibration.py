#!/usr/bin/env python3
"""
Fit the Platt calibration layer from a labelled score set (audit item 1.8).

Until this is run, calibration_layer.calibrator is an identity pass-through and
the decision score is used raw. This script fits sigmoid(a*score + b) so raw
verification scores become calibrated probabilities, persists (a, b), and — when
AUTHENTIQ_CALIBRATION_ENABLED=true — the fitted params take effect on next boot
(loaded automatically by calibration_layer on import).

Input: a JSON list of {"score": <0..1 raw authenticity score>, "label": 1|0}
       (1 = genuine, 0 = counterfeit). Same file the eval harness consumes.

Usage:
    python scripts/fit_calibration.py [path/to/labeled_scores.json]

Build the labelled set from human-reviewed scans (the reviewer console / feedback
loop in the roadmap): every confirm/dispute on a scan becomes one labelled row.
"""

from __future__ import annotations

import json
import os
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))
os.chdir(BACKEND_ROOT)

from app.services.calibration_layer import calibrator  # noqa: E402
from app.services import metrics as counterfeit_metrics  # noqa: E402

DEFAULT_PATH = BACKEND_ROOT / "static" / "eval" / "labeled_scores.json"


def main() -> int:
    path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_PATH
    if not path.is_file():
        print(f"Labelled score set not found: {path}")
        print('Expected JSON: [{"score": 0.0-1.0, "label": 1|0}, ...]  (1=genuine, 0=counterfeit)')
        return 1

    with open(path) as f:
        rows = json.load(f)
    scores = [float(r["score"]) for r in rows]
    labels = [int(r["label"]) for r in rows]

    print(f"Loaded {len(rows)} labelled rows from {path}")
    print("\nBefore calibration:")
    print(counterfeit_metrics.format_report(counterfeit_metrics.compute_metrics(labels, scores)))

    try:
        result = calibrator.fit_from_labeled_data(scores, labels, persist=True)
    except Exception as exc:
        print(f"\nCalibration fit failed: {exc}")
        return 1

    print(f"\nFitted Platt scaling: a={result['a']:.4f} b={result['b']:.4f} (n={result['n']})")
    print(f"Params persisted to: {os.getenv('AUTHENTIQ_CALIBRATION_PARAMS_PATH', 'static/calibration/platt_params.json')}")

    calibrated = [calibrator.apply(s) for s in scores]
    print("\nAfter calibration (scores mapped to probabilities):")
    print(counterfeit_metrics.format_report(counterfeit_metrics.compute_metrics(labels, calibrated)))

    if not calibrator.is_active():
        print(
            "\nNOTE: calibration is FITTED but not ACTIVE — set AUTHENTIQ_CALIBRATION_ENABLED=true "
            "to apply it in the live decision path."
        )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
