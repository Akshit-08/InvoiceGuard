import sys
from pathlib import Path

from fastapi.testclient import TestClient

# Add project root to sys.path
sys.path.append(str(Path(__file__).parent.parent))

from backend.app.main import app


def run_bug_bash():
    test_dir = Path("my-test-invoices")
    files = list(test_dir.glob("*.jpg")) + list(test_dir.glob("*.pdf")) + list(test_dir.glob("*.png"))

    if not files:
        print("No files found in my-test-invoices")
        return

    print(f"Starting bug bash on {len(files)} files...\n")

    client = TestClient(app)

    for f in files:
        print(f"--- Processing {f.name} ---")
        try:
            # 1. Upload
            with open(f, "rb") as file_obj:
                res = client.post("/api/v1/invoices/upload", files={"file": (f.name, file_obj, "image/jpeg")})

            if res.status_code != 201:
                print(f"FAILED UPLOAD: {res.text}")
                continue

            inv_id = res.json()["invoice_id"]

            # 2. Analyze
            analysis_res = client.post(f"/api/v1/invoices/{inv_id}/analyze")
            if analysis_res.status_code != 200:
                print(f"FAILED ANALYSIS: {analysis_res.text}")
                continue

            # 3. Get results
            full_res = client.get(f"/api/v1/invoices/{inv_id}")
            result = full_res.json()

            data = result.get("data", {})

            print(f"SUCCESS: {f.name}")
            print(f"  Invoice Number: {data.get('invoice_number', {}).get('value', 'MISSING')}")
            print(f"  Grand Total: {data.get('grand_total', {}).get('value', 'MISSING')}")
            print(f"  Risk Level: {result.get('risk_level')}")
            print(f"  Risk Score: {result.get('overall_score')}")

            findings = result.get("findings", [])
            if findings:
                print(f"  Findings: {len(findings)}")
                for finding in findings:
                    print(f"    - [{finding.get('severity')}] {finding.get('title')}")

        except Exception as e:
            print(f"FAILED: {f.name}")
            print(f"  Error: {str(e)}")
            import traceback
            traceback.print_exc()
        print("\n")

if __name__ == "__main__":
    run_bug_bash()
