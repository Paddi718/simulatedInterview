import json
from app.services.llm_client import llm_chat, _clean_json
from app.prompts import load_prompt


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


async def stream_questions(chunks, total_count: int):
    """流式解析 LLM 输出的 JSON 数组，逐题 yield。

    状态机：追踪大括号嵌套深度，在 depth 归零时提取完整 JSON 对象。
    兼容 LLM 输出中的 markdown fences 和文本前缀。
    """
    buffer = ""
    emitted = 0  # 已 yield 的题目数
    objects = []  # 累积解析出的题目对象

    async for chunk_text in chunks:
        buffer += chunk_text
        # 只在 buffer 足够大时才尝试解析（避免逐字符扫描开销）
        if len(buffer) < 50:
            continue

        # 状态机扫描：找到所有完整的 { ... } 对象
        depth = 0
        in_string = False
        escape = False
        obj_start = -1

        for i, ch in enumerate(buffer):
            if escape:
                escape = False
                continue
            if ch == '\\':
                escape = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == '{':
                if depth == 0:
                    obj_start = i
                depth += 1
            elif ch == '}':
                depth -= 1
                if depth == 0 and obj_start >= 0:
                    candidate = buffer[obj_start:i + 1]
                    try:
                        obj = json.loads(candidate)
                        if isinstance(obj, dict) and "question_text" in obj:
                            # 去重（相同 question_text 视为同一题）
                            existing = {o.get("question_text", "") for o in objects}
                            if obj.get("question_text", "") not in existing:
                                objects.append(obj)
                    except json.JSONDecodeError:
                        pass  # 不是合法 JSON 的 {...} 跳过

        # yield 新题目
        while emitted < len(objects):
            yield objects[emitted]
            emitted += 1
            if emitted >= total_count:
                return
    # 自然结束（async generator 不能 return value）


async def _search_hot_events(province: str) -> str:
    """搜索省份近期热点事件，用于公务员/事业单位面试出题。

    按 SEARCH_PROVIDERS 顺序链式调用 Serper → Tavily → SearXNG，
    第一个有结果即返回。全部失败或未配置任何搜索源时返回空字符串。
    """
    from app.services.search.orchestrator import get_orchestrator

    try:
        orchestrator = get_orchestrator()
        result = await orchestrator.search(province, max_results=5)
        return result
    except Exception:
        return ""


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

    from datetime import datetime

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
        current_date=datetime.now().strftime("%Y 年 %m 月"),
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

    from datetime import datetime

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
        current_date=datetime.now().strftime("%Y 年 %m 月"),
    )

    result = await llm_chat([
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ], temperature=temp, api_key=api_key, api_base=api_base, model=model)

    return _parse_questions(result, total_count)


async def generate_questions_stream(
    prompt_name: str,
    prompt_vars: dict,
    total_count: int,
    api_key: str | None = None,
    api_base: str | None = None,
    model: str | None = None,
):
    """流式生成面试题：调用 LLM stream → 逐题 yield（用于 SSE 实时推送）。

    用法：
        async for q in generate_questions_stream("generate_questions_civil_service", {...}, 3):
            # 每生成一题就存 DB 并 SSE push
            yield q
    """
    from app.services.llm_client import llm_chat_stream

    system, prompt, temp = load_prompt(prompt_name, **prompt_vars)

    chunks = llm_chat_stream([
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ], temperature=temp, api_key=api_key, api_base=api_base, model=model)

    async for question in stream_questions(chunks, total_count):
        yield question
