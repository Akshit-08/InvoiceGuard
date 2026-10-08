"""Vendor Simulator for InvoiceGuard Synthetic Data Engine.

Generates 40+ realistic Indian vendors with valid GSTINs, PANs, IFSCs,
log-normal invoice amount distributions, and historical transaction series.
"""

import hashlib
import random
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Optional

import numpy as np
import pandas as pd

from ml.synthetic.gstin import STATE_CODES, generate_valid_gstin

MAJOR_BANKS = [
    ("HDFC Bank", "HDFC"),
    ("State Bank of India", "SBIN"),
    ("ICICI Bank", "ICIC"),
    ("Axis Bank", "UTIB"),
    ("Kotak Mahindra Bank", "KKBK"),
    ("Punjab National Bank", "PUNB"),
    ("Bank of Baroda", "BARB"),
]

VENDOR_CATEGORIES = [
    "IT Services & Cloud Hosting",
    "Office Supplies & Stationery",
    "Hardware & Electronics",
    "Logistics & Freight Services",
    "Legal & Financial Consulting",
    "Security & Facility Management",
    "Corporate Catering & Events",
    "Marketing & Digital Media",
    "Industrial Maintenance & Repairs",
]

NUMBERING_PATTERNS = [
    "INV/{FY}/{seq:04d}",
    "INV-{YYYY}-{seq:04d}",
    "{prefix}/{FY}/{seq:03d}",
    "{prefix}-{YYYY}-{seq:04d}",
    "TAX/{FY}/{seq:05d}",
]


def generate_pan(entity_type: str = "C") -> str:
    """Generate valid Indian PAN (5 letters + 4 digits + 1 letter).

    4th char represents entity: 'C' (Company), 'P' (Person), 'F' (Firm).
    """
    letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    first3 = "".join(random.choices(letters, k=3))
    fifth = random.choice(letters)
    digits = f"{random.randint(1000, 9999)}"
    last = random.choice(letters)
    return f"{first3}{entity_type}{fifth}{digits}{last}"


def generate_ifsc(bank_code: str) -> str:
    """Generate 11-character IFSC: 4 letters + 0 + 6 alphanumeric digits."""
    branch = f"{random.randint(100, 9999):06d}"
    return f"{bank_code}0{branch}"


def generate_account_number() -> str:
    """Generate 11 to 16 digit bank account number."""
    length = random.choice([11, 12, 14, 16])
    first_digit = str(random.randint(1, 9))
    rest = "".join(str(random.randint(0, 9)) for _ in range(length - 1))
    return f"{first_digit}{rest}"


@dataclass
class VendorProfile:
    id: str
    name: str
    category: str
    state_code: str
    state_name: str
    pan: str
    gstin: str
    address: str
    email: str
    phone: str
    bank_name: str
    ifsc: str
    account_number: str
    account_hash: str
    last4: str
    typical_amount_median: float
    typical_amount_sigma: float
    cadence_days: int
    numbering_pattern: str
    tax_rate: float
    prefix: str


