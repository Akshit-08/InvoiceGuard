"""Risk Fusion Baseline implementation for InvoiceGuard.

Implements Blueprint section 9:
- Noisy-OR baseline fusion
- Escalation rules
- Explainability (top findings, plain-English summary)
"""

from typing import Any
from backend.app.schemas.contracts import Finding, RiskResult, SignalResult

DEFAULT_WEIGHTS = {
    "financial": 0.85,
    "tax_identity": 0.6,
    "duplicate": 0.8,
    "vendor": 0.6,
    "bank_change": 0.8,
    "identifiers": 0.4,
    "visual": 0.5,
}

def calculate_noisy_or(signals: list[SignalResult], weights: dict[str, float]) -> float:
    """Baseline deterministic explainable fusion using noisy-OR."""
    prob_no_anomaly = 1.0
    for sig in signals:
        w = weights.get(sig.name, 0.5)
        # s_i is 0-100, we need probability 0-1
        p_i = (sig.score / 100.0)
        # Combine using noisy-OR logic
        prob_no_anomaly *= (1.0 - (w * p_i))
    
    return round((1.0 - prob_no_anomaly) * 100.0, 1)


class FusionEngine:
    """Fuses multiple engine signals into a final 0-100 risk score."""
    
    def fuse(self, signals: list[SignalResult], weights: dict[str, float] = None) -> RiskResult:
        if weights is None:
            weights = DEFAULT_WEIGHTS
        
        baseline_score = calculate_noisy_or(signals, weights)
        ml_score = 0.0 # To be implemented (XGBoost)
        
        # Determine final score (configurable, for now just use baseline if ML is missing)
        final_score = baseline_score
        
        escalations = []
        # Escalation rules
        # >= 2 independent signals >= 70 -> floor 65
        high_signals = [s for s in signals if s.score >= 70.0]
        if len(high_signals) >= 2:
            if final_score < 65.0:
                final_score = 65.0
            escalations.append("Multiple independent engines returned high risk (>= 70), escalating floor to 65.")
            
        # SHARED_BANK_ACCOUNT_ACROSS_VENDORS or EXACT_FILE_DUPLICATE + changed amount -> floor 75
        for sig in signals:
            for finding in sig.findings:
                if finding.type in ("BANK_ACCOUNT_SHARED_WITH_OTHER_VENDOR", "MODIFIED_DUPLICATE"):
                    if final_score < 75.0:
                        final_score = 75.0
                    escalations.append(f"Critical anomaly detected ({finding.type}), escalating floor to 75.")
                    
        level = "LOW"
        if final_score >= 80.0:
            level = "CRITICAL"
        elif final_score >= 60.0:
            level = "HIGH"
        elif final_score >= 30.0:
            level = "MEDIUM"
            
        recommendation = "Review carefully."
        if level == "CRITICAL":
            recommendation = "Do not approve payment. Investigate immediately."
        elif level == "HIGH":
            recommendation = "Hold payment pending manual review and vendor verification."
        elif level == "MEDIUM":
            recommendation = "Review for standard anomalies."
        elif level == "LOW":
            recommendation = "Standard processing."

        # Collect and sort findings
        all_findings = []
        for s in signals:
            all_findings.extend(s.findings)
        
        # Sort by score * confidence
        all_findings.sort(key=lambda f: f.score * f.confidence, reverse=True)
        
        signal_scores = {s.name: s.score for s in signals}
        
        return RiskResult(
            overall_score=round(final_score, 1),
            level=level,
            level_thresholds={"low": 29, "medium": 59, "high": 79},
            probability=final_score / 100.0,
            signals=signal_scores,
            confidence=0.9, # Placeholder
            baseline_score=baseline_score,
            ml_score=ml_score,
            shap_top=[], # Placeholder
            escalations=escalations,
            recommendation=recommendation,
            disclaimer="InvoiceGuard flags anomalies for human review. It does not determine fraud."
        )

fusion_engine = FusionEngine()
