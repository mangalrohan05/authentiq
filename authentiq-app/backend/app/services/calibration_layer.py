"""
Platt calibration scaffold for the Authentiq AI verification pipeline.

STATUS: SCAFFOLD ONLY — calibration is NOT computed until a labeled dataset exists.

Until fitted:
    - apply() is an identity pass-through (returns raw score unchanged).
    - log_data_point() records raw scores to calibration_data_collection for future use.

To implement calibration when labeled data is available:
    1. Collect (raw_score, ground_truth_label) pairs via log_data_point().
       ground_truth_label: 1 = genuine, 0 = counterfeit.
    2. Fit Platt scaling:
           from scipy.optimize import minimize
           from scipy.special import expit
           # Find a, b such that expit(a*score + b) matches labels via log-loss.
    3. Call calibrator.fit(a, b) to activate calibration.

Why Platt scaling:
    - Converts raw similarity scores (not probabilities) into calibrated probability estimates.
    - Only 2 parameters (a, b) — very low data requirement vs. isotonic regression.
    - Requires ~100–500 labeled examples for reliable calibration.

Dependencies:
    - scipy>=1.11.0 (already in requirements.txt) — only imported when fitted.

Configurable via:
    AUTHENTIQ_CALIBRATION_ENABLED  (bool, default false — must be explicitly opt-in)
"""

from __future__ import annotations

import json
import logging
import os
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Sequence

logger = logging.getLogger(__name__)

_CALIBRATION_ENABLED: bool = os.getenv(
    "AUTHENTIQ_CALIBRATION_ENABLED", "false"
).lower() in ("1", "true", "yes")

# Where fitted Platt params are persisted so calibration survives a restart.
_DEFAULT_PARAMS_PATH: str = os.getenv(
    "AUTHENTIQ_CALIBRATION_PARAMS_PATH", "static/calibration/platt_params.json"
)


