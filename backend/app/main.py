from fastapi import FastAPI

from . import db

app = FastAPI(title="EVM Fullstack API")


@app.on_event("startup")
def on_startup():
    db.init_db()


@app.get("/health")
def health() -> dict:
    return {"status": "ok"}
