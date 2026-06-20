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
    """对单道面试题进行评分，返回各维度分数和评语"""

    prompt = f"""你是一位专业的面试评分官。请基于以下信息对面试者的回答进行评分。

岗位要求：{json.dumps(jd_data, ensure_ascii=False, indent=2)}
面试者简历：{json.dumps(resume_data, ensure_ascii=False, indent=2)}

题目：{question.question_text}
题目类型：{question.question_type}
面试者回答：{question.user_answer_transcript or "（未回答）"}

请从以下 4 个维度评分（百分制），并给出详细评语和参考答案：

评分维度：
1. 内容完整性 (content_completeness): 回答是否覆盖关键点，是否切题
2. 专业度 (professionalism): 体现的领域知识深度和准确性
3. 表达能力 (expression): 逻辑清晰度、语言组织、自信度
4. STAR 法则 (star_method): 行为题是否按 Situation-Task-Action-Result 组织

输出 JSON 格式：
{{
  "content_completeness": 85,
  "professionalism": 78,
  "expression": 90,
  "star_method": 82,
  "total_score": 84,
  "evaluation": "详细评语...",
  "reference_answer": "参考答案...",
  "improvement_suggestion": "改进建议..."
}}

只输出 JSON。"""

    result = await llm_chat([
        {"role": "system", "content": "你是一位资深的面试评分官，严格按维度评分。用中文。"},
        {"role": "user", "content": prompt},
    ], response_format={"type": "json_object"}, temperature=0.3)

    scores = json.loads(result)
    return scores


async def generate_interview_overview(
    interview: Interview,
    questions: list[InterviewQuestion],
    resume_data: dict,
    jd_data: dict,
) -> dict:
    """生成面试总评、能力差距分析和简历优化建议"""

    prompt = f"""你是一位资深面试官。请基于整场面试（{len(questions)} 题）的分析，输出以下内容。

岗位要求：{json.dumps(jd_data, ensure_ascii=False, indent=2)}
面试者简历：{json.dumps(resume_data, ensure_ascii=False, indent=2)}

各题评分摘要：
{json.dumps([{
    "question": q.question_text[:50],
    "type": q.question_type,
    "text": q.user_answer_transcript[:100] if q.user_answer_transcript else "",
    "scores": q.score_detail,
} for q in questions], ensure_ascii=False, indent=2)}

输出 JSON 格式：
{{
  "overview": "面试总评（200字以内，总结整体表现）",
  "dimension_scores": {{"content_completeness": 85, "professionalism": 78, "expression": 90, "star_method": 82, "total_score": 84}},
  "strengths": ["优势1", "优势2", "优势3"],
  "weaknesses": ["待改进1", "待改进2"],
  "resume_suggestions": "根据面试表现，针对简历的具体优化建议...",
  "learning_plan": {{
    "short_term": ["1-3天可完成的知识补充"],
    "medium_term": ["1-2周的技能提升"],
    "long_term": ["系统性学习路径"]
  }}
}}

只输出 JSON。"""

    result = await llm_chat([
        {"role": "system", "content": "你是一位资深的面试总评官。用中文回答。"},
        {"role": "user", "content": prompt},
    ], response_format={"type": "json_object"})

    return json.loads(result)


async def run_full_scoring(db: AsyncSession, interview_id: uuid.UUID) -> Interview:
    """完整评分流程：逐题评分 → 面试总评 → 更新数据库"""

    # 获取面试数据
    i_result = await db.execute(select(Interview).where(Interview.id == interview_id))
    interview = i_result.scalar_one_or_none()
    if not interview:
        raise ValueError("Interview not found")

    q_result = await db.execute(
        select(InterviewQuestion).where(InterviewQuestion.interview_id == interview_id)
        .order_by(InterviewQuestion.order_index)
    )
    questions = q_result.scalars().all()

    # 获取简历和 JD
    r_result = await db.execute(select(Resume).where(Resume.id == interview.resume_id))
    resume = r_result.scalar_one_or_none()
    resume_data = resume.parsed_data if resume else {}

    j_result = await db.execute(select(JobDescription).where(JobDescription.id == interview.jd_id))
    jd = j_result.scalar_one_or_none()
    jd_data = jd.parsed_data if jd else {}

    # 逐题评分
    for question in questions:
        if question.user_answer_transcript:
            scores = await score_question(question, resume_data, jd_data)
            question.ai_score = scores.get("total_score")
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
