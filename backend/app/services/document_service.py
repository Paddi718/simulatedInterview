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
from app.models.job_description import JobDescription

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
    """生成 PDF 格式报告
    优先用 weasyprint，失败则返回 HTML（浏览器可直接打开 .html 文件）
    """
    html = _build_html(interview, questions)

    # 检测 fontconfig（weasyprint 依赖）
    import shutil
    if not shutil.which('fc-list'):
        # 无 fontconfig → 直接返回 HTML，避免卡死
        return html.encode('utf-8')

    try:
        from weasyprint import HTML
    except Exception:
        return html.encode('utf-8')

    def _render():
        return HTML(string=html).write_pdf()

    try:
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(_render)
            return future.result(timeout=15)
    except Exception:
        return html.encode('utf-8')


def _build_docx(interview: Interview, questions: list[InterviewQuestion]) -> bytes:
    """生成 Word (.docx) 格式报告 — python-docx，纯 Python 不依赖外部工具"""
    from docx import Document
    from docx.shared import Inches, Pt, RGBColor
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    import io

    doc = Document()
    scores = interview.dimension_scores or {}

    # 标题
    title = doc.add_heading('模拟面试报告', 0)
    title.alignment = WD_ALIGN_PARAGRAPH.CENTER

    # 概览
    doc.add_heading('面试概览', 1)
    table = doc.add_table(rows=5, cols=2, style='Light Grid Accent 1')
    for row, (k, v) in zip(table.rows, [
        ('总体评分', f"{interview.total_score or '-'} 分 / 100"),
        ('难度级别', interview.difficulty),
        ('面试时间', interview.started_at.isoformat() if interview.started_at else 'N/A'),
        ('内容完整性', scores.get('content_completeness', '-')),
        ('专业度', scores.get('professionalism', '-')),
    ]):
        row.cells[0].text = k
        row.cells[1].text = str(v)

    # 能力分析
    if interview.ai_overview:
        doc.add_heading('综合评价', 1)
        doc.add_paragraph(interview.ai_overview)

    # 逐题详情
    doc.add_heading('逐题详情', 1)
    for q in sorted(questions, key=lambda x: x.order_index):
        sd = q.score_detail or {}
        doc.add_heading(f"第{q.order_index}题：{q.question_text[:50]}", 2)
        doc.add_paragraph(f"你的回答：{q.user_answer_transcript or '（未作答）'}")
        if q.ai_score is not None:
            doc.add_paragraph(f"评分：{q.ai_score} 分")
        if q.ai_evaluation:
            doc.add_paragraph(f"评语：{q.ai_evaluation}")
        doc.add_paragraph(f"参考答案：{q.reference_answer or '暂无'}")
        if q.improvement_suggestion:
            doc.add_paragraph(f"改进建议：{q.improvement_suggestion}")

    # 简历建议
    if interview.resume_suggestions:
        doc.add_heading('简历优化建议', 1)
        doc.add_paragraph(interview.resume_suggestions)

    doc.add_paragraph('')
    doc.add_paragraph('由 AI 模拟面试系统生成').alignment = WD_ALIGN_PARAGRAPH.RIGHT

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


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

    # 获取简历和JD信息用于生成文件名
    candidate_name = ""
    job_position = ""
    try:
        r_result = await db.execute(select(Resume).where(Resume.id == interview.resume_id))
        resume = r_result.scalar_one_or_none()
        if resume and resume.parsed_data:
            candidate_name = (resume.parsed_data.get("basic") or {}).get("name", "") or ""
        j_result = await db.execute(select(JobDescription).where(JobDescription.id == interview.jd_id))
        jd = j_result.scalar_one_or_none()
        if jd and jd.parsed_data:
            job_position = (jd.parsed_data.get("position") or "").strip()
    except Exception:
        pass

    # Build professional filename: 模拟面试_姓名_岗位_日期.ext
    import re
    date_str = datetime.now().strftime("%Y%m%d")
    name_part = candidate_name or "候选人"
    position_part = job_position or "面试岗位"
    # Sanitize: remove special chars, replace spaces
    for part in [name_part, position_part]:
        part = re.sub(r'[\\/:*?"<>|]', '', part).strip()
    safe_name = re.sub(r'\s+', '', name_part) if name_part else "候选人"
    safe_position = re.sub(r'\s+', '', position_part) if position_part else "面试"
    ext = doc_format
    filename = f"模拟面试_{safe_name}_{safe_position}_{date_str}.{ext}"

    if doc_format == "md":
        content = _build_markdown(interview, questions)
    elif doc_format == "html":
        content = _build_html(interview, questions)
    elif doc_format == "pdf":
        content = _build_pdf(interview, questions)
    elif doc_format == "docx":
        content = _build_docx(interview, questions)
    else:
        raise ValueError(f"Unsupported format: {doc_format}")

    # 保存文件
    user_dir = Path(storage_dir) / str(interview.user_id) / "reports"
    user_dir.mkdir(parents=True, exist_ok=True)
    filepath = user_dir / filename

    binary_formats = ("pdf", "docx")
    mode = "wb" if doc_format in binary_formats else "w"
    encoding = None if doc_format in binary_formats else "utf-8"
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
