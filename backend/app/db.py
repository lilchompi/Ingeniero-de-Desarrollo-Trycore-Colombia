import os

from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

DATABASE_URL = os.getenv("EVM_DATABASE_URL", "sqlite:///./dev.db")

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def init_db() -> None:
    # Import models so they are registered on the Base's metadata before creating tables
    try:
        # Import infrastructure models (keeps project models organized)
        from .infrastructure import models  # noqa: F401
    except Exception:
        # If infrastructure package is not present yet, skip import (during initial scaffolding)
        pass

    Base.metadata.create_all(bind=engine)
