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
    api_key: str | None = None,
    api_base: str | None = None,
    model: str | None = None,
    category: str = "private_enterprise",
    category_config: dict | None = None,
) -> dict:
    """对单道面试题进行评分，按面试类别选择提示词"""

    from app.prompts import load_prompt
    from app.services.llm_client import _clean_json

    answer_text = (question.user_answer_transcript or "").strip()
    cfg = category_config or {}

    # ── 按类别选择提示词 key ──
    if category == "civil_service":
        answered_key = "score_question_answered_civil_service"
        unanswered_key = "score_question_unanswered_civil_service"
        common_vars = {
            "question_text": question.question_text,
            "question_type": question.question_type,
            "level": cfg.get("level", "省"),
            "position_category": cfg.get("position_category", "综合管理"),
        }
        zero_dimensions = {
            "analysis_ability": 0, "organization_ability": 0,
            "emergency_response": 0, "interpersonal_communication": 0,
            "verbal_expression": 0, "demeanor_appearance": 0,
        }
    elif category == "institution":
        answered_key = "score_question_answered_institution"
        unanswered_key = "score_question_unanswered_institution"
        common_vars = {
            "question_text": question.question_text,
            "question_type": question.question_type,
            "position_category": cfg.get("position_category", "综合管理"),
            "jd_data_json": jd_data,
        }
        zero_dimensions = {
            "analysis_ability": 0, "organization_ability": 0,
            "professional_knowledge": 0, "interpersonal_communication": 0,
            "verbal_expression": 0,
        }
    else:
        answered_key = "score_question_answered"
        unanswered_key = "score_question_unanswered"
        common_vars = {
            "jd_data_json": jd_data,
            "resume_data_json": resume_data,
            "question_text": question.question_text,
            "question_type": question.question_type,
        }
        zero_dimensions = {
            "content_completeness": 0, "professionalism": 0,
            "expression": 0, "star_method": 0,
        }

    # 空回答：生成参考答案
    if not answer_text or answer_text == "（未回答）":
        system, prompt, temp = load_prompt(unanswered_key, **common_vars)
        result = await llm_chat([
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ], temperature=temp, api_key=api_key, api_base=api_base, model=model)
        scores = json.loads(_clean_json(result))
        scores.update(zero_dimensions)
        scores["total_score"] = 0
        return scores

    # 正常回答：严格评分
    system, prompt, temp = load_prompt(
        answered_key,
        answer_text=answer_text,
        **common_vars,
    )
    result = await llm_chat([
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ], temperature=temp, api_key=api_key, api_base=api_base, model=model)
    return json.loads(_clean_json(result))


def _compute_aggregate_scores(questions: list[InterviewQuestion]) -> dict:
    """纯算术计算总分和维度平均分（维度从各题 score_detail 中动态提取）"""
    scored = [q for q in questions if q.ai_score is not None]
    if not scored:
        return {"total_score": 0, "dimension_scores": {}}
    n = len(scored)
    total_score = round(sum(q.ai_score for q in scored) / n)
    # 从已评分题目中收集所有维度 key
    dim_keys = set()
    for q in scored:
        if q.score_detail:
            dim_keys.update(q.score_detail.keys())
    dimension_scores = {}
    for d in sorted(dim_keys):
        vals = [(q.score_detail or {}).get(d, 0) for q in scored]
        dimension_scores[d] = round(sum(vals) / n)
    return {"total_score": total_score, "dimension_scores": dimension_scores}


async def generate_interview_overview(
    interview: Interview,
    questions: list[InterviewQuestion],
    resume_data: dict,
    jd_data: dict,
    api_key: str | None = None,
    api_base: str | None = None,
    model: str | None = None,
    category: str = "private_enterprise",
    category_config: dict | None = None,
) -> dict:
    """生成面试总评（按类别选择提示词）"""

    from app.prompts import load_prompt
    from app.services.llm_client import _clean_json

    answered = sum(1 for q in questions if q.user_answer_transcript and q.user_answer_transcript.strip() != "（未回答）")
    total = len(questions)
    cfg = category_config or {}

    # 题目摘要
    q_summary = [{
        "题号": q.order_index,
        "题目": q.question_text[:80],
        "类型": q.question_type,
        "得分": q.ai_score or 0,
    } for q in questions]

    # 简历摘要（仅 private_enterprise 和 institution 可能需要）
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

    position = jd_data.get('position', '') if isinstance(jd_data, dict) else ''

    # ── 按类别选择提示词 ──
    if category == "civil_service":
        prompt_key = "generate_overview_civil_service"
        prompt_vars = {
            "total": total, "answered": answered,
            "q_summary_json": q_summary,
            "level": cfg.get("level", "省"),
            "position_category": cfg.get("position_category", "综合管理"),
        }
    elif category == "institution":
        prompt_key = "generate_overview_institution"
        prompt_vars = {
            "total": total, "answered": answered,
            "q_summary_json": q_summary,
            "level": cfg.get("level", "省"),
            "position_category": cfg.get("position_category", "综合管理"),
            "resume_brief_json": resume_brief,
        }
    else:
        prompt_key = "generate_overview"
        prompt_vars = {
            "total": total, "answered": answered,
            "q_summary_json": q_summary,
            "resume_brief_json": resume_brief,
            "position": position,
        }

    system, prompt, temp = load_prompt(prompt_key, **prompt_vars)

    result = await llm_chat([
        {"role": "system", "content": system},
        {"role": "user", "content": prompt},
    ], temperature=temp, api_key=api_key, api_base=api_base, model=model)
    return json.loads(_clean_json(result))


async def run_full_scoring(db: AsyncSession, interview_id: uuid.UUID) -> Interview:
    """完整评分流程：并行逐题评分 → 算术聚合 → 写入总分数 → LLM总评(仅文字)"""

    i_result = await db.execute(select(Interview).where(Interview.id == interview_id))
    interview = i_result.scalar_one_or_none()
    if not interview:
        raise ValueError("Interview not found")

    # 查找用户 LLM 配置
    from app.models.user import User
    from app.services.llm_client import extract_llm_config
    u_result = await db.execute(select(User).where(User.id == interview.user_id))
    user = u_result.scalar_one_or_none()
    llm_key, llm_base, llm_model = extract_llm_config(user.llm_config if user else None)

    # 获取面试类别
    cat = getattr(interview, 'interview_category', 'private_enterprise') or 'private_enterprise'
    cat_cfg = getattr(interview, 'category_config', None) or {}

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
            scores = await score_question(question, resume_data, jd_data,
                api_key=llm_key, api_base=llm_base, model=llm_model,
                category=cat, category_config=cat_cfg)
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
        overview = await generate_interview_overview(interview, questions, resume_data, jd_data,
                api_key=llm_key, api_base=llm_base, model=llm_model,
                category=cat, category_config=cat_cfg)
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
