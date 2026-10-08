"""Settings Service for InvoiceGuard.

Loads hierarchical configuration from config/*.yaml with dynamic database overrides
and provides date-aware GST slab validation, tolerances, and engine toggles.
"""

from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import yaml
from sqlalchemy.orm import Session

from backend.app.models.entities import Setting


class SettingsService:
    def __init__(self, config_dir: Optional[Path] = None) -> None:
        if config_dir is None:
            # Repo root / config
            self.config_dir = (
                Path(__file__).resolve().parent.parent.parent.parent / "config"
            )
        else:
            self.config_dir = config_dir

        self._defaults: dict[str, Any] = {}
        self._db_overrides: dict[str, Any] = {}
        self.reload_defaults()

    def reload_defaults(self) -> None:
        """Load default YAML configurations from config/*.yaml."""
        self._defaults = {}
        if not self.config_dir.exists():
            return

        for yaml_file in self.config_dir.glob("*.yaml"):
            try:
                with open(yaml_file, "r", encoding="utf-8") as f:
                    content = yaml.safe_load(f)
                    if isinstance(content, dict):
                        self._defaults[yaml_file.stem] = content
            except Exception:
                pass

    def load_db_overrides(self, db: Session) -> None:
        """Overlay overrides stored in database settings table."""
        try:
            records = db.query(Setting).all()
            for r in records:
                self._db_overrides[r.key] = r.value_json
        except Exception:
            pass

    def get_setting_section(self, section: str) -> dict[str, Any]:
        """Get merged dictionary for a top-level section."""
        # 1. Defaults from section yaml (e.g. 'settings', 'tax_slabs', 'fusion')
        base = dict(self._defaults.get(section, {}))

        # 2. Check if main settings.yaml has this as a key (e.g. 'engine_toggles', 'tolerances')
        main_settings = self._defaults.get("settings", {})
        if section in main_settings and isinstance(main_settings[section], dict):
            base.update(main_settings[section])

        # 3. Database overrides
        if section in self._db_overrides and isinstance(self._db_overrides[section], dict):
            base.update(self._db_overrides[section])

        return base

    def get(self, key_path: str, default: Any = None) -> Any:
        """Retrieve setting by dot-separated path, e.g. 'tolerances.line_total_abs'."""
        parts = key_path.split(".")
        current = self.get_setting_section(parts[0])

        for part in parts[1:]:
            if isinstance(current, dict) and part in current:
                current = current[part]
            else:
                return default
        return current if current is not None else default

    def get_tolerance(self, name: str, default: float = 1.0) -> float:
        """Get tolerance value by name."""
        val = self.get(f"tolerances.{name}", default)
        try:
            return float(val)
        except (ValueError, TypeError):
            return default

    def is_engine_enabled(self, engine_name: str) -> bool:
        """Check if an engine is enabled."""
        val = self.get(f"engine_toggles.{engine_name}", True)
        return bool(val)

    def get_thresholds(self) -> dict[str, float]:
        """Get risk level thresholds."""
        thresholds = self.get_setting_section("thresholds")
        if not thresholds:
            thresholds = self.get("thresholds", {})
        return {
            "low": float(thresholds.get("low", 30.0)),
            "medium": float(thresholds.get("medium", 60.0)),
            "high": float(thresholds.get("high", 80.0)),
        }

    def get_pdf_editors(self) -> list[str]:
        """Return list of known PDF editor / modifier producer names."""
        editor_conf = self.get_setting_section("pdf_editors")
        producers = editor_conf.get("producers", [])
        if not producers and "producers" in self._defaults.get("pdf_editors", {}):
            producers = self._defaults["pdf_editors"]["producers"]
        return list(producers)

    def get_fusion_config(self) -> dict[str, Any]:
        """Return fusion weights, combination ratio and escalation rules."""
        conf = self.get_setting_section("fusion")
        if not conf:
            conf = self._defaults.get("fusion", {})
        return conf

    def get_valid_gst_slabs(self, invoice_date: Optional[str] = None) -> list[float]:
        """Return valid GST percentage slabs for the given invoice date.

        If invoice_date is None or cannot be parsed, returns union of standard slabs.
        """
        slab_data = self._defaults.get("tax_slabs", {}).get("slabs", [])
        if not slab_data:
            # Fallback hardcoded if yaml missing
            return [0.0, 0.25, 1.5, 3.0, 5.0, 12.0, 18.0, 28.0, 40.0]

        parsed_date: Optional[datetime] = None
        if invoice_date:
            clean_date = str(invoice_date).strip()
            # Try parsing ISO yyyy-mm-dd or dd/mm/yyyy
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%Y/%m/%d"):
                try:
                    parsed_date = datetime.strptime(clean_date[:10], fmt)
                    break
                except ValueError:
                    pass

        if parsed_date is None:
            # Return all known rates across all eras
            all_rates = set()
            for s in slab_data:
                for r in s.get("standard_rates", []) + s.get("special_rates", []):
                    all_rates.add(float(r))
            return sorted(all_rates)

        target_iso = parsed_date.strftime("%Y-%m-%d")
        matched_rates = set()
        for era in slab_data:
            valid_from = era.get("valid_from", "1900-01-01")
            valid_to = era.get("valid_to", "9999-12-31")
            if valid_from <= target_iso <= valid_to:
                for r in era.get("standard_rates", []) + era.get("special_rates", []):
                    matched_rates.add(float(r))

        if not matched_rates:
            # Default union fallback
            for s in slab_data:
                for r in s.get("standard_rates", []) + s.get("special_rates", []):
                    matched_rates.add(float(r))

        return sorted(matched_rates)

    def is_valid_gst_slab(self, rate: float, invoice_date: Optional[str] = None) -> bool:
        """Check if tax rate falls into a valid GST slab within tolerance."""
        tolerance = float(self._defaults.get("tax_slabs", {}).get("tolerance", 0.05))
        valid_slabs = self.get_valid_gst_slabs(invoice_date)
        return any(abs(rate - slab) <= tolerance for slab in valid_slabs)

    def update_setting(self, db: Session, key: str, value: dict[str, Any]) -> None:
        """Update or insert a setting in the database and update memory cache."""
        record = db.query(Setting).filter(Setting.key == key).first()
        if record:
            record.value_json = value
        else:
            record = Setting(key=key, value_json=value)
            db.add(record)
        db.commit()
        self._db_overrides[key] = value


settings_service = SettingsService()
