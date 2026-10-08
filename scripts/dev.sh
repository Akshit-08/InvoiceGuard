#!/usr/bin/env bash
set -e

echo "=== Starting InvoiceGuard Development Environment ==="

# Check virtual environment
if [ -d ".venv" ]; then
    source .venv/bin/activate
fi

# Ensure data directory exists
mkdir -p data/uploads data/synthetic data/raw data/samples

echo "Starting Frontend and Backend concurrently..."
npm run dev
