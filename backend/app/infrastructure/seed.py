"""Seed the local development database with initial projects and activities."""

from sqlalchemy.orm import Session

from ..db import SessionLocal, init_db
from .models import Activity, Project


def create_sample_data(db: Session) -> None:
    # Check if there is existing data
    if db.query(Project).count() > 0:
        print("Seed skipped: projects already present")
        return

    proj1 = Project(name="Demo Project", description="Initial demo project", status="active")
    act1 = Activity(name="Deploy Contract", description="Deploy test contract to local EVM", kind="deploy", status="done", metadata={"gas_estimate": 21000})
    act2 = Activity(name="Run Integration", description="Integration tests against deployed contract", kind="test", status="pending")

    proj1.activities = [act1, act2]

    db.add(proj1)
    db.commit()
    print("Seed: created demo project with activities")


def main() -> None:
    init_db()
    db = SessionLocal()
    try:
        create_sample_data(db)
    finally:
        db.close()


if __name__ == "__main__":
    main()
