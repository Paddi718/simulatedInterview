"""内置搜索 — 直接请求 cn.bing.com，无需 API Key，永远可用的兜底方案。"""
import re
import random
import asyncio
import httpx
from app.services.search.base import SearchProvider, SearchResult


class BuiltinSearchProvider(SearchProvider):
    """内置 Bing 搜索爬虫。无需任何配置，自动兜底。"""

    @property
    def name(self) -> str:
        return "builtin"

    async def is_available(self) -> bool:
        return True  # 无需 Key，永远可用

    async def search(self, queries: list[str], max_results: int = 5) -> list[SearchResult] | None:
        all_results: list[SearchResult] = []

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                for q in queries:
                    # 随机延迟，避免被限流
                    await asyncio.sleep(random.uniform(0.5, 1.5))

                    try:
                        resp = await client.get(
                            "https://cn.bing.com/search",
                            params={"q": q, "count": max_results},
                            headers={
                                "User-Agent": (
                                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                                    "Chrome/125.0.0.0 Safari/537.36"
                                ),
                                "Accept-Language": "zh-CN,zh;q=0.9",
                            },
                            follow_redirects=True,
                        )
                        if resp.status_code != 200:
                            continue

                        html = resp.text
                        # 提取搜索结果：<li class="b_algo"> ... <h2><a>title</a></h2> ... <p>snippet</p>
                        items = re.findall(
                            r'<li[^>]*class="b_algo"[^>]*>(.*?)</li>',
                            html, re.DOTALL
                        )
                        for item in items[:max_results]:
                            title_m = re.search(r'<h2[^>]*>.*?<a[^>]*>(.*?)</a>', item, re.DOTALL)
                            snippet_m = re.search(r'<p[^>]*class="[^"]*b_lineclamp[^"]*"[^>]*>(.*?)</p>', item, re.DOTALL)
                            if not snippet_m:
                                snippet_m = re.search(r'<p[^>]*>(.*?)</p>', item, re.DOTALL)

                            title = _clean(title_m.group(1)) if title_m else ""
                            snippet = _clean(snippet_m.group(1)) if snippet_m else ""

                            if title:
                                all_results.append(SearchResult(title=title, snippet=snippet))

                    except Exception:
                        continue

        except Exception:
            pass

        return all_results[:max_results] if all_results else None


def _clean(text: str) -> str:
    """去除 HTML 标签和多余空白"""
    text = re.sub(r'<[^>]+>', '', text)
    text = re.sub(r'&[a-z]+;', ' ', text)
    text = re.sub(r'\s+', ' ', text)
    return text.strip()