class VendorSimulator:
    """Simulates realistic enterprise vendors and transaction histories."""

    def __init__(self, seed: int = 42) -> None:
        self.seed = seed
        random.seed(seed)
        np.random.seed(seed)
        self.vendors: list[VendorProfile] = []

    def generate_vendors(self, count: int = 45) -> list[VendorProfile]:
        """Generate vendor entities with realistic Indian profiles."""
        self.vendors = []
        state_code_list = list(STATE_CODES.keys())

        # Seed realistic corporate names
        corporate_roots = [
            ("Apex", "Solutions Pvt Ltd"),
            ("Zenith", "Technologies LLP"),
            ("Bharat", "Enterprise Solutions"),
            ("Kavach", "Infra & Security Ltd"),
            ("Vistara", "Digital Systems"),
            ("Trident", "Logistics & Transport"),
            ("Indus", "Office Supplies"),
            ("Paramount", "Consulting Group"),
            ("Sterling", "Cloud & Hosting"),
            ("Nova", "Hardware & Networks"),
            ("Omni", "Facilities & Maintenance"),
            ("Synergy", "Creative Communications"),
            ("Aditya", "Industrial Tech Pvt Ltd"),
            ("Pragati", "Commercial Services"),
            ("Saffron", "Corporate Catering"),
            ("Garuda", "Express Couriers"),
            ("Samarth", "Electricals & Power"),
            ("Vanguard", "Analytics & Data"),
            ("Aura", "Hospitality Services"),
            ("Falcon", "Security Systems"),
            ("Suraksha", "Safety Gear & Supplies"),
            ("Pinnacle", "Software Labs"),
            ("Narmada", "Paper & Print Solutions"),
            ("Ganga", "Packaging & Boxes"),
            ("Godavari", "Metals & Fabrication"),
            ("Kaveri", "Trading & Supplies"),
            ("Himalaya", "Beverages & Pantry"),
            ("Sahyadri", "Fleet Management"),
            ("Deccan", "Engineering Associates"),
            ("Bengal", "Chemicals & Labs"),
            ("Malabar", "Spice & Agro Supplies"),
            ("Konkan", "Maritime Logistics"),
            ("Thar", "Solar & Green Energy"),
            ("Vindhya", "Consultants LLP"),
            ("Satpura", "Stationery & Uniforms"),
            ("Chola", "Fintech & Support"),
            ("Maurya", "Hospitality Solutions"),
            ("Kalinga", "IT Infrastructure"),
            ("Maratha", "Precision Tools"),
            ("Rajputana", "Heritage Decor & Events"),
            ("Nilgiri", "Organic Foods & Pantry"),
            ("Coromandel", "Sanitation Services"),
            ("Sundarbans", "Eco Products"),
            ("Aravalli", "Mining & Minerals"),
            ("Kaziranga", "Telecom & Network"),
        ]

        for i in range(count):
            vendor_id = f"VND-{i+1:03d}"
            root_idx = i % len(corporate_roots)
            name = f"{corporate_roots[root_idx][0]} {corporate_roots[root_idx][1]}"
            if i >= len(corporate_roots):
                name = f"{corporate_roots[root_idx][0]} Global {corporate_roots[root_idx][1]}"

            category = random.choice(VENDOR_CATEGORIES)
            state_code = random.choice(state_code_list)
            state_name = STATE_CODES[state_code]

            pan = generate_pan("C")
            gstin = generate_valid_gstin(state_code, pan, "1")

            bank_name, bank_code = random.choice(MAJOR_BANKS)
            ifsc = generate_ifsc(bank_code)
            raw_acc = generate_account_number()
            acc_hash = hashlib.sha256(raw_acc.encode("utf-8")).hexdigest()
            last4 = raw_acc[-4:]

            # Distribution parameters: lognormal amount
            # median between 15,000 and 1,50,000 INR
            median = float(random.choice([15000, 25000, 45000, 60000, 95000, 150000, 280000]))
            sigma = float(random.uniform(0.2, 0.5))

            cadence = random.choice([7, 14, 15, 30, 45])
            pattern = random.choice(NUMBERING_PATTERNS)
            tax_rate = random.choice([0.18, 0.18, 0.18, 0.12, 0.05])  # 18% is most common

            clean_prefix = "".join([w[0] for w in name.split()[:2]]).upper()

            address = f"Plot {random.randint(10, 800)}, Sector {random.randint(1, 65)}, Industrial Area, {state_name}"
            email = f"billing@{corporate_roots[root_idx][0].lower().replace(' ', '')}.co.in"
            phone = f"+91 {random.randint(70, 99)}{random.randint(10000000, 99999999)}"

            profile = VendorProfile(
                id=vendor_id,
                name=name,
                category=category,
                state_code=state_code,
                state_name=state_name,
                pan=pan,
                gstin=gstin,
                address=address,
                email=email,
                phone=phone,
                bank_name=bank_name,
                ifsc=ifsc,
                account_number=raw_acc,
                account_hash=acc_hash,
                last4=last4,
                typical_amount_median=median,
                typical_amount_sigma=sigma,
                cadence_days=cadence,
                numbering_pattern=pattern,
                tax_rate=tax_rate,
                prefix=clean_prefix,
            )
            self.vendors.append(profile)

        return self.vendors

    def simulate_history(
        self,
        months: int = 18,
        min_invoices: int = 12,
        max_invoices: int = 38,
        out_csv: Optional[str] = None,
    ) -> pd.DataFrame:
        """Simulate historical invoices for each vendor over ~18 months."""
        if not self.vendors:
            self.generate_vendors()

        records = []
        now = datetime.now(timezone.utc)
        start_date = now - timedelta(days=months * 30)

        for vendor in self.vendors:
            invoice_count = random.randint(min_invoices, max_invoices)
            curr_date = start_date + timedelta(days=random.randint(1, 15))
            seq = 1

            for _ in range(invoice_count):
                if curr_date > now:
                    break

                fy = f"{curr_date.year % 100:02d}-{(curr_date.year + 1) % 100:02d}"
                inv_number = vendor.numbering_pattern.format(
                    FY=fy,
                    YYYY=curr_date.year,
                    seq=seq,
                    prefix=vendor.prefix,
                )

                # Generate lognormal amount
                # median = exp(mu) => mu = ln(median)
                mu = np.log(vendor.typical_amount_median)
                amount = float(np.random.lognormal(mu, vendor.typical_amount_sigma))
                subtotal = round(amount / (1.0 + vendor.tax_rate), 2)
                tax = round(amount - subtotal, 2)
                grand_total = round(subtotal + tax, 2)

                records.append(
                    {
                        "vendor_id": vendor.id,
                        "vendor_name": vendor.name,
                        "gstin": vendor.gstin,
                        "state_code": vendor.state_code,
                        "invoice_number": inv_number,
                        "invoice_date": curr_date.strftime("%Y-%m-%d"),
                        "subtotal": subtotal,
                        "tax_amount": tax,
                        "tax_rate": vendor.tax_rate,
                        "grand_total": grand_total,
                        "account_hash": vendor.account_hash,
                        "last4": vendor.last4,
                        "ifsc": vendor.ifsc,
                    }
                )

                # Advance date by cadence + jitter
                jitter = random.randint(-3, 3)
                step = max(3, vendor.cadence_days + jitter)
                curr_date += timedelta(days=step)
                seq += 1

        df = pd.DataFrame(records)
        if out_csv:
            out_path = Path(out_csv)
            out_path.parent.mkdir(parents=True, exist_ok=True)
            df.to_csv(out_path, index=False)

        return df
