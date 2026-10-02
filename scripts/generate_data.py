"""CLI to generate synthetic invoices with ground-truth and tamper annotations.

Usage:
    python scripts/generate_data.py --seed 42 --genuine 300 --tampered 300 --visual-pairs 200 --out data/synthetic
"""

import argparse
import sys
import time
from pathlib import Path

# Ensure repository root is on sys.path
REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

from ml.synthetic.generator import InvoiceDatasetGenerator


def main() -> None:
    parser = argparse.ArgumentParser(description="InvoiceGuard Synthetic Data Engine")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for deterministic generation")
    parser.add_argument("--genuine", type=int, default=300, help="Number of genuine invoices to generate")
    parser.add_argument("--tampered", type=int, default=300, help="Number of tampered invoices to generate")
    parser.add_argument("--visual-pairs", type=int, default=200, help="Number of visual patch pairs to generate")
    parser.add_argument("--out", type=str, default="data/synthetic", help="Output directory")

    args = parser.parse_args()

    print("=== InvoiceGuard Synthetic Invoice Generator ===")
    print(f"Seed: {args.seed}")
    print(f"Genuine: {args.genuine} | Tampered: {args.tampered} | Visual Pairs: {args.visual_pairs}")
    print(f"Output Directory: {args.out}")

    start_time = time.perf_counter()
    generator = InvoiceDatasetGenerator(seed=args.seed, out_dir=args.out)
    df = generator.generate_dataset(
        genuine_count=args.genuine,
        tampered_count=args.tampered,
        visual_pairs_count=args.visual_pairs,
    )
    elapsed = time.perf_counter() - start_time

    print(f"Done in {elapsed:.2f} seconds.")
    print(f"Total documents generated: {len(df)}")
    print("Split distribution:")
    print(df["split"].value_counts())
    print(f"Manifest written to: {args.out}/manifest.csv")


if __name__ == "__main__":
    main()
