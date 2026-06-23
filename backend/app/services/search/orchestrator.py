"""搜索编排器：按 SEARCH_PROVIDERS 顺序链式调用，第一个成功即返回。"""
import os
from app.services.search.base import SearchResult
from app.services.search.providers.serper import SerperProvider
from app.services.search.providers.tavily import TavilyProvider
from app.services.search.providers.searxng import SearXNGProvider

# 所有支持的 provider（仅实例化已配置的）
_PROVIDER_REGISTRY: dict[str, type] = {
    "serper": SerperProvider,
    "tavily": TavilyProvider,
    "searxng": SearXNGProvider,
}


class SearchOrchestrator:
    def __init__(self):
        order = os.getenv("SEARCH_PROVIDERS", "serper,tavily,searxng")
        ordered_keys = [k.strip() for k in order.split(",") if k.strip()]

        self.providers: list = []
        seen = set()
        for key in ordered_keys:
            if key in seen:
                continue
            seen.add(key)
            cls = _PROVIDER_REGISTRY.get(key)
            if cls is None:
                continue
            try:
                instance = cls()
                self.providers.append(instance)
            except Exception:
                pass

    async def search(self, province: str, max_results: int = 5) -> str:
        """搜索省份热点，返回格式化文本供 prompt 注入。全部失败返回 ''"""
        queries = [
            f"{province} 2026年 时政 热点新闻",
            f"{province} 政府工作报告 高质量发展 民生",
        ]

        for provider in self.providers:
            available = False
            try:
                available = await provider.is_available()
            except Exception:
                continue

            if not available:
                continue

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
