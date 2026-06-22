import json
from app.services.llm_client import llm_chat, _clean_json
from app.prompts import load_prompt


async def generate_questions(
    resume_data: dict,
    jd_data: dict,
    difficulty: str = "mid",
    total_count: int = 10,
    api_key: str | None = None,
    api_base: str | None = None,
    model: str | None = None,
) -> list[dict]:
    """根据简历和 JD 生成面试题目（提示词从 YAML 加载）"""

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

    result = _clean_json(result)

    # 尝试多种 JSON 解析方式（兼容不同 LLM 输出格式）
    result = result.strip()
    # 去掉 markdown code fences
    if result.startswith("```"):
        lines = result.split("\n")
        result = "\n".join(lines[1:]) if len(lines) > 1 else result
        if result.endswith("```"):
            result = result[:-3]

    try:
        questions = json.loads(result)
    except json.JSONDecodeError:
        # 尝试提取 JSON 数组
        import re
        match = re.search(r'\[.*\]', result, re.DOTALL)
        if match:
            try:
                questions = json.loads(match.group())
            except json.JSONDecodeError:
                return []
        else:
            return []

    # 兼容 {"questions": [...]} 格式
    if isinstance(questions, dict) and "questions" in questions:
        questions = questions["questions"]

    if isinstance(questions, list):
        return questions[:total_count]
    return []
