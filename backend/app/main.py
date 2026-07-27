from fastapi import FastAPI

from . import db
from .api.routes import router as api_router

app = FastAPI(
    title="EVM Fullstack API",
    description="REST API for EVM project planning, activity management, and earned value metrics.",
    version="0.1.0",
    contact={"name": "EVM API Team", "email": "hello@example.com"},
)

app.include_router(api_router)

db.init_db()


@app.on_event("startup")
def on_startup():
    db.init_db()


@app.get("/health", summary="Health check", response_description="Returns service health status")
def health() -> dict:
    return {"status": "ok"}
