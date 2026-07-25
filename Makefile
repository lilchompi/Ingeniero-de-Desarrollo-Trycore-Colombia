.PHONY: help install dev install-dev lint format test start

help:
	@echo "Available targets: install, install-dev, lint, format, test, start"

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
