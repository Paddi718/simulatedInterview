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
        user=_user_response(user),
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
        user=_user_response(user),
    )


def _user_response(user: User) -> UserResponse:
    # 安全：不返回明文 API Key，仅返回是否已配置
    safe_llm = None
    if user.llm_config:
        safe_llm = {
            k: ("***" if k in ("api_key", "llm_api_key", "key") else v)
            for k, v in user.llm_config.items()
        }
    return UserResponse(
        id=str(user.id),
        username=user.username,
        email=user.email,
        tts_preference=user.tts_preference,
        llm_config=safe_llm,
        created_at=user.created_at.isoformat(),
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return _user_response(current_user)


@router.put("/me", response_model=UserResponse)
async def update_me(
    data: UpdateUserRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 密码修改（需要当前密码验证）
    if data.current_password is not None:
        if not verify_password(data.current_password, current_user.password_hash):
            raise HTTPException(status_code=400, detail="当前密码错误")
        if not data.new_password or len(data.new_password) < 6:
            raise HTTPException(status_code=400, detail="新密码至少 6 位")
        current_user.password_hash = hash_password(data.new_password)
    if data.username is not None:
        result = await db.execute(
            select(User).where(User.username == data.username, User.id != current_user.id)
        )
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="用户名已被占用")
        current_user.username = data.username
    if data.email is not None:
        current_user.email = data.email
    if data.tts_preference is not None:
        current_user.tts_preference = data.tts_preference
    if data.llm_config is not None:
        current_user.llm_config = data.llm_config
    await db.commit()
    await db.refresh(current_user)
    return _user_response(current_user)


@router.get("/voices")
async def list_voices(current_user: User = Depends(get_current_user)):
    """返回可用的 TTS 音色列表"""
    from app.services.tts_service import SUPPORTED_VOICES
    return {"code": 0, "data": SUPPORTED_VOICES, "message": "ok"}


@router.post("/test-llm")
async def test_llm_connection(data: dict, current_user: User = Depends(get_current_user)):
    """测试用户自定义 LLM API 连接"""
    from app.services.llm_client import llm_chat
    try:
        result = await llm_chat(
            [{"role": "user", "content": "Hi"}],
            temperature=0,
            api_key=data.get("api_key", ""),
            api_base=data.get("api_base", ""),
            model=data.get("model", ""),
        )
        return {"code": 0, "data": {"response": result[:100]}, "message": "ok"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"连接失败: {str(e)[:200]}")
