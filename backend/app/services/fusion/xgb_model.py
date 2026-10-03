"""XGBoost fusion model wrapper — Blueprint section 9.

Wraps a trained, calibrated XGBoost classifier + isotonic calibration model.
At inference: returns a probability [0, 1] → converted to 0–100 score.
Falls back gracefully if the model artifact is absent (FUSION_MODE=baseline).

Model inputs: feature vector from feature_builder.build_feature_vector()
Model output: tampered probability → ×100 → ml_score
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any

import numpy as np

logger = logging.getLogger(__name__)

# Default path relative to the repo root
MODEL_PATH = Path("ml/artifacts/fusion_xgb.joblib")


class XGBFusionModel:
    """Thin wrapper around a persisted XGBoost + isotonic calibration pipeline."""

    def __init__(self, model_path: Path = MODEL_PATH) -> None:
        self._pipeline: Any | None = None
        self._feature_names: list[str] | None = None
        self._model_path = model_path
        self._loaded = False
        self._load_attempted = False

    # ── Lazy load ─────────────────────────────────────────────────────────────
    def _try_load(self) -> None:
        if self._load_attempted:
            return
        self._load_attempted = True

        # Check FUSION_MODE env override
        if os.environ.get("FUSION_MODE", "").lower() == "baseline":
            logger.info("FUSION_MODE=baseline — XGBoost model skipped.")
            return

        if not self._model_path.exists():
            logger.warning(
                "XGBoost fusion model not found at %s. "
                "Run `python ml/training/train_fusion.py` to train it.",
                self._model_path,
            )
            return

        try:
            import joblib  # type: ignore[import]

            artifact = joblib.load(self._model_path)
            self._pipeline = artifact["pipeline"]
            self._feature_names = artifact.get("feature_names")
            self._loaded = True
            logger.info("XGBoost fusion model loaded from %s.", self._model_path)
        except Exception:
            logger.exception("Failed to load XGBoost fusion model.")

    # ── Public API ────────────────────────────────────────────────────────────
    @property
    def is_available(self) -> bool:
        self._try_load()
        return self._loaded

    def predict_score(self, feature_vector: list[float]) -> float:
        """Return a 0–100 ML risk score for the given feature vector.

        Returns 0.0 if the model is unavailable (caller falls back to baseline).
        """
        self._try_load()
        if not self._loaded or self._pipeline is None:
            return 0.0

        try:
            X = np.array([feature_vector], dtype=np.float64)
            # CalibratedClassifierCV returns probabilities for class 1 (tampered)
            prob = float(self._pipeline.predict_proba(X)[0, 1])
            return round(prob * 100.0, 1)
        except Exception:
            logger.exception("XGBoost inference failed — falling back to 0.0.")
            return 0.0


# Module-level singleton
xgb_model = XGBFusionModel()
