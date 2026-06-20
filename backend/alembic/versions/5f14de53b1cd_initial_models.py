"""initial models

Revision ID: 5f14de53b1cd
Revises:
Create Date: 2026-06-20 23:57:03.106069

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB

# revision identifiers, used by Alembic.
revision: str = '5f14de53b1cd'
down_revision: Union[str, Sequence[str], None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Create all initial tables."""
    # === users ===
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("username", sa.String(50), unique=True, nullable=False, index=True),
        sa.Column("password_hash", sa.String(255), nullable=False),
        sa.Column("email", sa.String(255), nullable=True),
        sa.Column("tts_preference", JSONB, nullable=True, server_default=None),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # === resumes ===
    op.create_table(
        "resumes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("original_filename", sa.String(255), nullable=False),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("file_type", sa.String(10), nullable=False),
        sa.Column("parsed_data", JSONB, nullable=True, server_default=None),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # === job_descriptions ===
    op.create_table(
        "job_descriptions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("raw_text", sa.Text(), nullable=False),
        sa.Column("parsed_data", JSONB, nullable=True, server_default=None),
        sa.Column("source", sa.String(20), server_default=sa.text("'paste'"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # === interviews ===
    op.create_table(
        "interviews",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("resume_id", UUID(as_uuid=True), sa.ForeignKey("resumes.id"), nullable=True),
        sa.Column("jd_id", UUID(as_uuid=True), sa.ForeignKey("job_descriptions.id"), nullable=True),
        sa.Column("difficulty", sa.String(10), server_default=sa.text("'mid'"), nullable=False),
        sa.Column("total_score", sa.Integer(), nullable=True),
        sa.Column("dimension_scores", JSONB, nullable=True, server_default=None),
        sa.Column("status", sa.String(20), server_default=sa.text("'preparing'"), nullable=False),
        sa.Column("ai_overview", sa.Text(), nullable=True),
        sa.Column("resume_suggestions", sa.Text(), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # === interview_questions ===
    op.create_table(
        "interview_questions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("interview_id", UUID(as_uuid=True), sa.ForeignKey("interviews.id"), nullable=False),
        sa.Column("question_text", sa.Text(), nullable=False),
        sa.Column("question_type", sa.String(20), nullable=False),
        sa.Column("user_audio_path", sa.Text(), nullable=True),
        sa.Column("user_answer_transcript", sa.Text(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("ai_score", sa.Integer(), nullable=True),
        sa.Column("score_detail", JSONB, nullable=True, server_default=None),
        sa.Column("ai_evaluation", sa.Text(), nullable=True),
        sa.Column("reference_answer", sa.Text(), nullable=True),
        sa.Column("improvement_suggestion", sa.Text(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False),
    )

    # === interview_documents ===
    op.create_table(
        "interview_documents",
        sa.Column("id", UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("interview_id", UUID(as_uuid=True), sa.ForeignKey("interviews.id"), nullable=False),
        sa.Column("format", sa.String(10), nullable=False),
        sa.Column("file_path", sa.Text(), nullable=False),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("generated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade() -> None:
    """Drop all tables in reverse dependency order."""
    op.drop_table("interview_documents")
    op.drop_table("interview_questions")
    op.drop_table("interviews")
    op.drop_table("job_descriptions")
    op.drop_table("resumes")
    op.drop_table("users")
