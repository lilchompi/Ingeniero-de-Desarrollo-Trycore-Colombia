from datetime import datetime
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class ActivityBase(BaseModel):
    name: str = Field(..., json_schema_extra={"example": "Deploy Contract"})
    description: Optional[str] = Field(None, json_schema_extra={"example": "Deploy contract to local EVM"})
    kind: Optional[str] = Field(None, json_schema_extra={"example": "deploy"})
    status: Optional[str] = Field("pending", json_schema_extra={"example": "pending"})
    data_payload: Optional[Dict[str, Any]] = Field(None, json_schema_extra={"example": {"gas_estimate": 21000}})


class ActivityCreate(ActivityBase):
    project_id: int = Field(..., json_schema_extra={"example": 1})


class ActivityUpdate(BaseModel):
    name: Optional[str] = Field(None, json_schema_extra={"example": "Run integration tests"})
    description: Optional[str] = Field(None, json_schema_extra={"example": "Update activity description"})
    kind: Optional[str] = Field(None, json_schema_extra={"example": "test"})
    status: Optional[str] = Field(None, json_schema_extra={"example": "done"})
    data_payload: Optional[Dict[str, Any]] = Field(None, json_schema_extra={"example": {"gas_estimate": 25000}})


class ActivityRead(ActivityBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    created_at: datetime


class ProjectBase(BaseModel):
    name: str = Field(..., json_schema_extra={"example": "Demo Project"})
    description: Optional[str] = Field(None, json_schema_extra={"example": "EVM planning project"})
    status: Optional[str] = Field("draft", json_schema_extra={"example": "draft"})


class ProjectCreate(ProjectBase):
    pass


class ProjectUpdate(BaseModel):
    name: Optional[str] = Field(None, json_schema_extra={"example": "Renamed Project"})
    description: Optional[str] = Field(None, json_schema_extra={"example": "Updated description"})
    status: Optional[str] = Field(None, json_schema_extra={"example": "active"})


class ProjectRead(ProjectBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    created_at: datetime
    activities: List[ActivityRead] = Field(default_factory=list)


class EVMRequest(BaseModel):
    planned_value: float = Field(..., ge=0, json_schema_extra={"example": 100.0})
    earned_value: float = Field(..., ge=0, json_schema_extra={"example": 90.0})
    actual_cost: float = Field(..., ge=0, json_schema_extra={"example": 80.0})
    budget_at_completion: float = Field(..., ge=0, json_schema_extra={"example": 120.0})


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
    email: str = Field(..., json_schema_extra={"example": "lider@trycore.com"})
    password: str = Field(..., json_schema_extra={"example": "lider123"})


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


class ErrorResponse(BaseModel):
    detail: str


class HealthResponse(BaseModel):
    status: str


class DeleteResponse(BaseModel):
    detail: str
