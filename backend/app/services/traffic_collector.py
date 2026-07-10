"""
访问统计收集器 — 解析 nginx access.log → 写入 daily_stats + visit_logs

nginx 日志格式（默认 combined）：
  $remote_addr - - [$time_local] "$request" $status $body_bytes_sent "$http_referer" "$http_user_agent"

解析步骤：
  1. tail 增量读取 nginx access.log
  2. 正则提取 IP、时间、路径、状态码、UA
  3. 每 60 秒批量 INSERT 到 DB
  4. IP 地理位置查 ip-api.com（缓存）
"""
import os
import re
import time
import asyncio
import hashlib

# nginx combined 日志格式正则
_LOG_RE = re.compile(
    r'^(\S+)\s+\S+\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+\S+"\s+(\d+)\s+\S+\s+"[^"]*"\s+"([^"]*)"'
)

_NGINX_LOG = os.getenv("NGINX_ACCESS_LOG", "/var/log/nginx/access.log")
_read_offset = 0
_geo_cache: dict = {}


async def _geo_lookup(ip: str) -> tuple[str | None, str | None]:
    if ip in ("-", "127.0.0.1", "localhost") or ip.startswith(("172.", "192.168.", "10.")):
        return None, None
    if ip in _geo_cache:
        return _geo_cache[ip]
    try:
        import httpx
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"http://ip-api.com/json/{ip}?lang=zh-CN&fields=country,city")
            if r.status_code == 200:
                d = r.json()
                country, city = d.get("country"), d.get("city")
                _geo_cache[ip] = (country, city)
                return country, city
    except Exception:
        pass
    _geo_cache[ip] = (None, None)
    return None, None


async def run_collector():
    """后台任务：每 60 秒解析 nginx 日志新增行 → 写入 DB"""
    global _read_offset
    from datetime import date as _date
    from sqlalchemy import text
    from app.database import async_session_factory

    # 初始化：跳到文件末尾（不导入历史日志）
    try:
        if os.path.exists(_NGINX_LOG):
            _read_offset = os.path.getsize(_NGINX_LOG)
    except Exception:
        _read_offset = 0

    while True:
        await asyncio.sleep(60)
        try:
            if not os.path.exists(_NGINX_LOG):
                continue
            size = os.path.getsize(_NGINX_LOG)
            if size <= _read_offset:
                _read_offset = size  # log rotated, reset
                continue

            with open(_NGINX_LOG, "r", encoding="utf-8", errors="ignore") as f:
                f.seek(_read_offset)
                new_lines = f.readlines()
                _read_offset = f.tell()

            if not new_lines:
                continue

            today = _date.today()
            pv_rows = []
            visit_rows = []

            for line in new_lines:
                m = _LOG_RE.match(line.strip())
                if not m:
                    continue
                ip = m.group(1)
                method = m.group(3)
                path = m.group(4).split("?")[0]  # 去 query 参数
                status = m.group(5)
                ua = (m.group(6) or "")[:500]

                # 跳过静态资源和 API
                if method != "GET" and method != "POST":
                    continue
                if status not in ("200", "201", "301", "302"):
                    continue
                if path.endswith((".js", ".css", ".json", ".svg", ".ico", ".png", ".map", ".woff", ".woff2")):
                    continue
                if path.startswith(("/api/health", "/api/ws/", "/_next/", "/favicon")):
                    continue

                pv_rows.append((today, path[:100]))
                visit_rows.append((ip, path[:200], ua))

            if not pv_rows:
                continue

            async with async_session_factory() as db:
                for d, p in pv_rows:
                    await db.execute(
                        text("INSERT INTO daily_stats (date, path, count) VALUES (:d, :p, 1)"),
                        {"d": d, "p": p},
                    )
                for ip, p, ua in visit_rows:
                    country, city = await _geo_lookup(ip)
                    await db.execute(
                        text("INSERT INTO visit_logs (ip, country, city, path, user_agent) VALUES (:ip,:cc,:ct,:p,:ua)"),
                        {"ip": ip, "cc": country, "ct": city, "p": p, "ua": ua},
                    )
                await db.commit()
        except Exception:
            pass
