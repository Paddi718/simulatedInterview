import httpx
from app.config import get_settings
from app.services.search.base import SearchProvider, SearchResult


class SerperProvider(SearchProvider):
    """Serper — Google SERP 抓取，中文搜索质量最高。
    注册: https://serper.dev → 邮箱注册 → 免费 2,500 次
    """

    def __init__(self):
        settings = get_settings()
        self.api_key = getattr(settings, "search_serper_api_key", "") or ""

    @property
    def name(self) -> str:
        return "serper"

    async def is_available(self) -> bool:
        return bool(self.api_key)

    async def search(self, queries: list[str], max_results: int = 5) -> list[SearchResult] | None:
        try:
            all_results: list[SearchResult] = []
            async with httpx.AsyncClient(timeout=15.0) as client:
                for q in queries:
                    resp = await client.post(
                        "https://google.serper.dev/search",
                        headers={"X-API-KEY": self.api_key, "Content-Type": "application/json"},
                        json={"q": q, "num": max_results, "gl": "cn", "hl": "zh-cn"},
                    )
                    if resp.status_code != 200:
                        continue
                    data = resp.json()
                    for item in data.get("organic", [])[:max_results]:
                        all_results.append(SearchResult(
                            title=item.get("title", ""),
                            snippet=item.get("snippet", ""),
                            url=item.get("link", ""),
                        ))
            return all_results[:max_results] if all_results else None
        except Exception:
            return None
