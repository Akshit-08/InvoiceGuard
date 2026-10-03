"""Bank Engine for InvoiceGuard.

Implements Blueprint section 8.6:
- BANK_ACCOUNT_CHANGED
- BANK_ACCOUNT_SHARED_WITH_OTHER_VENDOR
- IFSC_CHANGED_SAME_ACCOUNT
- BANK_DETAILS_MISSING
"""

import hashlib

from backend.app.schemas.contracts import Finding, SignalResult
from backend.app.services.engines.base import AnalysisContext, BaseEngine
from backend.app.services.settings_service import settings_service


def hash_account(account_number: str) -> str:
    """Hash bank account number for privacy."""
    return hashlib.sha256(account_number.encode("utf-8")).hexdigest()


class BankEngine(BaseEngine):
    name = "bank_change"
    category = "rule"

    def analyze(self, context: AnalysisContext) -> SignalResult:
        if not settings_service.is_engine_enabled("bank_change"):
            return SignalResult(name=self.name, score=0.0, confidence=1.0, findings=[], features={})

        findings: list[Finding] = []
        features = {}

        data = context.data
        vendor_id = context.indices.get("vendor_id")

        if not vendor_id:
            return SignalResult(name=self.name, score=0.0, confidence=1.0, findings=findings, features=features)

        payment = data.payment
        if not payment or not payment.account_number or not payment.account_number.value:
            findings.append(self.create_finding(
                finding_type="BANK_DETAILS_MISSING",
                severity="info",
                score=15.0,
                confidence=1.0,
                title="Bank Account Details Missing",
                summary="No bank account number was extracted from the invoice.",
                expected="A valid bank account number",
                found="Missing",
                difference="",
                recommended_action="Ensure bank details are present before approving payment."
            ))
            return SignalResult(
                name=self.name,
                score=self.aggregate_score(findings),
                confidence=1.0,
                findings=findings,
                features=features
            )

        account_raw = str(payment.account_number.value).strip()
        account_h = hash_account(account_raw)
        last4 = account_raw[-4:] if len(account_raw) >= 4 else account_raw
        display_acc = f"XXXXXX{last4}"
        curr_ifsc = (payment.ifsc.value or "").strip().upper() if payment.ifsc else ""

        # Retrieve accounts from indices passed by pipeline
        vendor_accounts = context.indices.get("vendor_accounts", [])
        all_accounts = context.indices.get("all_accounts", [])

        # Check if shared with other vendors
        shared_with = []
        for acc in all_accounts:
            if acc.get("account_hash") == account_h and acc.get("vendor_id") != vendor_id:
                shared_with.append(acc.get("vendor_name", "Unknown Vendor"))

        if shared_with:
            findings.append(self.create_finding(
                finding_type="BANK_ACCOUNT_SHARED_WITH_OTHER_VENDOR",
                severity="critical",
                score=95.0,
                confidence=0.95,
                title="Bank Account Shared Across Vendors",
                summary=f"The extracted bank account {display_acc} is also associated with other vendors: {', '.join(shared_with)}.",
                expected="Bank account unique to this vendor",
                found=display_acc,
                difference="Matches other vendors",
                recommended_action="Suspend payment immediately. Verify vendor identity to rule out fraud.",
                field="payment.account_number",
                bbox=payment.account_number.bbox if payment.account_number else None
            ))

        # Check vendor's own history
        if vendor_accounts:
            known_hashes = [a.get("account_hash") for a in vendor_accounts]
            if account_h not in known_hashes:
                findings.append(self.create_finding(
                    finding_type="BANK_ACCOUNT_CHANGED",
                    severity="high",
                    score=85.0,
                    confidence=0.9,
                    title="New Bank Account Detected",
                    summary=f"Bank account {display_acc} has never been used by this vendor before.",
                    expected="Previously used account",
                    found=display_acc,
                    difference="Account mismatch",
                    recommended_action="Call the vendor at a known good phone number to confirm the account change.",
                    field="payment.account_number",
                    bbox=payment.account_number.bbox if payment.account_number else None
                ))
            else:
                # Account is known, check IFSC
                for acc in vendor_accounts:
                    if acc.get("account_hash") == account_h:
                        hist_ifsc = acc.get("ifsc", "")
                        if hist_ifsc and curr_ifsc and curr_ifsc != hist_ifsc:
                            findings.append(self.create_finding(
                                finding_type="IFSC_CHANGED_SAME_ACCOUNT",
                                severity="medium",
                                score=60.0,
                                confidence=0.9,
                                title="IFSC Code Changed",
                                summary=f"The account {display_acc} was previously used with IFSC '{hist_ifsc}', but this invoice shows '{curr_ifsc}'.",
                                expected=hist_ifsc,
                                found=curr_ifsc,
                                difference="IFSC mismatch",
                                recommended_action="Verify the new IFSC code with the vendor's bank branch.",
                                field="payment.ifsc",
                                bbox=payment.ifsc.bbox if payment.ifsc else None
                            ))

        return SignalResult(
            name=self.name,
            score=self.aggregate_score(findings),
            confidence=0.95,
            findings=findings,
            features=features
        )
