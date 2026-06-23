from abc import ABC, abstractmethod
from dataclasses import dataclass, field


@dataclass
class SearchResult:
    title: str
    snippet: str
    url: str = ""


class SearchProvider(ABC):
    """搜索服务抽象基类。每个 provider 只需实现 name / is_available / search。"""

    @property
    @abstractmethod
    def name(self) -> str:
        """provider 标识名，如 'serper'"""
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        """检查该 provider 是否已配置且可调用"""
        ...

    @abstractmethod
    async def search(self, queries: list[str], max_results: int = 5) -> list[SearchResult] | None:
        """执行搜索。失败返回 None，成功返回结果列表。"""
        ...
