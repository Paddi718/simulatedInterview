import json
from typing import Optional
import httpx
from app.config import get_settings
from app.prompts import load_prompt

settings = get_settings()


def _clean_json(result: str) -> str:
    """清理 LLM 返回的 JSON：去除 markdown fence"""
    result = result.strip()
    if result.startswith("```"):
        lines = result.split("\n")
        result = "\n".join(lines[1:])
        if result.endswith("```"):
            result = result[:-3]
    return result.strip()


def extract_llm_config(user_llm_config: dict | None) -> tuple[str | None, str | None, str | None]:
    """从用户 JSONB 字段提取 LLM 配置（api_key, api_base, model）。
    返回三元组，值为 None 时 llm_chat 会 fallback 到 settings 全局值。
    """
    if not user_llm_config:
        return None, None, None
    return (
        user_llm_config.get('api_key') or None,
        user_llm_config.get('api_base') or None,
        user_llm_config.get('model') or None,
    )


async def llm_chat(
    messages: list[dict],
    response_format: Optional[dict] = None,
    temperature: float = 0.7,
    api_key: Optional[str] = None,
    api_base: Optional[str] = None,
    model: Optional[str] = None,
) -> str:
    """调用 LLM API 获取回复。支持用户自定义 API 配置。"""
    headers = {
        "Authorization": f"Bearer {api_key or settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model or settings.llm_model,
        "messages": messages,
        "temperature": temperature,
    }

    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            f"{api_base or settings.llm_api_base}/chat/completions",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


async def llm_parse(text: str, api_key: str | None = None, api_base: str | None = None, model: str | None = None) -> dict:
    """LLM 解析简历（提示词从 YAML 加载）"""
    system, prompt, temp = load_prompt("resume_parse", text=text[:15000])
    result = await llm_chat([
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ], temperature=temp, api_key=api_key, api_base=api_base, model=model)
    return json.loads(_clean_json(result))


async def llm_parse_jd(text: str, api_key: str | None = None, api_base: str | None = None, model: str | None = None) -> dict:
    """LLM 解析 JD（提示词从 YAML 加载）"""
    system, prompt, temp = load_prompt("jd_parse", text=text[:8000])
    result = await llm_chat([
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ], temperature=temp, api_key=api_key, api_base=api_base, model=model)
    return json.loads(_clean_json(result))