class PlattCalibrator:
    """
    Platt scaling calibrator for verification score probabilities.

    Until fitted, apply() is an identity function — the raw score is returned
    unchanged and calibration_applied will be False in the response.

    Thread-safe for read access after fit(). Do not call fit() concurrently.
    """

    def __init__(self) -> None:
        self._fitted: bool = False
        self._a: float = 1.0   # Sigmoid slope (identity when a=1, b=0)
        self._b: float = 0.0   # Sigmoid intercept
        self._fit_sample_count: int = 0
        self._fit_timestamp: Optional[datetime] = None

    def fit(self, a: float, b: float, *, sample_count: int = 0) -> None:
        """
        Activate calibration with fitted Platt parameters.

        Args:
            a:            Slope parameter from logistic regression.
            b:            Intercept parameter from logistic regression.
            sample_count: Number of labeled examples used to fit (for metadata).
        """
        self._a = float(a)
        self._b = float(b)
        self._fitted = True
        self._fit_sample_count = sample_count
        self._fit_timestamp = datetime.utcnow()
        logger.info(
            "[Calibration] Platt calibrator fitted: a=%.4f b=%.4f samples=%d",
            a, b, sample_count,
        )

    def fit_from_labeled_data(
        self,
        scores: Sequence[float],
        labels: Sequence[int],
        *,
        persist: bool = True,
        path: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Fit Platt scaling (a, b) from labelled (raw_score, ground_truth) pairs.

        labels: 1 = genuine, 0 = counterfeit (same convention as log_data_point).
        Uses near-unregularised logistic regression on the 1-D score so
        apply() = expit(a*score + b) estimates P(genuine). Requires both classes.
        """
        import numpy as np
        from sklearn.linear_model import LogisticRegression

        X = np.asarray(list(scores), dtype=float).reshape(-1, 1)
        y = np.asarray(list(labels), dtype=int)
        if X.shape[0] != y.shape[0]:
            raise ValueError("scores and labels length mismatch")
        if np.unique(y).size < 2:
            raise ValueError("Need both genuine (1) and counterfeit (0) labels to fit calibration")

        # C large -> minimal L2, i.e. close to classic (unregularised) Platt scaling.
        lr = LogisticRegression(C=1e6, solver="lbfgs", max_iter=1000)
        lr.fit(X, y)
        a = float(lr.coef_[0][0])
        b = float(lr.intercept_[0])
        self.fit(a, b, sample_count=int(y.shape[0]))
        if persist:
            self.save_params(path)
        return {"a": a, "b": b, "n": int(y.shape[0])}

    def save_params(self, path: Optional[str] = None) -> Optional[str]:
        """Persist fitted params to JSON so calibration survives a restart."""
        if not self._fitted:
            return None
        target = path or _DEFAULT_PARAMS_PATH
        try:
            os.makedirs(os.path.dirname(target) or ".", exist_ok=True)
            with open(target, "w") as f:
                json.dump(
                    {
                        "a": self._a,
                        "b": self._b,
                        "sample_count": self._fit_sample_count,
                        "fitted_at": self._fit_timestamp.isoformat() if self._fit_timestamp else None,
                    },
                    f,
                    indent=2,
                )
            logger.info("[Calibration] Saved Platt params to %s", target)
            return target
        except Exception as exc:
            logger.warning("[Calibration] Failed to save params to %s: %s", target, exc)
            return None

    def load_params(self, path: Optional[str] = None) -> bool:
        """Load fitted params from JSON (best-effort). Returns True if loaded."""
        target = path or _DEFAULT_PARAMS_PATH
        if not os.path.isfile(target):
            return False
        try:
            with open(target) as f:
                data = json.load(f)
            self.fit(
                float(data["a"]),
                float(data["b"]),
                sample_count=int(data.get("sample_count", 0)),
            )
            logger.info("[Calibration] Loaded Platt params from %s", target)
            return True
        except Exception as exc:
            logger.warning("[Calibration] Failed to load params from %s: %s", target, exc)
            return False

    def apply(self, raw_score: float) -> float:
        """
        Apply calibration to a raw verification score.

        If not fitted, returns the raw score unchanged (identity).
        If fitted, applies sigmoid: expit(a * raw_score + b).

        Args:
            raw_score: Raw ensemble verification score in [0, 1].

        Returns:
            Calibrated probability estimate in [0, 1].
        """
        if not self._fitted or not _CALIBRATION_ENABLED:
            return float(raw_score)
        try:
            from scipy.special import expit  # type: ignore
            return float(expit(self._a * raw_score + self._b))
        except ImportError:
            logger.warning(
                "[Calibration] scipy not installed — calibration disabled. "
                "Run: pip install scipy>=1.11.0"
            )
            return float(raw_score)
        except Exception as exc:
            logger.warning("[Calibration] apply() failed: %s — returning raw score", exc)
            return float(raw_score)

    def is_active(self) -> bool:
        """Returns True if calibration is fitted and enabled."""
        return self._fitted and _CALIBRATION_ENABLED

    def log_data_point(
        self,
        raw_score: float,
        metadata: Dict[str, Any],
        *,
        collection=None,
    ) -> None:
        """
        Persist a raw score data point for future calibration training.

        The ground_truth_label (1=genuine, 0=counterfeit) is NOT recorded here —
        it must be added later by the vendor review workflow when an operator
        confirms or disputes the AI verdict.

        Args:
            raw_score:  The raw ensemble score before calibration.
            metadata:   Contextual info (product_id, session_id, slot, etc.).
            collection: Optional PyMongo collection handle. If None, just logs.
        """
        doc: Dict[str, Any] = {
            "session_id":         f"calib_{metadata.get('session_id') or uuid.uuid4().hex[:12]}",
            "verification_session_id": metadata.get("session_id"),
            "raw_score":          round(float(raw_score), 6),
            "calibrated_score":   round(self.apply(raw_score), 6) if self.is_active() else None,
            "calibration_active": self.is_active(),
            "ground_truth_label": None,   # Filled in by human review later
            "metadata":           metadata,
            "created_at":         datetime.utcnow(),
        }

        if collection is not None:
            try:
                collection.insert_one(doc)
            except Exception as exc:
                logger.warning("[Calibration] Failed to log data point: %s", exc)
        else:
            logger.debug("[Calibration] Data point (no collection): %s", doc)

    def status(self) -> Dict[str, Any]:
        """Return a status dict for health check and debugging."""
        return {
            "fitted":             self._fitted,
            "enabled":            _CALIBRATION_ENABLED,
            "active":             self.is_active(),
            "params":             {"a": self._a, "b": self._b} if self._fitted else None,
            "fit_sample_count":   self._fit_sample_count,
            "fit_timestamp":      self._fit_timestamp.isoformat() if self._fit_timestamp else None,
            "note": (
                "Identity pass-through — no calibration applied. "
                "Collect labeled data and call fit() to activate."
            ) if not self._fitted else (
                "Platt scaling active." if _CALIBRATION_ENABLED
                else "Fitted but AUTHENTIQ_CALIBRATION_ENABLED=false — identity mode."
            ),
        }


# ── Module-level singleton ─────────────────────────────────────────────────────
# Import and use this instance everywhere to share calibration state.
calibrator = PlattCalibrator()

# Best-effort: load previously-fitted params so calibration survives a restart.
# (apply() still no-ops unless AUTHENTIQ_CALIBRATION_ENABLED is also set.)
try:
    calibrator.load_params()
except Exception:  # never let calibration bootstrap break import
    pass
