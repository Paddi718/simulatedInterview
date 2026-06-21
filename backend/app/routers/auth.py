from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.schemas.auth import UserCreate, UserLogin, TokenResponse, UserResponse, UpdateUserRequest
from app.utils.auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == data.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")

    user = User(username=data.username, password_hash=hash_password(data.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=str(user.id),
            username=user.username,
            email=user.email,
            tts_preference=user.tts_preference,
            created_at=user.created_at.isoformat(),
        ),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=str(user.id),
            username=user.username,
            email=user.email,
            tts_preference=user.tts_preference,
            created_at=user.created_at.isoformat(),
        ),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        tts_preference=current_user.tts_preference,
        created_at=current_user.created_at.isoformat(),
    )


@router.put("/me", response_model=UserResponse)
async def update_me(
    data: UpdateUserRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if data.tts_preference is not None:
        current_user.tts_preference = data.tts_preference
    await db.commit()
    await db.refresh(current_user)
    return UserResponse(
        id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        tts_preference=current_user.tts_preference,
        created_at=current_user.created_at.isoformat(),
    )
