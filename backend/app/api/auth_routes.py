from collections.abc import Generator

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from .. import db
from ..security import authenticate_user, create_access_token, get_current_user
from .schemas import LoginRequest, TokenResponse, UserProfileResponse

router = APIRouter(prefix="/api/auth", tags=["Auth"])


def get_db() -> Generator[Session, None, None]:
    session = db.SessionLocal()
    try:
        yield session
    finally:
        session.close()


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db_session: Session = Depends(get_db)) -> TokenResponse:
    user = authenticate_user(db_session, payload.email, payload.password)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Incorrect email or password")

    access_token = create_access_token(
        {
            "sub": str(user.id),
            "email": user.email,
            "role": user.role,
            "full_name": user.full_name,
        }
    )

    return TokenResponse(access_token=access_token, role=user.role, email=user.email)


@router.get("/me", response_model=UserProfileResponse)
def me(current_user=Depends(get_current_user)) -> UserProfileResponse:
    return UserProfileResponse(
        user_id=current_user.user_id,
        email=current_user.email,
        role=current_user.role,
        full_name=current_user.full_name,
    )
