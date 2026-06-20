import uuid
import os
from datetime import datetime
from pathlib import Path
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.interview import Interview
from app.models.interview_question import InterviewQuestion
from app.models.interview_document import InterviewDocument
from app.models.resume import Resume

QUESTION_TYPE_LABELS = {
    "introduction": "自我介绍",
    "behavioral": "行为面试",
    "technical": "专业技能",
    "situational": "情景题",
    "career": "职业规划",
}


def _build_markdown(interview: Interview, questions: list[InterviewQuestion]) -> str:
    """生成 Markdown 格式报告（使用 Jinja2 模板）"""
    from jinja2 import Environment, FileSystemLoader

    env = Environment(loader=FileSystemLoader(Path(__file__).parent.parent / "templates"))
    template = env.get_template("report.md")

    context = _build_context(interview, questions)
    return template.render(**context)


def _build_html(interview: Interview, questions: list[InterviewQuestion]) -> str:
    """生成 HTML 格式报告"""
    import markdown
    md = _build_markdown(interview, questions)
    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>面试报告</title>
    <style>
        body {{ font-family: 'Microsoft YaHei', sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; line-height: 1.6; }}
        table {{ border-collapse: collapse; width: 100%; margin: 10px 0; }}
        th, td {{ border: 1px solid #ddd; padding: 8px; text-align: left; }}
        th {{ background-color: #f5f5f5; }}
        h1 {{ color: #1a1a1a; }}
        h2 {{ color: #333; border-bottom: 2px solid #eee; padding-bottom: 5px; }}
        h3 {{ color: #555; }}
    </style>
</head>
<body>
{markdown.markdown(md, extensions=['extra'])}
</body>
</html>"""
    return html


def _build_pdf(interview: Interview, questions: list[InterviewQuestion]) -> bytes:
    """生成 PDF 格式报告"""
    html = _build_html(interview, questions)
    try:
        from weasyprint import HTML
        return HTML(string=html).write_pdf()
    except Exception:
        # Fallback: return HTML as bytes if weasyprint fails
        return html.encode('utf-8')


def _build_context(interview: Interview, questions: list[InterviewQuestion]) -> dict:
    """构建模板上下文"""
    scores = interview.dimension_scores or {}
    overview_data = {}

    # Parse AI overview for learning plan
    try:
        import json
        # ai_overview may contain a JSON with strengths/weaknesses/learning_plan
        if interview.ai_overview:
            # Try to extract structured data
            overview_data = {"gap_analysis": interview.ai_overview}
    except Exception:
        overview_data = {"gap_analysis": interview.ai_overview or "暂无分析"}

    q_list = []
    for q in sorted(questions, key=lambda x: x.order_index):
        score_detail = q.score_detail or {}
        q_list.append({
            "index": q.order_index,
            "question_type_label": QUESTION_TYPE_LABELS.get(q.question_type, q.question_type),
            "question_text": q.question_text,
            "answer": q.user_answer_transcript or "（未回答）",
            "content_score": score_detail.get("content_completeness", "-"),
            "professional_score": score_detail.get("professionalism", "-"),
            "expression_score": score_detail.get("expression", "-"),
            "star_score": score_detail.get("star_method", "-"),
            "total_score": q.ai_score or "-",
            "evaluation": q.ai_evaluation or "暂无评语",
            "reference_answer": q.reference_answer or "暂无参考答案",
            "improvement": q.improvement_suggestion or "暂无建议",
        })

    return {
        "position": "面试岗位",
        "interview_time": interview.started_at.isoformat() if interview.started_at else "N/A",
        "total_score": interview.total_score or "-",
        "difficulty": interview.difficulty,
        "content_score": scores.get("content_completeness", "-"),
        "professional_score": scores.get("professionalism", "-"),
        "expression_score": scores.get("expression", "-"),
        "star_score": scores.get("star_method", "-"),
        "gap_analysis": overview_data.get("gap_analysis", ""),
        "questions": q_list,
        "short_term": overview_data.get("short_term", []),
        "medium_term": overview_data.get("medium_term", []),
        "long_term": overview_data.get("long_term", []),
        "resume_suggestions": interview.resume_suggestions or "暂无建议",
        "generated_at": datetime.now().isoformat(),
    }


async def generate_document(
    db: AsyncSession,
    interview_id: uuid.UUID,
    doc_format: str,
    storage_dir: str,
) -> str:
    """生成文档并保存到本地文件"""
    result = await db.execute(select(Interview).where(Interview.id == interview_id))
    interview = result.scalar_one_or_none()
    if not interview:
        raise ValueError("Interview not found")

    q_result = await db.execute(
        select(InterviewQuestion).where(InterviewQuestion.interview_id == interview_id)
        .order_by(InterviewQuestion.order_index)
    )
    questions = q_result.scalars().all()

    if doc_format == "md":
        content = _build_markdown(interview, questions)
    elif doc_format == "html":
        content = _build_html(interview, questions)
    elif doc_format == "pdf":
        content = _build_pdf(interview, questions)
    else:
        raise ValueError(f"Unsupported format: {doc_format}")

    # 保存文件
    user_dir = Path(storage_dir) / str(interview.user_id) / "reports"
    user_dir.mkdir(parents=True, exist_ok=True)
    ext = "pdf" if doc_format == "pdf" else doc_format
    filename = f"{interview_id}.{ext}"
    filepath = user_dir / filename

    mode = "wb" if doc_format == "pdf" else "w"
    encoding = None if doc_format == "pdf" else "utf-8"
    with open(filepath, mode, encoding=encoding) as f:
        f.write(content)

    # 创建文档记录
    doc_record = InterviewDocument(
        interview_id=interview_id,
        format=doc_format,
        file_path=str(filepath),
        file_size=os.path.getsize(filepath),
    )
    db.add(doc_record)
    await db.commit()

    return str(filepath)
