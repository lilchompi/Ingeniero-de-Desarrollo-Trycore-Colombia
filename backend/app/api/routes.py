from collections.abc import Generator

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from .. import db
from ..domain.evm_service import EVMService
from ..infrastructure.models import Activity, Project
from ..security import AuthUser, get_current_user, require_roles
from .schemas import (
    ActivityCreate,
    ActivityRead,
    ActivityUpdate,
    DeleteResponse,
    ErrorResponse,
    EVMRequest,
    EVMResponse,
    ProjectCreate,
    ProjectRead,
    ProjectUpdate,
)

router = APIRouter(prefix="/api", tags=["EVM"])


def get_db() -> Generator[Session, None, None]:
    session = db.SessionLocal()
    try:
        yield session
    finally:
        session.close()


@router.get(
    "/projects",
    response_model=list[ProjectRead],
    summary="Listar proyectos",
    description="Obtiene el listado de proyectos disponibles para el usuario autenticado.",
    responses={401: {"model": ErrorResponse, "description": "No autenticado."}},
)
def list_projects(
    db_session: Session = Depends(get_db),
    _: AuthUser = Depends(get_current_user),
) -> list[ProjectRead]:
    return db_session.query(Project).order_by(Project.id.desc()).all()


@router.post(
    "/projects",
    response_model=ProjectRead,
    status_code=201,
    summary="Crear proyecto",
    description="Crea un nuevo proyecto EVM con nombre único.",
    responses={
        400: {"model": ErrorResponse, "description": "Nombre de proyecto duplicado."},
        401: {"model": ErrorResponse, "description": "No autenticado."},
        403: {"model": ErrorResponse, "description": "Sin permisos para crear proyectos."},
    },
)
def create_project(
    payload: ProjectCreate,
    db_session: Session = Depends(get_db),
    _: AuthUser = Depends(require_roles("project_lead", "admin")),
) -> ProjectRead:
    existing = db_session.query(Project).filter(Project.name == payload.name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Project with this name already exists")

    project = Project(
        name=payload.name,
        description=payload.description,
        status=payload.status,
    )
    db_session.add(project)
    db_session.commit()
    db_session.refresh(project)
    return project


@router.get(
    "/projects/{project_id}",
    response_model=ProjectRead,
    summary="Obtener proyecto",
    description="Obtiene el detalle de un proyecto, incluyendo actividades y métricas agregadas.",
    responses={
        401: {"model": ErrorResponse, "description": "No autenticado."},
        404: {"model": ErrorResponse, "description": "Proyecto no encontrado."},
    },
)
def get_project(
    project_id: int,
    db_session: Session = Depends(get_db),
    _: AuthUser = Depends(get_current_user),
) -> ProjectRead:
    project = db_session.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    return project


@router.patch(
    "/projects/{project_id}",
    response_model=ProjectRead,
    summary="Actualizar proyecto",
    description="Actualiza de forma parcial nombre, descripción o estado de un proyecto.",
    responses={
        400: {"model": ErrorResponse, "description": "Nombre de proyecto duplicado."},
        401: {"model": ErrorResponse, "description": "No autenticado."},
        403: {"model": ErrorResponse, "description": "Sin permisos para actualizar proyectos."},
        404: {"model": ErrorResponse, "description": "Proyecto no encontrado."},
    },
)
def update_project(
    project_id: int,
    payload: ProjectUpdate,
    db_session: Session = Depends(get_db),
    _: AuthUser = Depends(require_roles("project_lead", "admin")),
) -> ProjectRead:
    project = db_session.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    updates = payload.model_dump(exclude_unset=True)
    next_name = updates.get("name")
    if next_name and next_name != project.name:
        existing = db_session.query(Project).filter(Project.name == next_name).first()
        if existing:
            raise HTTPException(status_code=400, detail="Project with this name already exists")

    for field, value in updates.items():
        setattr(project, field, value)

    db_session.commit()
    db_session.refresh(project)
    return project


@router.delete(
    "/projects/{project_id}",
    response_model=DeleteResponse,
    summary="Eliminar proyecto",
    description="Elimina un proyecto y sus actividades asociadas.",
    responses={
        401: {"model": ErrorResponse, "description": "No autenticado."},
        403: {"model": ErrorResponse, "description": "Sin permisos para eliminar proyectos."},
        404: {"model": ErrorResponse, "description": "Proyecto no encontrado."},
    },
)
def delete_project(
    project_id: int,
    db_session: Session = Depends(get_db),
    _: AuthUser = Depends(require_roles("project_lead", "admin")),
) -> DeleteResponse:
    project = db_session.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    db_session.delete(project)
    db_session.commit()
    return DeleteResponse(detail="Project deleted")


@router.post(
    "/activities",
    response_model=ActivityRead,
    status_code=201,
    summary="Crear actividad",
    description="Crea una actividad dentro de un proyecto existente.",
    responses={
        401: {"model": ErrorResponse, "description": "No autenticado."},
        403: {"model": ErrorResponse, "description": "Sin permisos para crear actividades."},
        404: {"model": ErrorResponse, "description": "Proyecto no encontrado."},
    },
)
def create_activity(
    payload: ActivityCreate,
    db_session: Session = Depends(get_db),
    _: AuthUser = Depends(require_roles("project_lead", "admin")),
) -> ActivityRead:
    project = db_session.query(Project).filter(Project.id == payload.project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")

    activity = Activity(
        project_id=payload.project_id,
        name=payload.name,
        description=payload.description,
        kind=payload.kind,
        status=payload.status,
        data_payload=payload.data_payload,
    )
    db_session.add(activity)
    db_session.commit()
    db_session.refresh(activity)
    return activity


@router.patch(
    "/activities/{activity_id}",
    response_model=ActivityRead,
    summary="Actualizar actividad",
    description="Actualiza de forma parcial la información de una actividad.",
    responses={
        401: {"model": ErrorResponse, "description": "No autenticado."},
        403: {"model": ErrorResponse, "description": "Sin permisos para actualizar actividades."},
        404: {"model": ErrorResponse, "description": "Actividad no encontrada."},
    },
)
def update_activity(
    activity_id: int,
    payload: ActivityUpdate,
    db_session: Session = Depends(get_db),
    _: AuthUser = Depends(require_roles("project_lead", "admin")),
) -> ActivityRead:
    activity = db_session.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    for field, value in payload.model_dump(exclude_unset=True).items():
        if field == "data_payload":
            activity.data_payload = value
        else:
            setattr(activity, field, value)

    db_session.commit()
    db_session.refresh(activity)
    return activity


@router.delete(
    "/activities/{activity_id}",
    response_model=DeleteResponse,
    summary="Eliminar actividad",
    description="Elimina una actividad por identificador.",
    responses={
        401: {"model": ErrorResponse, "description": "No autenticado."},
        403: {"model": ErrorResponse, "description": "Sin permisos para eliminar actividades."},
        404: {"model": ErrorResponse, "description": "Actividad no encontrada."},
    },
)
def delete_activity(
    activity_id: int,
    db_session: Session = Depends(get_db),
    _: AuthUser = Depends(require_roles("project_lead", "admin")),
) -> DeleteResponse:
    activity = db_session.query(Activity).filter(Activity.id == activity_id).first()
    if not activity:
        raise HTTPException(status_code=404, detail="Activity not found")

    db_session.delete(activity)
    db_session.commit()
    return DeleteResponse(detail="Activity deleted")


@router.post(
    "/evm/calculate",
    response_model=EVMResponse,
    summary="Calcular métricas EVM",
    description="Calcula CV, SV, CPI, SPI, EAC y VAC a partir de valores PV, EV, AC y BAC.",
    responses={
        401: {"model": ErrorResponse, "description": "No autenticado."},
        422: {"description": "Datos de entrada inválidos."},
    },
)
def calculate_evm(
    payload: EVMRequest,
    _: AuthUser = Depends(get_current_user),
) -> EVMResponse:
    result = EVMService.calculate(
        planned_value=payload.planned_value,
        earned_value=payload.earned_value,
        actual_cost=payload.actual_cost,
        budget_at_completion=payload.budget_at_completion,
    )
    return result
