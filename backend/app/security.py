import os
from datetime import datetime, timedelta
from typing import Any

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from .db import SessionLocal
from .infrastructure.models import User

SECRET_KEY = os.getenv("EVM_JWT_SECRET", "change-this-in-production")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("EVM_JWT_EXPIRE_MINUTES", "120"))

pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")
bearer_scheme = HTTPBearer(auto_error=False)


class AuthUser:
    def __init__(self, user_id: int, email: str, role: str, full_name: str | None = None):
        self.user_id = user_id
        self.email = email
        self.role = role
        self.full_name = full_name


def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None) -> str:
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES))
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def authenticate_user(db_session: Session, email: str, password: str) -> User | None:
    user = db_session.query(User).filter(User.email == email.lower()).first()
    if not user or not verify_password(password, user.hashed_password):
        return None
    if int(user.is_active) != 1:
        return None
    return user


def decode_token(token: str) -> AuthUser:
    credentials_error = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid authentication credentials",
    )

    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise credentials_error from exc

    user_id = payload.get("sub")
    email = payload.get("email")
    role = payload.get("role")

    if user_id is None or email is None or role is None:
        raise credentials_error

    return AuthUser(user_id=int(user_id), email=email, role=role, full_name=payload.get("full_name"))


def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme)) -> AuthUser:
    if credentials is None or credentials.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Not authenticated")

    return decode_token(credentials.credentials)


def require_roles(*allowed_roles: str):
    allowed = set(allowed_roles)

    def dependency(user: AuthUser = Depends(get_current_user)) -> AuthUser:
        if user.role not in allowed:
            raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Insufficient permissions")
        return user

    return dependency


def ensure_default_users() -> None:
    default_users = [
        {
            "email": os.getenv("EVM_DEFAULT_LEAD_EMAIL", "lider@trycore.com").lower(),
            "full_name": "Project Lead",
            "role": "project_lead",
            "password": os.getenv("EVM_DEFAULT_LEAD_PASSWORD", "lider123"),
        },
        {
            "email": os.getenv("EVM_DEFAULT_VIEWER_EMAIL", "viewer@trycore.com").lower(),
            "full_name": "Project Viewer",
            "role": "viewer",
            "password": os.getenv("EVM_DEFAULT_VIEWER_PASSWORD", "viewer123"),
        },
    ]

    session = SessionLocal()
    try:
        for item in default_users:
            existing = session.query(User).filter(User.email == item["email"]).first()
            if existing:
                continue
            session.add(
                User(
                    email=item["email"],
                    full_name=item["full_name"],
                    role=item["role"],
                    hashed_password=get_password_hash(item["password"]),
                    is_active=1,
                )
            )
        session.commit()
    finally:
        session.close()
