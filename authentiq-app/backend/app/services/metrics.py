"""
Counterfeit-detection metrics (audit fix 1.4-doc item 1.7).

Raw *accuracy* is the wrong headline for this problem: it is imbalanced (most
scanned units are genuine) and asymmetric (missing a counterfeit is far worse
than a false alarm). A trivial "always say genuine" model scores ~98% accuracy
and catches zero fakes. This module reports the metrics that actually matter:

    * counterfeit recall @ a fixed false-positive rate  (the headline SLA)
    * precision / recall / F1 for the counterfeit class at an operating threshold
    * PR-AUC and ROC-AUC (threshold-independent separability)
    * the full confusion matrix at the operating threshold

Label / score convention (matches calibration_layer + the VLM pipeline):
    y_true:   1 = genuine, 0 = counterfeit
    y_score:  authenticity score in [0, 1] — HIGHER means MORE genuine

Internally the *positive* class is the counterfeit (the event we detect): a unit
is flagged counterfeit when its authenticity score falls below a threshold `tau`.

sklearn is a declared dependency and is used for AUC when available; a numpy
trapezoidal fallback keeps the module usable in a minimal environment.
"""

from __future__ import annotations

from typing import Dict, List, Optional, Sequence

import numpy as np

# The production SLA target from the roadmap: >=95% counterfeit recall at <=2% FPR.
DEFAULT_TARGET_FPR = 0.02


def _as_arrays(y_true: Sequence[int], y_score: Sequence[float]) -> tuple[np.ndarray, np.ndarray]:
    yt = np.asarray(list(y_true), dtype=float)
    ys = np.asarray(list(y_score), dtype=float)
    if yt.shape != ys.shape:
        raise ValueError(f"y_true and y_score length mismatch: {yt.shape} vs {ys.shape}")
    return yt, ys


def threshold_at_fpr(
    y_true: Sequence[int],
    y_score: Sequence[float],
    target_fpr: float = DEFAULT_TARGET_FPR,
) -> Optional[float]:
    """Largest authenticity threshold `tau` whose genuine-flag rate (FPR) is <= target_fpr.

    A unit is flagged counterfeit when score < tau. We pick the highest tau that
    still keeps the fraction of GENUINE units flagged at or below target_fpr, so
    counterfeit recall is maximised subject to the false-positive budget.
    Returns None if there are no genuine samples to calibrate against.
    """
    yt, ys = _as_arrays(y_true, y_score)
    genuine = ys[yt == 1]
    if genuine.size == 0:
        return None
    # tau = target_fpr quantile of genuine scores: P(genuine < tau) ~= target_fpr.
    # 'lower' interpolation guarantees we do not exceed the FPR budget.
    tau = float(np.quantile(genuine, max(0.0, min(1.0, target_fpr)), method="lower"))
    return tau


def confusion_at_threshold(
    y_true: Sequence[int],
    y_score: Sequence[float],
    tau: float,
) -> Dict[str, int]:
    """Confusion counts with COUNTERFEIT as the positive class (flag when score < tau)."""
    yt, ys = _as_arrays(y_true, y_score)
    flagged_fake = ys < tau
    is_fake = yt == 0
    tp = int(np.sum(flagged_fake & is_fake))          # counterfeit correctly flagged
    fp = int(np.sum(flagged_fake & ~is_fake))         # genuine wrongly flagged
    fn = int(np.sum(~flagged_fake & is_fake))         # counterfeit missed
    tn = int(np.sum(~flagged_fake & ~is_fake))        # genuine correctly passed
    return {"tp": tp, "fp": fp, "fn": fn, "tn": tn}


def _safe_div(a: float, b: float) -> Optional[float]:
    return float(a / b) if b else None


def _roc_auc(is_fake: np.ndarray, fake_score: np.ndarray) -> Optional[float]:
    if is_fake.min() == is_fake.max():
        return None  # only one class present — AUC undefined
    try:
        from sklearn.metrics import roc_auc_score  # type: ignore
        return float(roc_auc_score(is_fake, fake_score))
    except Exception:
        # Rank-based (Mann–Whitney U) fallback, ties handled via average ranks.
        order = np.argsort(fake_score, kind="mergesort")
        ranks = np.empty_like(order, dtype=float)
        ranks[order] = np.arange(1, len(fake_score) + 1)
        # average ranks for ties
        _, inv, counts = np.unique(fake_score, return_inverse=True, return_counts=True)
        csum = np.cumsum(counts)
        start = csum - counts
        avg = (start + csum + 1) / 2.0
        ranks = avg[inv]
        n_pos = float(np.sum(is_fake == 1))
        n_neg = float(np.sum(is_fake == 0))
        sum_pos = float(np.sum(ranks[is_fake == 1]))
        return (sum_pos - n_pos * (n_pos + 1) / 2.0) / (n_pos * n_neg)


