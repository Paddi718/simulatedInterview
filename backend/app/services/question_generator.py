import json
import httpx
from app.services.llm_client import llm_chat, _clean_json
from app.prompts import load_prompt
from app.config import get_settings


def _parse_questions(result: str, total_count: int) -> list[dict]:
    """解析 LLM 返回的题目列表（兼容多种格式）"""
    result = _clean_json(result).strip()
    if result.startswith("```"):
        lines = result.split("\n")
        result = "\n".join(lines[1:]) if len(lines) > 1 else result
        if result.endswith("```"):
            result = result[:-3]

    try:
        questions = json.loads(result)
    except json.JSONDecodeError:
        import re
        match = re.search(r'\[.*\]', result, re.DOTALL)
        if match:
            try:
                questions = json.loads(match.group())
            except json.JSONDecodeError:
                return []
        else:
            return []

    if isinstance(questions, dict) and "questions" in questions:
        questions = questions["questions"]

    if isinstance(questions, list):
        return questions[:total_count]
    return []


async def _search_hot_events(province: str) -> str:
    """搜索省份近期热点事件，用于公务员/事业单位面试出题。
    返回格式化的热点文本，搜索失败或未配置 API Key 时返回空字符串。
    """
    settings = get_settings()
    api_key = settings.bing_search_api_key
    if not api_key:
        return ""

    queries = [
        f"{province} 时政热点 公务员面试",
        f"{province} 政府工作报告 重点工作 民生",
    ]
    all_results = []

    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            for q in queries:
                try:
                    resp = await client.get(
                        "https://api.bing.microsoft.com/v7.0/search",
                        headers={"Ocp-Apim-Subscription-Key": api_key},
                        params={"q": q, "count": 3, "mkt": "zh-CN", "freshness": "Month"},
                    )
                    if resp.status_code == 200:
                        data = resp.json()
                        for item in data.get("webPages", {}).get("value", [])[:3]:
                            all_results.append({
                                "title": item.get("name", ""),
                                "snippet": item.get("snippet", ""),
                            })
                except Exception:
                    continue
    except Exception:
        pass

    if not all_results:
        return ""

    # 格式化为 prompt 可用的文本
    lines = []
    for i, r in enumerate(all_results[:5], 1):
        lines.append(f"{i}. {r['title']}\n   {r['snippet']}")
    return "\n".join(lines)


async def generate_questions(
    resume_data: dict,
    jd_data: dict,
    difficulty: str = "mid",
    total_count: int = 10,
    api_key: str | None = None,
    api_base: str | None = None,
    model: str | None = None,
) -> list[dict]:
    """根据简历和 JD 生成面试题目（私企）"""

    system, prompt, temp = load_prompt(
        "generate_questions",
        total_count=total_count,
        difficulty=difficulty,
        resume_data_json=resume_data,
        jd_data_json=jd_data,
    )

    result = await llm_chat([
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ], temperature=temp, api_key=api_key, api_base=api_base, model=model)

    return _parse_questions(result, total_count)


async def generate_questions_civil_service(
    province: str,
    position_category: str,
    level: str,
    position_name: str = "",
    total_count: int = 3,
    api_key: str | None = None,
    api_base: str | None = None,
    model: str | None = None,
) -> list[dict]:
    """生成公务员结构化面试题（结合省情+热点）"""

    # 搜索近期热点事件（非阻塞，失败也不影响出题）
    hot_events = await _search_hot_events(province)

    system, prompt, temp = load_prompt(
        "generate_questions_civil_service",
        province=province,
        total_count=total_count,
        level=level,
        position_category=position_category,
        position_name=position_name,
        hot_events=hot_events,
    )

    result = await llm_chat([
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ], temperature=temp, api_key=api_key, api_base=api_base, model=model)

    return _parse_questions(result, total_count)


async def generate_questions_institution(
    province: str,
    position_category: str,
    level: str = "",
    position_name: str = "",
    resume_data: dict | None = None,
    jd_data: dict | None = None,
    total_count: int = 5,
    api_key: str | None = None,
    api_base: str | None = None,
    model: str | None = None,
) -> list[dict]:
    """生成事业单位面试题（可选简历/JD，结合省情+热点）"""

    # 搜索近期热点事件
    hot_events = await _search_hot_events(province)

    system, prompt, temp = load_prompt(
        "generate_questions_institution",
        province=province,
        total_count=total_count,
        level=level,
        position_category=position_category,
        position_name=position_name,
        hot_events=hot_events,
        resume_data_json=resume_data or {},
        jd_data_json=jd_data or {},
    )

    result = await llm_chat([
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ], temperature=temp, api_key=api_key, api_base=api_base, model=model)

    return _parse_questions(result, total_count)
