# Changelog

All notable changes to this project are documented in this file.

## [1.0.0] - 2026-07-27

### Added
- Release-ready README with setup, run, test, and build instructions.
- Pull request and release workflow guidance for branch `release/v1.0.0`.
- Backend database configuration via `EVM_DATABASE_URL` environment variable.

### Changed
- Backend API version updated to `1.0.0`.
- FastAPI startup initialization migrated to lifespan handler.
- Pydantic schema definitions updated for v2 compatibility.
- API update handlers now use `model_dump()` for pydantic models.
- JWT expiration timestamp now uses timezone-aware UTC.

### Verification
- `pytest -q`: 14 passed.
- `ruff check .`: passed.
- `npm --prefix frontend run build`: passed.
