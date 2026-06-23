import httpx
from app.config import get_settings
from app.services.search.base import SearchProvider, SearchResult


class TavilyProvider(SearchProvider):
    """Tavily — AI 优化搜索，摘要更适合喂给 LLM。
    注册: https://app.tavily.com → 邮箱注册 → 免费 1,000 次/月
    """

    def __init__(self):
        settings = get_settings()
        self.api_key = getattr(settings, "search_tavily_api_key", "") or ""

    @property
    def name(self) -> str:
        return "tavily"

    async def is_available(self) -> bool:
        return bool(self.api_key)

    async def search(self, queries: list[str], max_results: int = 5) -> list[SearchResult] | None:
        try:
            all_results: list[SearchResult] = []
            async with httpx.AsyncClient(timeout=15.0) as client:
                for q in queries:
                    resp = await client.post(
                        "https://api.tavily.com/search",
                        json={
                            "api_key": self.api_key,
                            "query": q,
                            "max_results": max_results,
                            "include_domains": [],
                        },
                    )
                    if resp.status_code != 200:
                        continue
                    data = resp.json()
                    for item in data.get("results", [])[:max_results]:
                        all_results.append(SearchResult(
                            title=item.get("title", ""),
                            snippet=item.get("content", ""),
                            url=item.get("url", ""),
                        ))
            return all_results[:max_results] if all_results else None
        except Exception:
            return None
