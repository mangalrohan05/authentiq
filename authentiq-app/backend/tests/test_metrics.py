"""Unit tests for counterfeit-detection metrics (audit item 1.7).

Pure-logic: no models, DB, or network required.
"""

from __future__ import annotations

from app.services import metrics


def test_separable_set_perfect_recall_and_auc():
    # Genuine scores high, counterfeit low → perfectly separable.
    y_true = [1, 1, 1, 1, 1, 0, 0, 0, 0]
    y_score = [0.90, 0.95, 0.80, 0.85, 0.99, 0.10, 0.20, 0.05, 0.30]
    m = metrics.compute_metrics(y_true, y_score, target_fpr=0.02)

    assert m["n_genuine"] == 5
    assert m["n_counterfeit"] == 4
    assert m["counterfeit_recall_at_fpr"] == 1.0
    assert m["achieved_fpr"] == 0.0
    assert m["roc_auc"] == 1.0
    assert m["pr_auc"] == 1.0
    # Positive class is the counterfeit.
    assert m["positive_class"] == "counterfeit"


def test_confusion_matrix_at_threshold():
    y_true = [1, 1, 0, 0]
    y_score = [0.9, 0.8, 0.2, 0.1]
    cm = metrics.confusion_at_threshold(y_true, y_score, tau=0.5)
    # score < 0.5 flagged counterfeit: both counterfeits flagged, no genuine flagged.
    assert cm == {"tp": 2, "fp": 0, "fn": 0, "tn": 2}


def test_threshold_respects_fpr_budget():
    # 100 genuine spread across [0.5, 1.0]; a 2% FPR threshold must flag <= 2 of them.
    genuine = [0.5 + i * 0.005 for i in range(100)]
    y_true = [1] * 100 + [0] * 10
    y_score = genuine + [0.1] * 10
    tau = metrics.threshold_at_fpr(y_true, y_score, target_fpr=0.02)
    flagged_genuine = sum(1 for s in genuine if s < tau)
    assert flagged_genuine <= 2


def test_single_class_auc_is_none():
    # Only genuine samples present — AUC and recall@FPR are undefined, not a crash.
    m = metrics.compute_metrics([1, 1, 1], [0.9, 0.8, 0.95])
    assert m["roc_auc"] is None
    assert m["pr_auc"] is None
    assert m["counterfeit_recall_at_fpr"] is None
    assert any("counterfeit" in n.lower() for n in m["notes"])


def test_overlapping_scores_auc_between_half_and_one():
    # Imperfect but better-than-random separation.
    y_true = [1, 1, 1, 0, 0, 0]
    y_score = [0.7, 0.6, 0.55, 0.5, 0.4, 0.45]
    m = metrics.compute_metrics(y_true, y_score)
    assert 0.5 < m["roc_auc"] <= 1.0


def test_format_report_runs():
    m = metrics.compute_metrics([1, 0, 1, 0], [0.9, 0.1, 0.8, 0.2])
    text = metrics.format_report(m)
    assert "counterfeit recall" in text