def _pr_auc(is_fake: np.ndarray, fake_score: np.ndarray) -> Optional[float]:
    if is_fake.min() == is_fake.max():
        return None
    try:
        from sklearn.metrics import average_precision_score  # type: ignore
        return float(average_precision_score(is_fake, fake_score))
    except Exception:
        # Trapezoidal area under a manually swept precision-recall curve.
        thresholds = np.unique(fake_score)
        recalls: List[float] = []
        precisions: List[float] = []
        pos = float(np.sum(is_fake == 1))
        for t in np.sort(thresholds):
            pred = fake_score >= t
            tp = float(np.sum(pred & (is_fake == 1)))
            fp = float(np.sum(pred & (is_fake == 0)))
            recalls.append(tp / pos if pos else 0.0)
            precisions.append(tp / (tp + fp) if (tp + fp) else 1.0)
        order = np.argsort(recalls)
        r = np.asarray(recalls)[order]
        p = np.asarray(precisions)[order]
        return float(np.trapz(p, r))


def compute_metrics(
    y_true: Sequence[int],
    y_score: Sequence[float],
    *,
    target_fpr: float = DEFAULT_TARGET_FPR,
    operating_threshold: Optional[float] = None,
) -> Dict[str, object]:
    """Full counterfeit-detection metric report.

    Args:
        y_true:   1 = genuine, 0 = counterfeit.
        y_score:  authenticity score in [0, 1] (higher = more genuine).
        target_fpr: false-positive budget for the headline recall metric.
        operating_threshold: authenticity threshold used for the confusion matrix
            and precision/recall/F1. Defaults to the threshold that meets target_fpr.

    Returns a JSON-serialisable dict. Values that cannot be computed (e.g. a
    single-class input) are None with an explanatory `notes` entry.
    """
    yt, ys = _as_arrays(y_true, y_score)
    n = int(yt.size)
    n_genuine = int(np.sum(yt == 1))
    n_counterfeit = int(np.sum(yt == 0))
    notes: List[str] = []

    tau_at_fpr = threshold_at_fpr(yt, ys, target_fpr)
    recall_at_fpr: Optional[float] = None
    achieved_fpr: Optional[float] = None
    if tau_at_fpr is not None and n_counterfeit > 0:
        cm = confusion_at_threshold(yt, ys, tau_at_fpr)
        recall_at_fpr = _safe_div(cm["tp"], cm["tp"] + cm["fn"])
        achieved_fpr = _safe_div(cm["fp"], cm["fp"] + cm["tn"])
    elif n_counterfeit == 0:
        notes.append("No counterfeit samples — recall@FPR undefined.")
    elif n_genuine == 0:
        notes.append("No genuine samples — FPR/threshold undefined.")

    tau_op = operating_threshold if operating_threshold is not None else tau_at_fpr
    confusion: Optional[Dict[str, int]] = None
    precision = recall = f1 = None
    if tau_op is not None:
        confusion = confusion_at_threshold(yt, ys, tau_op)
        precision = _safe_div(confusion["tp"], confusion["tp"] + confusion["fp"])
        recall = _safe_div(confusion["tp"], confusion["tp"] + confusion["fn"])
        if precision is not None and recall is not None and (precision + recall) > 0:
            f1 = 2 * precision * recall / (precision + recall)

    is_fake = (yt == 0).astype(int)
    fake_score = 1.0 - ys  # higher = more likely counterfeit
    roc_auc = _roc_auc(is_fake, fake_score)
    pr_auc = _pr_auc(is_fake, fake_score)

    return {
        "n": n,
        "n_genuine": n_genuine,
        "n_counterfeit": n_counterfeit,
        "positive_class": "counterfeit",
        "target_fpr": target_fpr,
        "threshold_at_fpr": round(tau_at_fpr, 6) if tau_at_fpr is not None else None,
        "counterfeit_recall_at_fpr": round(recall_at_fpr, 4) if recall_at_fpr is not None else None,
        "achieved_fpr": round(achieved_fpr, 4) if achieved_fpr is not None else None,
        "operating_threshold": round(tau_op, 6) if tau_op is not None else None,
        "precision": round(precision, 4) if precision is not None else None,
        "recall": round(recall, 4) if recall is not None else None,
        "f1": round(f1, 4) if f1 is not None else None,
        "roc_auc": round(roc_auc, 4) if roc_auc is not None else None,
        "pr_auc": round(pr_auc, 4) if pr_auc is not None else None,
        "confusion_matrix": confusion,
        "notes": notes,
    }


def format_report(metrics: Dict[str, object]) -> str:
    """Human-readable one-block summary for CLI / logs."""
    m = metrics
    lines = [
        "Counterfeit-detection metrics (positive class = counterfeit):",
        f"  samples: {m['n']}  (genuine={m['n_genuine']}, counterfeit={m['n_counterfeit']})",
        f"  counterfeit recall @ {float(m['target_fpr']) * 100:.0f}% FPR: "
        f"{m['counterfeit_recall_at_fpr']}  (achieved FPR {m['achieved_fpr']}, tau {m['threshold_at_fpr']})",
        f"  precision/recall/F1 @ operating tau {m['operating_threshold']}: "
        f"{m['precision']} / {m['recall']} / {m['f1']}",
        f"  ROC-AUC: {m['roc_auc']}   PR-AUC: {m['pr_auc']}",
        f"  confusion: {m['confusion_matrix']}",
    ]
    for note in m.get("notes", []) or []:
        lines.append(f"  note: {note}")
    return "\n".join(lines)
