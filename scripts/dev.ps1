Write-Host "=== Starting InvoiceGuard Development Environment ===" -ForegroundColor Cyan

# Check and activate virtual environment if it exists
if (Test-Path ".venv\Scripts\Activate.ps1") {
    & .venv\Scripts\Activate.ps1
}

# Ensure data directories exist
New-Item -ItemType Directory -Force -Path data/uploads, data/synthetic, data/raw, data/samples | Out-Null

Write-Host "Starting Frontend and Backend concurrently..." -ForegroundColor Green
npm run dev
