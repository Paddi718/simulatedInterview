from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.database import get_db
from app.models.user import User
from app.schemas.auth import (
    UserCreate, UserLogin, TokenResponse, UserResponse, UpdateUserRequest, VerifyEmailRequest,
)
from app.utils.auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])

VERIFICATION_CODE_EXPIRE_MINUTES = 10


@router.post("/register", status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    # 检查用户名
    result = await db.execute(select(User).where(User.username == data.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="用户名已存在")

    # 检查邮箱（如果提供了）
    if data.email:
        result = await db.execute(select(User).where(User.email == data.email, User.is_verified == True))
        if result.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="该邮箱已被注册")

    # 生成验证码
    from app.services.email_service import send_verification_email
    code = await send_verification_email(data.email) if data.email else None

    expires = datetime.now(timezone.utc) + timedelta(minutes=VERIFICATION_CODE_EXPIRE_MINUTES)

    user = User(
        username=data.username,
        password_hash=hash_password(data.password),
        email=data.email,
        is_verified=(code is None),  # 无邮箱时直接通过
        verification_code=code,
        verification_code_expires_at=expires if code else None,
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)

    if code:
        return {
            "code": 0,
            "message": "验证码已发送到您的邮箱，请查收",
            "data": {"need_verify": True, "username": user.username},
        }

    token = create_access_token(user.id)
    return {
        "code": 0,
        "message": "注册成功",
        "data": {"access_token": token, "user": _user_response(user)},
    }


@router.post("/verify-email")
async def verify_email(data: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="用户不存在")
    if user.is_verified:
        raise HTTPException(status_code=400, detail="已通过验证")

    if user.verification_code != data.code:
        raise HTTPException(status_code=400, detail="验证码错误")

    if user.verification_code_expires_at and user.verification_code_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="验证码已过期，请重新获取")

    user.is_verified = True
    user.verification_code = None
    user.verification_code_expires_at = None
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id)
    return {
        "code": 0,
        "message": "验证成功",
        "data": {"access_token": token, "user": _user_response(user)},
    }


@router.post("/forgot-password")
async def forgot_password(data: dict, db: AsyncSession = Depends(get_db)):
    """通过邮箱发送重置密码验证码"""
    email_or_username = data.get("email", "").strip()
    if not email_or_username:
        raise HTTPException(status_code=400, detail="请输入邮箱或用户名")

    # 按邮箱或用户名查找
    result = await db.execute(
        select(User).where(
            (User.email == email_or_username) | (User.username == email_or_username)
        )
    )
    user = result.scalar_one_or_none()
    if not user:
        # 不暴露用户是否存在，统一返回成功
        return {"code": 0, "message": "如果账号存在，验证码已发送", "data": None}
    if not user.email:
        raise HTTPException(status_code=400, detail="该账号未绑定邮箱，无法重置密码")
    if not user.is_verified:
        raise HTTPException(status_code=400, detail="该账号邮箱未验证，无法重置密码")

    from app.services.email_service import send_verification_email
    code = await send_verification_email(user.email, scenario="reset")
    if not code:
        raise HTTPException(status_code=500, detail="发送验证码失败")

    user.verification_code = code
    user.verification_code_expires_at = datetime.now(timezone.utc) + timedelta(minutes=VERIFICATION_CODE_EXPIRE_MINUTES)
    await db.commit()

    return {"code": 0, "message": "验证码已发送", "data": None}


@router.post("/reset-password")
async def reset_password(data: dict, db: AsyncSession = Depends(get_db)):
    """验证码通过后重置密码"""
    username = data.get("username", "").strip()
    code = data.get("code", "").strip()
    new_password = data.get("new_password", "")

    if not username or not code or not new_password:
        raise HTTPException(status_code=400, detail="请填写完整信息")
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="新密码至少 6 位")

    result = await db.execute(
        select(User).where((User.username == username) | (User.email == username))
    )
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="用户不存在")
    if user.verification_code != code:
        raise HTTPException(status_code=400, detail="验证码错误")
    if user.verification_code_expires_at and user.verification_code_expires_at < datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="验证码已过期")

    user.password_hash = hash_password(new_password)
    user.verification_code = None
    user.verification_code_expires_at = None
    await db.commit()

    return {"code": 0, "message": "密码已重置，请使用新密码登录", "data": None}


@router.post("/resend-code")
async def resend_code(data: dict, db: AsyncSession = Depends(get_db)):
    username = data.get("username", "")
    result = await db.execute(select(User).where(User.username == username))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=400, detail="用户不存在")
    if user.is_verified:
        raise HTTPException(status_code=400, detail="已通过验证")
    if not user.email:
        raise HTTPException(status_code=400, detail="未绑定邮箱")

    from app.services.email_service import send_verification_email
    code = await send_verification_email(user.email)
    if not code:
        raise HTTPException(status_code=500, detail="发送验证码失败，请稍后再试")

    user.verification_code = code
    user.verification_code_expires_at = datetime.now(timezone.utc) + timedelta(minutes=VERIFICATION_CODE_EXPIRE_MINUTES)
    await db.commit()

    return {"code": 0, "message": "验证码已重新发送", "data": None}


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="用户名或密码错误")
    if not user.is_verified:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="请先验证邮箱")

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user=_user_response(user),
    )


def _user_response(user: User) -> UserResponse:
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
        is_admin=user.is_admin,
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
        if current_user.is_verified and current_user.email:
            raise HTTPException(status_code=400, detail="邮箱已验证，不可修改")
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
    from app.services.tts_service import SUPPORTED_VOICES
    return {"code": 0, "data": SUPPORTED_VOICES, "message": "ok"}


@router.post("/test-llm")
async def test_llm_connection(data: dict, current_user: User = Depends(get_current_user)):
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
