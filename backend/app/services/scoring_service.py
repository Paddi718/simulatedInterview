import json
import uuid
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.interview import Interview
from app.models.interview_question import InterviewQuestion
from app.models.resume import Resume
from app.models.job_description import JobDescription
from app.services.llm_client import llm_chat


async def score_question(
    question: InterviewQuestion,
    resume_data: dict,
    jd_data: dict,
) -> dict:
    """对单道面试题进行评分"""

    answer_text = (question.user_answer_transcript or "").strip()

    # 空回答或标记为未回答的，直接给 0 分，不调用 LLM
    if not answer_text or answer_text == "（未回答）":
        return {
            "content_completeness": 0,
            "professionalism": 0,
            "expression": 0,
            "star_method": 0,
            "total_score": 0,
            "evaluation": "未作答，无法评分。请在面试中认真回答每一道题。",
            "reference_answer": "",
            "improvement_suggestion": "请针对该题目进行回答练习。",
        }

    prompt = f"""你是一位严格的专业面试评分官。请对以下面试者的回答进行客观评分。

岗位要求：{json.dumps(jd_data, ensure_ascii=False, indent=2)}
面试者简历：{json.dumps(resume_data, ensure_ascii=False, indent=2)}

题目：{question.question_text}
题目类型：{question.question_type}
面试者回答：{answer_text}

请从以下 4 个维度严格评分（百分制，0-100），并给出评语和参考答案：

1. 内容完整性：回答是否覆盖关键点，是否切题
2. 专业度：体现的领域知识深度和准确性
3. 表达能力：逻辑清晰度、语言组织、自信度
4. STAR 法则：行为题是否按 Situation-Task-Action-Result 组织（非行为题给 50 基准分）

评分为严格模式（strict mode）：
- 0-30：回答非常差，完全不对题
- 31-50：回答较差，缺少关键内容
- 51-70：回答一般，基本切题但深度不足
- 71-85：回答良好，覆盖大部分要点
- 86-100：回答优秀，全面深入

输出 JSON 格式（不要照抄示例分数，根据实际回答质量给分）：
{{
  "content_completeness": 0,
  "professionalism": 0,
  "expression": 0,
  "star_method": 0,
  "total_score": 0,
  "evaluation": "针对本次回答的详细评语",
  "reference_answer": "该题的参考答案",
  "improvement_suggestion": "具体的改进建议"
}}

只输出 JSON。"""

    result = await llm_chat([
        {"role": "system", "content": "你是一位严格公正的面试评分官。根据回答质量客观评分，不虚高。用中文回答。必须只输出JSON，不要有其他内容。"},
        {"role": "user", "content": prompt},
    ], temperature=0.1)

    # 清理可能的 markdown fence
    result = result.strip()
    if result.startswith("```"):
        lines = result.split("\n")
        result = "\n".join(lines[1:])
        if result.endswith("```"):
            result = result[:-3]
    scores = json.loads(result)
    return scores


async def generate_interview_overview(
    interview: Interview,
    questions: list[InterviewQuestion],
    resume_data: dict,
    jd_data: dict,
) -> dict:
    """生成面试总评、能力差距分析和简历优化建议"""

    # 统计实际回答数
    answered = sum(1 for q in questions if q.user_answer_transcript and q.user_answer_transcript.strip() != "（未回答）")
    total = len(questions)

    prompt = f"""你是一位资深面试官。请基于整场面试（共 {total} 题，实际回答 {answered} 题）生成总评报告。

岗位要求：{json.dumps(jd_data, ensure_ascii=False, indent=2)}
面试者简历：{json.dumps(resume_data, ensure_ascii=False, indent=2)}

各题评分：
{json.dumps([{
    "题号": q.order_index,
    "题目": q.question_text[:60],
    "类型": q.question_type,
    "回答摘要": (q.user_answer_transcript or "(未回答)")[:80],
    "各维度": q.score_detail or {},
    "总分": q.ai_score or 0,
} for q in questions], ensure_ascii=False, indent=2)}

请输出：
- overview: 面试总评（200字以内），如果大部分题未回答，应明确指出态度问题
- dimension_scores: 四个维度的平均分加上 total_score（按实际回答题数计算，未作答的题已经是0分）
- strengths: 2-3个优势（如果全未回答，写"无"）
- weaknesses: 2-3个待改进点
- resume_suggestions: 简历优化建议

输出 JSON：
{{
  "overview": "总评...",
  "dimension_scores": {{"content_completeness": 0, "professionalism": 0, "expression": 0, "star_method": 0, "total_score": 0}},
  "strengths": ["优势"],
  "weaknesses": ["改进点"],
  "resume_suggestions": "简历建议",
  "learning_plan": {{
    "short_term": ["短期提升"],
    "medium_term": ["中期提升"],
    "long_term": ["长期学习"]
  }}
}}

只输出 JSON。"""

    result = await llm_chat([
        {"role": "system", "content": "你是一位资深面试总评官。客观公正，根据实际表现评分。用中文回答。必须只输出JSON。"},
        {"role": "user", "content": prompt},
    ], temperature=0.1)

    result = result.strip()
    if result.startswith("```"):
        lines = result.split("\n")
        result = "\n".join(lines[1:])
        if result.endswith("```"):
            result = result[:-3]
    return json.loads(result)


async def run_full_scoring(db: AsyncSession, interview_id: uuid.UUID) -> Interview:
    """完整评分流程：逐题评分 → 面试总评 → 更新数据库"""

    i_result = await db.execute(select(Interview).where(Interview.id == interview_id))
    interview = i_result.scalar_one_or_none()
    if not interview:
        raise ValueError("Interview not found")

    q_result = await db.execute(
        select(InterviewQuestion).where(InterviewQuestion.interview_id == interview_id)
        .order_by(InterviewQuestion.order_index)
    )
    questions = q_result.scalars().all()

    r_result = await db.execute(select(Resume).where(Resume.id == interview.resume_id))
    resume = r_result.scalar_one_or_none()
    resume_data = resume.parsed_data if resume else {}

    j_result = await db.execute(select(JobDescription).where(JobDescription.id == interview.jd_id))
    jd = j_result.scalar_one_or_none()
    jd_data = jd.parsed_data if jd else {}

    # 逐题评分（包括空回答也给0分）
    for question in questions:
        scores = await score_question(question, resume_data, jd_data)
        question.ai_score = scores.get("total_score", 0)
        question.score_detail = {k: v for k, v in scores.items()
                                 if k in ["content_completeness", "professionalism",
                                          "expression", "star_method"]}
        question.ai_evaluation = scores.get("evaluation", "")
        question.reference_answer = scores.get("reference_answer", "")
        question.improvement_suggestion = scores.get("improvement_suggestion", "")

    # 面试总评
    overview = await generate_interview_overview(interview, questions, resume_data, jd_data)

    interview.total_score = overview.get("dimension_scores", {}).get("total_score", 0)
    interview.dimension_scores = overview.get("dimension_scores", {})
    interview.ai_overview = overview.get("overview", "")
    interview.resume_suggestions = overview.get("resume_suggestions", "")

    await db.commit()
    await db.refresh(interview)
    return interview
