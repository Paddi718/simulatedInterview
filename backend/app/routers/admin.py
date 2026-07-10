import math
from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, text, or_
from app.database import get_db, engine
from app.models.user import User
from app.models.interview import Interview
from app.utils.admin import require_admin
from app.schemas.admin import (
    AdminStats, AdminUserItem, AdminUserDetail, PaginatedResponse,
    UpdateUserRequest, AdminInterviewItem,
)

router = APIRouter(prefix="/api/admin", tags=["admin"])


# ── Stats ────────────────────────────────────────────────────────

@router.get("/stats", response_model=AdminStats)
async def admin_stats(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """系统统计概览"""
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_ago = now - timedelta(days=7)

    total_users = (await db.execute(select(func.count(User.id)))).scalar() or 0
    total_interviews = (await db.execute(select(func.count(Interview.id)))).scalar() or 0
    today_interviews = (await db.execute(
        select(func.count(Interview.id)).where(Interview.created_at >= today_start)
    )).scalar() or 0
    active_users_7d = (await db.execute(
        select(func.count(func.distinct(Interview.user_id)))
        .where(Interview.created_at >= week_ago)
    )).scalar() or 0

    return AdminStats(
        total_users=total_users,
        today_interviews=today_interviews,
        total_interviews=total_interviews,
        active_users_7d=active_users_7d,
    )


# ── User List ────────────────────────────────────────────────────

@router.get("/users")
async def admin_list_users(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: str = Query("", max_length=100),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """用户列表（分页+搜索）"""
    base = select(User).where(User.deleted_at.is_(None))
    if search:
        base = base.where(
            or_(User.username.ilike(f"%{search}%"), User.email.ilike(f"%{search}%"))
        )

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    rows = (await db.execute(
        base.order_by(User.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )).scalars().all()

    items: list[AdminUserItem] = []
    for u in rows:
        intv_cnt = (await db.execute(
            select(func.count(Interview.id)).where(Interview.user_id == u.id)
        )).scalar() or 0
        items.append(AdminUserItem(
            id=str(u.id), username=u.username, email=u.email,
            is_admin=u.is_admin, is_active=u.is_active,
            is_verified=u.is_verified,
            created_at=u.created_at.isoformat(),
            last_active_at=u.last_active_at.isoformat() if u.last_active_at else None,
            interview_count=intv_cnt,
        ))

    total_pages = max(1, math.ceil(total / size))
    return {
        "items": [i.model_dump() for i in items],
        "total": total,
        "page": page,
        "page_size": size,
        "total_pages": total_pages,
    }


# ── User Detail ──────────────────────────────────────────────────

@router.get("/users/{user_id}")
async def admin_get_user(
    user_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """用户详情 + 面试统计"""
    user = (await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    total_intv = (await db.execute(
        select(func.count(Interview.id)).where(Interview.user_id == user.id)
    )).scalar() or 0

    avg_score = (await db.execute(
        select(func.avg(Interview.total_score))
        .where(Interview.user_id == user.id, Interview.total_score.isnot(None))
    )).scalar()

    by_cat_rows = (await db.execute(
        select(Interview.interview_category, func.count(Interview.id))
        .where(Interview.user_id == user.id)
        .group_by(Interview.interview_category)
    )).all()

    return AdminUserDetail(
        id=str(user.id), username=user.username, email=user.email,
        is_admin=user.is_admin, is_active=user.is_active,
        is_verified=user.is_verified,
        created_at=user.created_at.isoformat(),
        stats={
            "total_interviews": total_intv,
            "avg_score": round(avg_score, 1) if avg_score else None,
            "by_category": {cat or "private_enterprise": cnt for cat, cnt in by_cat_rows},
        },
    ).model_dump()


# ── Update User ─────────────────────────────────────────────────

@router.put("/users/{user_id}")
async def admin_update_user(
    user_id: str,
    data: UpdateUserRequest,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """编辑用户（启用/禁用、设置/取消管理员）"""
    user = (await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="不能修改自己的管理员状态")

    if data.is_active is not None:
        user.is_active = data.is_active
    if data.is_admin is not None:
        user.is_admin = data.is_admin
    await db.commit()
    return {"code": 0, "message": "ok", "data": None}


# ── Delete User (Soft) ──────────────────────────────────────────

@router.delete("/users/{user_id}/soft")
async def admin_soft_delete_user(
    user_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """软删除用户"""
    user = (await db.execute(
        select(User).where(User.id == user_id, User.deleted_at.is_(None))
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="不能删除自己")

    user.deleted_at = datetime.now(timezone.utc)
    user.is_active = False
    await db.commit()
    return {"code": 0, "message": "用户已注销（可恢复）", "data": None}


# ── Delete User (Hard) ──────────────────────────────────────────

@router.delete("/users/{user_id}/hard")
async def admin_hard_delete_user(
    user_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """硬删除用户（物理删除，级联清除关联数据）"""
    user = (await db.execute(
        select(User).where(User.id == user_id)
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")
    if user.id == current_user.id:
        raise HTTPException(status_code=400, detail="不能删除自己")

    await db.delete(user)
    await db.commit()
    return {"code": 0, "message": "用户已永久删除", "data": None}


# ── Restore User ─────────────────────────────────────────────────

@router.post("/users/{user_id}/restore")
async def admin_restore_user(
    user_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """恢复软删除或禁用的用户"""
    user = (await db.execute(
        select(User).where(User.id == user_id)
    )).scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="用户不存在")

    user.deleted_at = None
    user.is_active = True
    await db.commit()
    return {"code": 0, "message": "用户已恢复", "data": None}


# ── Interview List ───────────────────────────────────────────────

CATEGORY_LABELS_ZH: dict[str, str] = {
    "private_enterprise": "私企",
    "civil_service": "公务员",
    "institution": "事业单位",
}

@router.get("/interviews")
async def admin_list_interviews(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    category: str = Query("", max_length=30),
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """所有面试记录列表（分页+筛选）"""
    base = select(Interview, User.username).join(User, Interview.user_id == User.id)
    if category:
        base = base.where(Interview.interview_category == category)

    count_q = select(func.count()).select_from(base.subquery())
    total = (await db.execute(count_q)).scalar() or 0

    rows = (await db.execute(
        base.order_by(Interview.created_at.desc())
        .offset((page - 1) * size)
        .limit(size)
    )).all()

    items: list[dict] = []
    for intv, username in rows:
        cat = intv.interview_category or "private_enterprise"
        position = intv.category_config.get("province", "") if intv.category_config and cat != "private_enterprise" else (
            intv.category_config.get("position_name", "") if intv.category_config else ""
        )
        items.append({
            "id": str(intv.id), "user_id": str(intv.user_id), "username": username,
            "interview_category": cat,
            "position": position or f"{CATEGORY_LABELS_ZH.get(cat, '私企')}面试",
            "difficulty": intv.difficulty, "total_score": intv.total_score,
            "status": intv.status, "question_count": intv.question_count,
            "created_at": intv.created_at.isoformat(),
        })

    total_pages = max(1, math.ceil(total / size))
    return {
        "items": items, "total": total, "page": page,
        "page_size": size, "total_pages": total_pages,
    }


# ── Delete Interview ─────────────────────────────────────────────

@router.delete("/interviews/{interview_id}")
async def admin_delete_interview(
    interview_id: str,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """删除任意面试记录"""
    intv = (await db.execute(
        select(Interview).where(Interview.id == interview_id)
    )).scalar_one_or_none()
    if not intv:
        raise HTTPException(status_code=404, detail="面试记录不存在")

    await db.delete(intv)
    await db.commit()
    return {"code": 0, "message": "面试记录已删除", "data": None}


# ── System Config ───────────────────────────────────────────────

@router.get("/config")
async def admin_get_config(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """获取所有系统配置（敏感值脱敏）"""
    result = await db.execute(text("SELECT key, value FROM system_configs ORDER BY key"))
    rows = result.fetchall()
    configs: dict[str, str] = {}
    for key, value in rows:
        # API Key 类脱敏显示
        if "api_key" in key and value:
            configs[key] = value[:6] + "***" + value[-4:] if len(value) > 10 else "***"
        else:
            configs[key] = value
    return {"code": 0, "data": configs, "message": "ok"}


@router.put("/config")
async def admin_update_config(
    data: dict,
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """批量更新系统配置。data = {key: value, ...}"""
    allowed_keys = {
        "search_serper_api_key", "search_tavily_api_key",
        "search_providers",
        "smtp_host", "smtp_port", "smtp_user",
        "smtp_password", "smtp_from",
        # ASR 语音转文字
        "asr_provider", "asr_siliconflow_api_key",
        "asr_siliconflow_model", "asr_siliconflow_base_url",
    }
    for key, value in data.items():
        if key not in allowed_keys:
            continue
        await db.execute(
            text(
                "INSERT INTO system_configs (key, value) VALUES (:k, :v) "
                "ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()"
            ),
            {"k": key, "v": str(value) if value else ""},
        )
    await db.commit()
    # ASR 配置可能变更 → 失效其内存缓存，使新配置立即生效
    try:
        from app.services.asr_service import _invalidate_asr_config_cache
        _invalidate_asr_config_cache()
    except Exception:
        pass
    return {"code": 0, "message": "配置已保存", "data": None}


# ── Traffic Stats ─────────────────────────────────────────────────

@router.get("/stats/traffic")
async def admin_traffic_stats(
    current_user: User = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """全站访问统计：今日PV、今日UV(路径去重)、本周趋势"""
    now = datetime.now(timezone.utc)
    today = now.date()
    week_ago = today - timedelta(days=7)

    # 今日总 PV
    today_pv = (await db.execute(
        select(func.count()).select_from(
            text("daily_stats WHERE date = :d")
        ).params(d=today)
    )).scalar() or 0

    # 今日独立路径数
    today_paths = (await db.execute(
        text("SELECT COUNT(DISTINCT path) FROM daily_stats WHERE date = :d"),
        {"d": today},
    )).scalar() or 0

    # 本周每日趋势
    trend_rows = (await db.execute(
        text(
            "SELECT date, COUNT(*)::int AS pv "
            "FROM daily_stats WHERE date >= :w "
            "GROUP BY date ORDER BY date"
        ),
        {"w": week_ago},
    )).fetchall()

    trend = [{"date": str(r[0]), "pv": r[1]} for r in trend_rows]

    # TOP 页面
    top_rows = (await db.execute(
        text(
            "SELECT path, COUNT(*)::int AS cnt FROM daily_stats "
            "WHERE date = :d GROUP BY path ORDER BY cnt DESC LIMIT 8"
        ),
        {"d": today},
    )).fetchall()
    top_pages = [{"path": r[0], "count": r[1]} for r in top_rows]

    return {
        "code": 0,
        "data": {
            "today_pv": today_pv,
            "today_paths": today_paths,
            "trend": trend,
            "top_pages": top_pages,
        },
        "message": "ok",
    }


@router.post("/config/test-search")
async def admin_test_search(
    current_user: User = Depends(require_admin),
):
    """测试搜索功能 — 用"广东省"测试并返回各 provider 状态"""
    from app.services.search.orchestrator import get_orchestrator
    orch = get_orchestrator()
    text = await orch.search("广东省", max_results=3)
    return {
        "code": 0,
        "data": {"result": text[:500] if text else "(无结果 — 所有搜索源不可用)"},
        "message": "ok",
    }


@router.post("/config/test-asr")
async def admin_test_asr(
    current_user: User = Depends(require_admin),
):
    """
    测试 ASR 语音转文字 — 用一段合成 PCM（1 秒短音）验证后端连通。
    主要验证：后端选择、在线 API Key/网络、或本地模型加载。
    合成音转写结果可能是空或乱码，重点看是否能正常返回不报错。
    """
    import struct
    import math
    from app.services.asr_service import transcribe_pcm, _load_asr_config

    cfg = await _load_asr_config()
    provider = (cfg.get("asr_provider") or "siliconflow").strip().lower()

    # 合成 1 秒 440Hz 正弦波 PCM（16kHz/16bit/mono）作为测试音频
    sample_rate = 16000
    duration_s = 1.0
    freq = 440.0
    n = int(sample_rate * duration_s)
    pcm = bytearray()
    for i in range(n):
        sample = int(32767 * 0.3 * math.sin(2 * math.pi * freq * i / sample_rate))
        pcm += struct.pack("<h", sample)

    try:
        text = await transcribe_pcm(bytes(pcm), "zh")
        has_key = bool((cfg.get("asr_siliconflow_api_key") or "").strip())
        return {
            "code": 0,
            "data": {
                "provider": provider,
                "text": text or "(空 — 合成测试音，转写结果不重要)",
                "online_key_configured": has_key if provider == "siliconflow" else None,
                "ok": True,
            },
            "message": "ok",
        }
    except Exception as e:
        return {
            "code": 0,
            "data": {
                "provider": provider,
                "ok": False,
                "error": str(e),
            },
            "message": "ok",
        }
