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

    优先级：用户配置 > 全局 .env（可选兜底）
    若用户未配置且全局也无 key，调用方应返回明确错误，引导用户去设置页配置。
    """
    if not user_llm_config:
        return None, None, None

    user_key = user_llm_config.get('api_key') or None
    user_base = user_llm_config.get('api_base') or None
    user_model = user_llm_config.get('model') or None

    # 若有全局兜底 key 且用户未覆盖，则使用全局值（仅开发/自托管场景）
    from app.config import get_settings
    settings = get_settings()
    api_key = user_key or settings.llm_api_key or None
    api_base = user_base or settings.llm_api_base or None
    model = user_model or settings.llm_model or None

    return api_key, api_base, model


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


async def llm_chat_stream(
    messages: list[dict],
    temperature: float = 0.7,
    api_key: Optional[str] = None,
    api_base: Optional[str] = None,
    model: Optional[str] = None,
):
    """调用 LLM API 流式返回（async generator，逐 chunk yield 文本增量）"""
    headers = {
        "Authorization": f"Bearer {api_key or settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": model or settings.llm_model,
        "messages": messages,
        "temperature": temperature,
        "stream": True,
    }

    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            f"{api_base or settings.llm_api_base}/chat/completions",
            headers=headers,
            json=payload,
        ) as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if line.startswith("data: "):
                    data = line[6:]
                    if data == "[DONE]":
                        break
                    try:
                        chunk = json.loads(data)
                        delta = chunk["choices"][0].get("delta", {})
                        content = delta.get("content", "")
                        if content:
                            yield content
                    except (json.JSONDecodeError, KeyError, IndexError):
                        continue


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
