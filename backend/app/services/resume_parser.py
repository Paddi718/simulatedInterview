import os
import uuid
from pathlib import Path
from typing import Optional
import fitz  # PyMuPDF
import docx
from app.config import get_settings

settings = get_settings()

ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.txt'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def validate_file(filename: str, file_size: int) -> None:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")
    if file_size > MAX_FILE_SIZE:
        raise ValueError(f"File too large. Max: {MAX_FILE_SIZE // 1024 // 1024}MB")


def extract_text_from_pdf(filepath: str) -> str:
    doc = fitz.open(filepath)
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()
    return text


def extract_text_from_docx(filepath: str) -> str:
    doc = docx.Document(filepath)
    return "\n".join([p.text for p in doc.paragraphs if p.text])


def extract_text(filepath: str, ext: str) -> str:
    if ext == '.pdf':
        return extract_text_from_pdf(filepath)
    elif ext == '.docx':
        return extract_text_from_docx(filepath)
    elif ext == '.txt':
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    return ""


def save_upload_file(file_content: bytes, user_id: uuid.UUID, filename: str) -> str:
    user_dir = Path(settings.resume_storage_path) / str(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)
    filepath = user_dir / f"{uuid.uuid4()}_{filename}"
    with open(filepath, 'wb') as f:
        f.write(file_content)
    return str(filepath)


def build_llm_parse_prompt(text: str) -> str:
    return f"""请从以下简历文本中提取结构化信息，输出 JSON 格式，包含以下字段：
- basic: {{name, education: [school, degree, major, period]}}
- experience: [company, role, period, description, tech_stack[], highlights[]]
- projects: [name, description, role, highlights[]]
- skills: string[]
- certifications: string[]
- self_evaluation: string

简历文本：
{text[:15000]}

请只输出 JSON，不要其他内容。"""
