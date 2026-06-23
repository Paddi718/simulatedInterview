import httpx
from app.config import get_settings
from app.services.search.base import SearchProvider, SearchResult


class SearXNGProvider(SearchProvider):
    """SearXNG — 自部署元搜索引擎，聚合 Google/Bing/百度，免费无限。
    部署: docker run -d --name searxng -p 8080:8080 searxng/searxng:latest
    """

    def __init__(self):
        settings = get_settings()
        self.base_url = getattr(settings, "search_searxng_url", "") or ""

    @property
    def name(self) -> str:
        return "searxng"

    async def is_available(self) -> bool:
        if not self.base_url:
            return False
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{self.base_url.rstrip('/')}/search?format=json&q=test")
                return resp.status_code == 200
        except Exception:
            return False

    async def search(self, queries: list[str], max_results: int = 5) -> list[SearchResult] | None:
        try:
            all_results: list[SearchResult] = []
            async with httpx.AsyncClient(timeout=15.0) as client:
                for q in queries:
                    resp = await client.get(
                        f"{self.base_url.rstrip('/')}/search",
                        params={"format": "json", "q": q, "language": "zh-CN"},
                    )
                    if resp.status_code != 200:
                        continue
                    data = resp.json()
                    for item in data.get("results", [])[:max_results]:
                        all_results.append(SearchResult(
                            title=item.get("title", ""),
                            snippet=item.get("content", "") or item.get("snippet", ""),
                            url=item.get("url", ""),
                        ))
            return all_results[:max_results] if all_results else None
        except Exception:
            return None
