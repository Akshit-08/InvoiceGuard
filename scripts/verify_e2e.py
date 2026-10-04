import asyncio
import sys
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

async def verify_e2e():
    base_url = "http://localhost:8000/api/v1"

    server_running = False
    try:
        async with httpx.AsyncClient(timeout=1.0) as check_client:
            r = await check_client.get(f"{base_url}/health")
            server_running = r.status_code == 200
    except Exception:
        server_running = False

    if server_running:
        client = httpx.AsyncClient(timeout=60.0)
    else:
        from backend.app.main import app
        client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app),
            base_url="http://localhost:8000",
            timeout=60.0,
        )

    print("Seeding demo samples...")
    async with client:
        # Reset first
        await client.post(f"{base_url}/demo/reset")

        # Seed
        res = await client.post(f"{base_url}/demo/seed")
        if res.status_code != 200:
            print(f"Failed to seed demo: {res.text}")
            sys.exit(1)

        data = res.json()
        samples = data.get("samples", {})
        print(f"Seeded {len(samples)} samples.")

        # Wait a bit for analysis to finish (the seed runs them in background but wait... seed runs them synchronously in wait pipeline.analyze_invoice)
        # Actually in seed I wrote `await pipeline.analyze_invoice(...)` so they are fully analyzed synchronously before seed returns!
        # So they are already analyzed.

        # Let's get them from history
        history_res = await client.get(f"{base_url}/invoices")
        if history_res.status_code != 200:
            print(f"Failed to get history: {history_res.text}")
            sys.exit(1)

        history = history_res.json().get("items", [])
        history_map = {item["original_filename"]: item for item in history}

        print("\n| Sample Key | Expected Risk | Actual Risk | Status |")
        print("|---|---|---|---|")

        success = True

        for key, expected in samples.items():
            filename = f"{key}.pdf"
            inv = history_map.get(filename)
            if not inv:
                print(f"| {key} | {expected} | NOT FOUND | FAIL |")
                success = False
                continue

            actual = inv.get("risk_level", "UNKNOWN").lower()
            expected_level = expected["expected_level"].lower()
            status = "PASS" if actual == expected_level else "FAIL"
            if actual != expected_level:
                success = False

            print(f"| {key} | {expected_level.upper()} | {actual.upper()} | {status} |")

        if not success:
            print("\nVerification Failed.")
            sys.exit(1)
        else:
            print("\nVerification Passed!")

if __name__ == "__main__":
    asyncio.run(verify_e2e())
