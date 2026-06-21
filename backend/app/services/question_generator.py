import json
from app.services.llm_client import llm_chat


async def generate_questions(
    resume_data: dict,
    jd_data: dict,
    difficulty: str = "mid",
    total_count: int = 10,
) -> list[dict]:
    """根据简历和 JD 生成面试题目"""

    prompt = f"""你是一位专业的面试官。请基于以下简历和岗位要求，生成 {total_count} 道面试题。

难度级别: {difficulty}

题目类型分配:
- 自我介绍(1题): 要求结合简历和岗位进行自我介绍
- 行为面试(3题): 深挖简历中的项目/工作经历
- 专业技能(3题): 针对 JD 中的技术要求考察
- 情景题(2题): 基于 JD 职责设计的场景
- 职业规划(1题): 评估求职动机和匹配度

简历(结构化):
{json.dumps(resume_data, ensure_ascii=False, indent=2)}

岗位要求:
{json.dumps(jd_data, ensure_ascii=False, indent=2)}

输出 JSON 数组:
[
  {{
    "question_text": "题目内容",
    "question_type": "behavioral|technical|situational|career|introduction",
    "examine_point": "考察点说明"
  }}
]

只输出 JSON 数组。"""

    result = await llm_chat([
        {"role": "system", "content": "你是一位资深的专业面试官。请根据简历和JD生成针对性面试题。用中文回答。必须只输出JSON数组。"},
        {"role": "user", "content": prompt},
    ])

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
