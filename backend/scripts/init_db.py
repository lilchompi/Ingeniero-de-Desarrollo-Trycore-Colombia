"""Inicializa la base de datos local y opcionalmente inserta datos demo."""

from __future__ import annotations

import argparse

from backend.app.db import SessionLocal, init_db
from backend.app.infrastructure.models import Activity, Project
from backend.app.security import ensure_default_users


def seed_sample_data() -> None:
    """Inserta un proyecto demo solo si no existen proyectos."""
    session = SessionLocal()
    try:
        if session.query(Project).count() > 0:
            print("Seed omitido: ya existen proyectos.")
            return

        project = Project(
            name="Demo Project",
            description="Proyecto inicial de demostracion",
            status="active",
        )
        project.activities = [
            Activity(
                name="Deploy Contract",
                description="Deploy del contrato de ejemplo",
                kind="deploy",
                status="done",
                data_payload={"gas_estimate": 21000},
            ),
            Activity(
                name="Run Integration",
                description="Ejecucion de pruebas de integracion",
                kind="test",
                status="pending",
            ),
        ]

        session.add(project)
        session.commit()
        print("Seed completado: proyecto demo creado.")
    finally:
        session.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Inicializa base de datos local para EVM backend.")
    parser.add_argument(
        "--with-sample-data",
        action="store_true",
        help="Inserta un proyecto de ejemplo si la base esta vacia.",
    )
    args = parser.parse_args()

    init_db()
    ensure_default_users()
    print("Base de datos y usuarios por defecto inicializados.")

    if args.with_sample_data:
        seed_sample_data()


if __name__ == "__main__":
    main()
