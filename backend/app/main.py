from contextlib import asynccontextmanager

from fastapi import FastAPI

from . import db
from .api.auth_routes import router as auth_router
from .api.routes import router as api_router
from .security import ensure_default_users


@asynccontextmanager
async def lifespan(_: FastAPI):
    db.init_db()
    ensure_default_users()
    yield


app = FastAPI(
    title="EVM Fullstack API",
    description="REST API for EVM project planning, activity management, and earned value metrics.",
    version="1.0.0",
    contact={"name": "EVM API Team", "email": "hello@example.com"},
    lifespan=lifespan,
)

app.include_router(api_router)
app.include_router(auth_router)

@app.get("/health", summary="Health check", response_description="Returns service health status")
def health() -> dict:
    return {"status": "ok"}
