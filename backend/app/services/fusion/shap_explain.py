"""SHAP explanation builder — Blueprint section 9.

Uses TreeExplainer to compute SHAP values for a single XGBoost prediction,
then returns the top-N contributors as ordered (feature_name, shap_value) dicts
for the RiskResult.shap_top field and the frontend SHAP panel.
"""

from __future__ import annotations

import logging
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# Cache explainers to avoid re-parsing booster trees on every inference call
_EXPLAINER_CACHE: dict[int, Any] = {}
_SHAP_PATCHED: bool = False


def _ensure_shap_patched() -> None:
    """Fix SHAP 0.44+ compatibility with XGBoost 2.x UBJSON format where base_score is [val]."""
    global _SHAP_PATCHED
    if _SHAP_PATCHED:
        return
    try:
        import shap.explainers._tree as st

        orig_decode = getattr(st, "decode_ubjson_buffer", None)
        if orig_decode is not None:

            def safe_decode(fd: Any) -> Any:
                res = orig_decode(fd)
                try:
                    lmp = res.get("learner", {}).get("learner_model_param", {})
                    if "base_score" in lmp and isinstance(lmp["base_score"], str):
                        lmp["base_score"] = lmp["base_score"].strip("[]")
                except Exception:
                    pass
                return res

            st.decode_ubjson_buffer = safe_decode
        _SHAP_PATCHED = True
    except Exception as exc:
        logger.debug("SHAP XGBoost patch could not be applied: %s", exc)


def compute_shap_top(
    pipeline: Any,
    feature_vector: list[float],
    feature_names: list[str],
    top_n: int = 8,
) -> list[dict[str, Any]]:
    """Compute SHAP values for one sample, return top-N contributors.

    Args:
        pipeline: Fitted CalibratedClassifierCV wrapping an XGBoost classifier.
        feature_vector: Single sample feature values.
        feature_names: Parallel list of column names.
        top_n: How many top contributors to return.

    Returns:
        List of dicts: [{feature, shap_value, value, direction}, ...]
        sorted descending by |shap_value|. Empty list if SHAP unavailable.
    """
    try:
        import shap  # type: ignore[import]
    except ImportError:
        logger.warning("shap package not installed — SHAP contributions unavailable.")
        return []

    try:
        _ensure_shap_patched()

        # CalibratedClassifierCV wraps the base estimator
        base_estimator = _unwrap_calibrated(pipeline)
        if base_estimator is None:
            return []

        model_id = id(base_estimator)
        if model_id not in _EXPLAINER_CACHE:
            try:
                _EXPLAINER_CACHE[model_id] = shap.TreeExplainer(
                    base_estimator, feature_perturbation="tree_path_dependent"
                )
            except Exception:
                _EXPLAINER_CACHE[model_id] = shap.TreeExplainer(base_estimator)

        explainer = _EXPLAINER_CACHE[model_id]
        X = np.array([feature_vector], dtype=np.float64)
        shap_values = explainer.shap_values(X)

        # For binary classification, shap_values may be shape (1, n_features)
        # or list[array] for each class — grab class-1 (tampered)
        if isinstance(shap_values, list):
            sv = shap_values[1][0]  # class 1, first sample
        elif shap_values.ndim == 2:
            sv = shap_values[0]  # single output
        else:
            sv = shap_values

        # Build sorted contributor list
        contributors = []
        for i, (name, sv_i) in enumerate(zip(feature_names, sv)):
            contributors.append(
                {
                    "feature": name,
                    "shap_value": round(float(sv_i), 4),
                    "value": round(float(feature_vector[i]), 4),
                    "direction": "increases_risk" if sv_i > 0 else "decreases_risk",
                }
            )

        contributors.sort(key=lambda x: abs(x["shap_value"]), reverse=True)
        return contributors[:top_n]

    except Exception as exc:
        logger.debug("SHAP computation failed: %s", exc)
        return []


def _unwrap_calibrated(pipeline: Any) -> Any | None:
    """Extract the underlying XGBoost classifier from a calibration pipeline."""
    try:
        # sklearn CalibratedClassifierCV stores calibrated_classifiers_
        if hasattr(pipeline, "calibrated_classifiers_"):
            # Each calibrated classifier has a 'estimator' attribute
            calib = pipeline.calibrated_classifiers_[0]
            if hasattr(calib, "estimator"):
                return calib.estimator
        # If the pipeline itself is an XGB booster
        if hasattr(pipeline, "get_booster"):
            return pipeline
    except Exception:
        pass
    return None
