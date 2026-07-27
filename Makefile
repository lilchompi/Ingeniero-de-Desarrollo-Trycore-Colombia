.PHONY: help install dev install-dev lint format test start seed init-db

help:
	@echo "Available targets: install, install-dev, lint, format, test, start, init-db, seed"

install:
	python -m pip install --upgrade pip
	python -m pip install -r requirements.txt

install-dev:
	python -m pip install --upgrade pip
	python -m pip install -r dev-requirements.txt

lint:
	ruff check .

format:
	ruff format .

test:
	pytest -q

start:
	uvicorn backend.app.main:app --reload

seed:
	python -m backend.app.infrastructure.seed

init-db:
	python -m backend.scripts.init_db
