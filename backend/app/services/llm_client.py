import json
from typing import Optional
import httpx
from app.config import get_settings

settings = get_settings()

SYSTEM_PROMPT = "You are a helpful assistant. Always respond in Chinese. Output only valid JSON when requested."


async def llm_chat(
    messages: list[dict],
    response_format: Optional[dict] = None,
    temperature: float = 0.7,
) -> str:
    """调用 LLM API 获取回复"""
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": temperature,
    }
    if response_format:
        payload["response_format"] = response_format

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{settings.llm_api_base}/chat/completions",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


async def llm_parse(text: str) -> dict:
    """LLM 解析简历"""
    prompt = f"""请从以下简历文本中提取结构化信息，输出 JSON 格式：
{{
  "basic": {{"name": str, "education": [{{"school": str, "degree": str, "major": str, "period": str}}]}},
  "experience": [{{"company": str, "role": str, "period": str, "description": str, "tech_stack": [str], "highlights": [str]}}],
  "projects": [{{"name": str, "description": str, "role": str, "highlights": [str]}}],
  "skills": [str],
  "certifications": [str],
  "self_evaluation": str
}}

简历文本：
{text[:15000]}

只输出 JSON。"""
    result = await llm_chat([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ], response_format={"type": "json_object"})
    return json.loads(result)


async def llm_parse_jd(text: str) -> dict:
    """LLM 解析 JD"""
    prompt = f"""请从以下岗位介绍中提取结构化信息，输出 JSON 格式：
{{
  "company_info": str,
  "position": str,
  "key_responsibilities": [str],
  "requirements": [str],
  "preferred": [str],
  "team_culture": str,
  "salary_range": str
}}

JD 文本：
{text[:8000]}

只输出 JSON。"""
    result = await llm_chat([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ], response_format={"type": "json_object"})
    return json.loads(result)
