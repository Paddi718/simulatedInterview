from fastapi import Depends, HTTPException, status
from app.models.user import User
from app.utils.auth import get_current_user


async def require_admin(current_user: User = Depends(get_current_user)) -> User:
    """管理员权限依赖 — 必须先通过 get_current_user 认证，再检查 is_admin"""
    if not current_user.is_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="需要管理员权限",
        )
    return current_user
