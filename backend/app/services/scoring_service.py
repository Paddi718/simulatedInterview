import json
import asyncio
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

    # 空回答或标记为未回答的，仍调用 LLM 生成参考答案
    if not answer_text or answer_text == "（未回答）":
        answer_text = "（未作答）"
        prompt = f"""你是一位专业的面试官。面试者未回答以下题目，请基于简历和岗位要求生成参考答案。

岗位要求：{json.dumps(jd_data, ensure_ascii=False, indent=2)}
面试者简历：{json.dumps(resume_data, ensure_ascii=False, indent=2)}

题目类型：{question.question_type}
题目：{question.question_text}

请结合简历和岗位要求，给出一道有针对性、具体的参考答案，并给出改进建议。

输出 JSON 格式：
{{
  "content_completeness": 0,
  "professionalism": 0,
  "expression": 0,
  "star_method": 0,
  "total_score": 0,
  "evaluation": "本题未作答。以下是该题的参考答案，请学习参考。",
  "reference_answer": "结合岗位要求和简历背景的具体参考答案...",
  "improvement_suggestion": "具体的改进建议"
}}

只输出 JSON。"""
        result = await llm_chat([
            {"role": "system", "content": "你是一位面试官。面试者跳过了这道题，请基于简历和岗位要求生成有针对性的参考答案。必须只输出JSON。"},
            {"role": "user", "content": prompt},
        ], temperature=0.5)
        result = result.strip()
        if result.startswith("```"): result = result.split("\n", 1)[1]
        if result.endswith("```"): result = result[:-3]
        scores = json.loads(result)
        scores["content_completeness"] = 0
        scores["professionalism"] = 0
        scores["expression"] = 0
        scores["star_method"] = 0
        scores["total_score"] = 0
        return scores

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


def _compute_aggregate_scores(questions: list[InterviewQuestion]) -> dict:
    """纯算术计算总分和维度平均分，无需 LLM"""
    scored = [q for q in questions if q.ai_score is not None]
    if not scored:
        return {
            "total_score": 0,
            "dimension_scores": {
                "content_completeness": 0, "professionalism": 0,
                "expression": 0, "star_method": 0,
            }
        }
    n = len(scored)
    total_score = round(sum(q.ai_score for q in scored) / n)
    dims = ["content_completeness", "professionalism", "expression", "star_method"]
    dimension_scores = {}
    for d in dims:
        vals = [(q.score_detail or {}).get(d, 0) for q in scored]
        dimension_scores[d] = round(sum(vals) / n)
    return {"total_score": total_score, "dimension_scores": dimension_scores}


async def generate_interview_overview(
    interview: Interview,
    questions: list[InterviewQuestion],
    resume_data: dict,
    jd_data: dict,
) -> dict:
    """生成面试总评和简历优化建议（仅文字，不含分数计算）"""

    answered = sum(1 for q in questions if q.user_answer_transcript and q.user_answer_transcript.strip() != "（未回答）")
    total = len(questions)

    # 精简 prompt：只传各题摘要（题号+题目+分数+类型），不传完整回答和 JD/简历
    q_summary = []
    for q in questions:
        q_summary.append({
            "题号": q.order_index,
            "题目": q.question_text[:80],
            "类型": q.question_type,
            "得分": q.ai_score or 0,
        })

    # 简历关键信息摘要（只传关键字段）
    resume_brief = {}
    if resume_data:
        basic = resume_data.get("basic", {})
        resume_brief["name"] = basic.get("name", "") if isinstance(basic, dict) else ""
        skills = resume_data.get("skills", [])
        resume_brief["skills"] = skills[:10] if isinstance(skills, list) else []
        exps = resume_data.get("experience", [])
        if isinstance(exps, list):
            resume_brief["experience_summary"] = [
                f"{e.get('company','')} {e.get('role','')}" for e in exps[:3]
            ]

    prompt = f"""你是一位资深面试官。请基于以下面试数据生成总评报告。

面试概况：共 {total} 题，实际回答 {answered} 题。

各题得分：
{json.dumps(q_summary, ensure_ascii=False, indent=1)}

候选人背景：{json.dumps(resume_brief, ensure_ascii=False)}

岗位核心要求：{json.dumps(jd_data.get('position', '') if isinstance(jd_data, dict) else '', ensure_ascii=False)}

请输出：
- overview: 面试总评（150字以内）。如果大部分题未回答，指出态度问题。
- strengths: 1-2个优势（全未回答写"无"）
- weaknesses: 1-2个待改进点
- resume_suggestions: 简历优化建议（100字以内）

输出 JSON：
{{
  "overview": "总评...",
  "strengths": ["优势"],
  "weaknesses": ["改进点"],
  "resume_suggestions": "简历建议"
}}

只输出 JSON。"""

    result = await llm_chat([
        {"role": "system", "content": "你是一位资深面试总评官。客观公正，用中文回答。必须只输出JSON。"},
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
    """完整评分流程：并行逐题评分 → 算术聚合 → 写入总分数 → LLM总评(仅文字)"""

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

    # Phase 1: 并行评分所有未评分题目（LLM 调用并发，大幅缩短等待时间）
    async def _score_one(question: InterviewQuestion):
        if question.ai_score is not None:
            return question, None  # 已评分
        try:
            scores = await score_question(question, resume_data, jd_data)
            return question, scores
        except Exception as e:
            print(f"[Scoring] Question {question.order_index} scoring failed: {e}")
            return question, {"_error": str(e)[:200]}

    # 并发执行所有 LLM 评分调用（不写 DB，无竞争）
    results = await asyncio.gather(*[_score_one(q) for q in questions])

    # 串行写入评分结果到 DB（安全）
    for question, scores in results:
        if scores is None:
            continue  # 已评分，跳过
        if "_error" in scores:
            question.ai_score = 0
            question.ai_evaluation = f"评分失败: {scores['_error']}"
        else:
            question.ai_score = scores.get("total_score", 0)
            question.score_detail = {k: v for k, v in scores.items()
                                     if k in ["content_completeness", "professionalism",
                                              "expression", "star_method"]}
            question.ai_evaluation = scores.get("evaluation", "")
            question.reference_answer = scores.get("reference_answer", "")
            question.improvement_suggestion = scores.get("improvement_suggestion", "")

    # Phase 2: 纯算术计算总分和维度分，立即写入（不等 LLM）
    agg = _compute_aggregate_scores(questions)
    interview.total_score = agg["total_score"]
    interview.dimension_scores = agg["dimension_scores"]
    interview.scoring_status = "scoring_overview"
    await db.commit()

    # Phase 3: LLM 生成文字总评（仅 overview + resume_suggestions）
    try:
        overview = await generate_interview_overview(interview, questions, resume_data, jd_data)
        interview.ai_overview = overview.get("overview", "")
        interview.resume_suggestions = overview.get("resume_suggestions", "")
        interview.scoring_status = "done"
        await db.commit()
    except Exception as e:
        print(f"[Scoring] Overview generation failed: {e}")
        interview.ai_overview = f"总评生成失败，请稍后重试。"
        interview.scoring_status = "failed"
        await db.commit()

    await db.refresh(interview)
    return interview
