from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ActivityBase(BaseModel):
    name: str = Field(..., example="Deploy Contract")
    description: Optional[str] = Field(None, example="Deploy contract to local EVM")
    kind: Optional[str] = Field(None, example="deploy")
    status: Optional[str] = Field("pending", example="pending")
    data_payload: Optional[Dict[str, Any]] = Field(None, example={"gas_estimate": 21000})


class ActivityCreate(ActivityBase):
    project_id: int = Field(..., example=1)


class ActivityUpdate(BaseModel):
    name: Optional[str] = Field(None, example="Run integration tests")
    description: Optional[str] = Field(None, example="Update activity description")
    kind: Optional[str] = Field(None, example="test")
    status: Optional[str] = Field(None, example="done")
    data_payload: Optional[Dict[str, Any]] = Field(None, example={"gas_estimate": 25000})


class ActivityRead(ActivityBase):
    id: int
    project_id: int
    created_at: datetime

    class Config:
        orm_mode = True


class ProjectBase(BaseModel):
    name: str = Field(..., example="Demo Project")
    description: Optional[str] = Field(None, example="EVM planning project")
    status: Optional[str] = Field("draft", example="draft")


class ProjectCreate(ProjectBase):
    pass


class ProjectRead(ProjectBase):
    id: int
    created_at: datetime
    activities: List[ActivityRead] = []

    class Config:
        orm_mode = True


class EVMRequest(BaseModel):
    planned_value: float = Field(..., ge=0, example=100.0)
    earned_value: float = Field(..., ge=0, example=90.0)
    actual_cost: float = Field(..., ge=0, example=80.0)
    budget_at_completion: float = Field(..., ge=0, example=120.0)


class EVMResponse(BaseModel):
    pv: float
    ev: float
    ac: float
    cv: float
    sv: float
    cpi: Optional[float]
    spi: Optional[float]
    eac: Optional[float]
    vac: Optional[float]


class LoginRequest(BaseModel):
    email: str = Field(..., example="lider@trycore.com")
    password: str = Field(..., example="lider123")


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    email: str


class UserProfileResponse(BaseModel):
    user_id: int
    email: str
    role: str
    full_name: Optional[str] = None
