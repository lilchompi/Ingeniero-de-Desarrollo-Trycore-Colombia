# EVM Full-Stack Application

Full-stack EVM dashboard for project planning and earned value tracking.

## Tech stack

- Backend: FastAPI + SQLAlchemy
- Frontend: React + Vite
- Quality: pytest + Ruff
- Auth: JWT bearer token

## Repository structure

```
backend/   FastAPI application and tests
frontend/  React dashboard
```

## Prerequisites

- Python 3.12+
- Node.js 18+

## Installation

1. Create and activate a Python virtual environment.
2. Install backend dependencies:

```bash
pip install -r requirements.txt
pip install -r dev-requirements.txt
```

3. Install frontend dependencies:

```bash
npm --prefix frontend install
```

## Runtime configuration

Environment variables used by the backend:

- `EVM_JWT_SECRET` (required for production)
- `EVM_JWT_EXPIRE_MINUTES` (optional, default: `120`)
- `EVM_DATABASE_URL` (optional, default: `sqlite:///./dev.db`)

Example for local development:

```bash
set EVM_JWT_SECRET=change-me-in-local-dev
```

## Database initialization script

The repository includes a database initialization script at [backend/scripts/init_db.py](backend/scripts/init_db.py).

Initialize tables and default users:

```bash
python -m backend.scripts.init_db
```

Initialize tables and load sample data (only when the database is empty):

```bash
python -m backend.scripts.init_db --with-sample-data
```

You can also run it through the Makefile:

```bash
make init-db
```

## Run the application

Start backend API:

```bash
make start
```

OpenAPI / Swagger UI:

- http://127.0.0.1:8000/api-docs
- http://127.0.0.1:8000/swagger-ui

Start frontend development server:

```bash
npm --prefix frontend run dev
```

## Quality gates

Run test suite:

```bash
pytest -q
```

Run linting:

```bash
ruff check .
```

Build frontend for production:

```bash
npm --prefix frontend run build
```

Windows note: if PowerShell blocks `npm`, use `npm.cmd`.

## Release v1.0.0 verification snapshot

- Backend tests: `14 passed`
- Lint: `ruff check .` passed
- Frontend production build: passed (`vite build`)

