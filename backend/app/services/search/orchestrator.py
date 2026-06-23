"""搜索编排器：DB配置优先 → .env兜底 → 内置Bing爬虫最终兜底。"""
import os
from app.services.search.base import SearchResult
from app.services.search.providers.serper import SerperProvider
from app.services.search.providers.tavily import TavilyProvider
from app.services.search.providers.searxng import SearXNGProvider
from app.services.search.providers.builtin import BuiltinSearchProvider

_PROVIDER_REGISTRY: dict[str, type] = {
    "serper": SerperProvider,
    "tavily": TavilyProvider,
    "searxng": SearXNGProvider,
    "builtin": BuiltinSearchProvider,
}


def _read_db_config(key: str) -> str | None:
    """从 system_configs 表读取配置值（同步查询，因为 orchestrator 在 async 上下文中调用）"""
    try:
        from sqlalchemy import select, text
        from app.database import async_session_factory
        import asyncio

        async def _query():
            async with async_session_factory() as db:
                r = await db.execute(
                    text("SELECT value FROM system_configs WHERE key = :k"), {"k": key}
                )
                row = r.fetchone()
                return row[0] if row else None

        # 尝试获取当前事件循环
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return None

        # 在同一事件循环中创建 task（兼容 async 上下文）
        import concurrent.futures
        future = asyncio.ensure_future(_query())
        # 不能直接 await，因为外层的 search() 是 async 的
        # 改为：把 _read_db_config 改为 async 函数
        return None  # 占位，下面会重构为 async
    except Exception:
        return None


async def _read_db_config_async(key: str) -> str | None:
    """从 system_configs 表异步读取配置值"""
    try:
        from sqlalchemy import text
        from app.database import async_session_factory
        async with async_session_factory() as db:
            r = await db.execute(
                text("SELECT value FROM system_configs WHERE key = :k"), {"k": key}
            )
            row = r.fetchone()
            return row[0] if row else None
    except Exception:
        return None


class SearchOrchestrator:
    def __init__(self):
        # 初始化时不读配置，每次 search() 时动态读取 DB
        self._provider_classes = _PROVIDER_REGISTRY

    async def search(self, province: str, max_results: int = 5) -> str:
        """搜索省份热点，返回格式化文本供 prompt 注入。全部失败返回 ''"""
        queries = [
            f"{province} 2026年 时政 热点新闻",
            f"{province} 政府工作报告 高质量发展 民生",
        ]

        # 从 DB 读取配置（优先级高于 .env）
        db_serper_key = await _read_db_config_async("search_serper_api_key")
        db_tavily_key = await _read_db_config_async("search_tavily_api_key")
        db_searxng_url = await _read_db_config_async("search_searxng_url")
        db_providers = await _read_db_config_async("search_providers")

        # 优先级：DB > .env
        serper_key = db_serper_key or os.getenv("SEARCH_SERPER_API_KEY", "")
        tavily_key = db_tavily_key or os.getenv("SEARCH_TAVILY_API_KEY", "")
        searxng_url = db_searxng_url or os.getenv("SEARCH_SEARXNG_URL", "")
        provider_order = db_providers or os.getenv("SEARCH_PROVIDERS", "serper,tavily,builtin")

        # 确保 builtin 始终在最后兜底
        ordered_keys = [k.strip() for k in provider_order.split(",") if k.strip()]
        if "builtin" not in ordered_keys:
            ordered_keys.append("builtin")

        # 去重（保持顺序）
        seen = set()
        ordered_keys = [k for k in ordered_keys if not (k in seen or seen.add(k))]

        # 动态构造 provider 实例，注入 DB 中读取的 Key
        for key in ordered_keys:
            cls = self._provider_classes.get(key)
            if cls is None:
                continue

            # builtin 不需要 Key
            if key == "builtin":
                provider = cls()
            elif key == "serper":
                provider = cls()
                provider.api_key = serper_key
            elif key == "tavily":
                provider = cls()
                provider.api_key = tavily_key
            elif key == "searxng":
                provider = cls()
                provider.base_url = searxng_url
            else:
                continue

            # 检查可用性
            try:
                available = await provider.is_available()
            except Exception:
                continue

            if not available:
                continue

            # 执行搜索
            try:
                results = await provider.search(queries, max_results)
                if results:
                    return self._format(results, provider.name)
            except Exception:
                continue

        return ""

    def _format(self, results: list[SearchResult], source: str) -> str:
        lines = [f"（来源：{source}）"]
        for i, r in enumerate(results, 1):
            lines.append(f"{i}. {r.title}\n   {r.snippet}")
        return "\n".join(lines)


# 全局单例
_orchestrator: SearchOrchestrator | None = None


def get_orchestrator() -> SearchOrchestrator:
    global _orchestrator
    if _orchestrator is None:
        _orchestrator = SearchOrchestrator()
    return _orchestrator
