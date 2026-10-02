.PHONY: help dev test lint data clean

help:
	@echo "Available commands:"
	@echo "  make dev      - Start FastAPI backend dev server"
	@echo "  make test     - Run pytest suite"
	@echo "  make lint     - Run ruff code linter"
	@echo "  make data     - Generate synthetic invoice dataset"
	@echo "  make clean    - Remove build & cache files"

dev:
	uvicorn backend.app.main:app --reload --port 8000

test:
	pytest backend/tests -v

lint:
	ruff check .

data:
	python scripts/generate_data.py --seed 42 --genuine 300 --tampered 300 --visual-pairs 200 --out data/synthetic

clean:
	find . -type d -name "__pycache__" -exec rm -rf {} +
	rm -rf .pytest_cache .ruff_cache
