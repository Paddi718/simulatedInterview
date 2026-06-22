"""
面试评分编排器 — 管理完整的评分生命周期

状态机：
  pending → scoring_questions → aggregating → generating_overview → done
                                                                   → failed

架构：
  - 使用 asyncio.create_task 在事件循环中运行（非线程，避免 Windows 兼容问题）
  - 每个阶段写入 scoring_status + scoring_progress 到 DB
  - 通过 asyncio.Event 通知 SSE 监听者
  - 所有路径都有 finally 保底（确保 SSE event 一定会被触发）
"""
import asyncio
import json
import uuid
import traceback
from datetime import datetime, timezone
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session_factory
from app.models.interview import Interview
from app.models.interview_question import InterviewQuestion
from app.models.resume import Resume
from app.models.job_description import JobDescription


# 全局 SSE 事件注册表
_sse_events: dict[str, asyncio.Event] = {}


def get_sse_event(interview_id: str) -> asyncio.Event:
    """获取或创建 SSE 事件"""
    if interview_id not in _sse_events:
        _sse_events[interview_id] = asyncio.Event()
    return _sse_events[interview_id]


def cleanup_sse_event(interview_id: str):
    """清理 SSE 事件"""
    _sse_events.pop(interview_id, None)


async def _update_status(db: AsyncSession, interview_id: uuid.UUID, status: str, **extra):
    """更新面试的评分状态和进度"""
    result = await db.execute(select(Interview).where(Interview.id == interview_id))
    interview = result.scalar_one_or_none()
    if interview:
        interview.scoring_status = status
        for key, value in extra.items():
            if hasattr(interview, key):
                setattr(interview, key, value)
        await db.commit()


async def run_scoring_pipeline(interview_id: uuid.UUID):
    """
    执行完整的评分流水线（在后台 asyncio task 中运行）。

    流程：
    1. 并行评分所有未评分题目
    2. 算术聚合总分 + 维度分 → 立即写入 DB
    3. LLM 生成总评 + 简历建议

    每个阶段都更新 scoring_status，前端可轮询获取进度。
    """
    event = get_sse_event(str(interview_id))
    overview_generated = False

    try:
        async with async_session_factory() as db:
            # ── 加载数据 ──
            i_result = await db.execute(select(Interview).where(Interview.id == interview_id))
            interview = i_result.scalar_one_or_none()
            if not interview:
                print(f"[Orchestrator] Interview {interview_id} not found")
                return

            q_result = await db.execute(
                select(InterviewQuestion)
                .where(InterviewQuestion.interview_id == interview_id)
                .order_by(InterviewQuestion.order_index)
            )
            questions = q_result.scalars().all()

            r_result = await db.execute(select(Resume).where(Resume.id == interview.resume_id))
            resume = r_result.scalar_one_or_none()
            resume_data = resume.parsed_data if resume else {}

            j_result = await db.execute(select(JobDescription).where(JobDescription.id == interview.jd_id))
            jd = j_result.scalar_one_or_none()
            jd_data = jd.parsed_data if jd else {}

            # 查找用户 LLM 配置（优先使用用户配置，fallback 到全局 .env）
            from app.models.user import User
            from app.services.llm_client import extract_llm_config
            u_result = await db.execute(select(User).where(User.id == interview.user_id))
            user_db = u_result.scalar_one_or_none()
            llm_key, llm_base, llm_llm_model = extract_llm_config(user_db.llm_config if user_db else None)

            total_q = len(questions)
            print(f"[Orchestrator] Starting scoring for interview {interview_id}, {total_q} questions")

            # ═══════════════════════════════════════════
            # Phase 1: 并行评分所有未评分题目
            # ═══════════════════════════════════════════
            await _update_status(db, interview_id, "scoring_questions",
                                 scoring_progress=f"0/{total_q}")

            from app.services.scoring_service import score_question

            async def _score_one(question: InterviewQuestion):
                if question.ai_score is not None:
                    return question, None  # 已评分，跳过
                try:
                    scores = await score_question(question, resume_data, jd_data,
                        api_key=llm_key, api_base=llm_base, model=llm_llm_model)
                    return question, scores
                except Exception as e:
                    print(f"[Orchestrator] Q{question.order_index} scoring failed: {e}")
                    return question, {"_error": str(e)[:200]}

            # 并发评分（每 2 题更新一次进度）
            scored_count = 0
            tasks = []
            for q in questions:
                tasks.append(asyncio.create_task(_score_one(q)))

            # 等待所有评分完成，同时更新进度
            results = []
            for i, task in enumerate(asyncio.as_completed(tasks)):
                result_pair = await task
                results.append(result_pair)
                scored_count += 1
                if scored_count % 2 == 0 or scored_count == total_q:
                    try:
                        await _update_status(db, interview_id, "scoring_questions",
                                             scoring_progress=f"{scored_count}/{total_q}")
                    except Exception:
                        pass  # 进度更新失败不阻塞流程

            # 保证 results 的顺序与 questions 一致（as_completed 打乱了顺序）
            # 重新按 question 匹配
            scored_map = {}
            for q, scores in results:
                scored_map[q.order_index] = scores

            # 串行写入评分结果到 DB
            for question in questions:
                scores = scored_map.get(question.order_index)
                if scores is None:
                    continue  # 已评分，跳过
                if "_error" in scores:
                    question.ai_score = 0
                    question.score_detail = {
                        "content_completeness": 0, "professionalism": 0,
                        "expression": 0, "star_method": 0,
                    }
                    question.ai_evaluation = f"评分失败: {scores['_error']}"
                else:
                    question.ai_score = scores.get("total_score", 0)
                    question.score_detail = {
                        k: v for k, v in scores.items()
                        if k in ["content_completeness", "professionalism",
                                 "expression", "star_method"]
                    }
                    question.ai_evaluation = scores.get("evaluation", "")
                    question.reference_answer = scores.get("reference_answer", "")
                    question.improvement_suggestion = scores.get("improvement_suggestion", "")

            print(f"[Orchestrator] Phase 1 done: {scored_count}/{total_q} questions scored")

            # ═══════════════════════════════════════════
            # Phase 2: 算术聚合 → 立即写入 DB
            # ═══════════════════════════════════════════
            await _update_status(db, interview_id, "aggregating")

            from app.services.scoring_service import _compute_aggregate_scores
            agg = _compute_aggregate_scores(questions)
            interview.total_score = agg["total_score"]
            interview.dimension_scores = agg["dimension_scores"]
            await db.commit()
            print(f"[Orchestrator] Phase 2 done: total_score={agg['total_score']}")

            # Phase 2b: 同步评分结果到收藏表（无条件同步，user_answer_transcript 可能是空字符串）
            from app.routers.interview import _sync_favorite_scores
            for question in questions:
                if question.ai_score is not None:
                    await _sync_favorite_scores(question.question_text, interview.user_id)

            # ═══════════════════════════════════════════
            # Phase 3: LLM 生成总评 + 简历建议
            # ═══════════════════════════════════════════
            await _update_status(db, interview_id, "generating_overview")

            try:
                from app.services.scoring_service import generate_interview_overview
                overview = await asyncio.wait_for(
                    generate_interview_overview(interview, questions, resume_data, jd_data,
                        api_key=llm_key, api_base=llm_base, model=llm_llm_model),
                    timeout=60.0
                )
                interview.ai_overview = overview.get("overview", "")
                interview.resume_suggestions = overview.get("resume_suggestions", "")
                interview.scoring_status = "done"
                overview_generated = True
                print(f"[Orchestrator] Phase 3 done: overview generated")
            except asyncio.TimeoutError:
                print(f"[Orchestrator] Phase 3 timeout: overview generation took >60s")
                interview.ai_overview = "总评生成超时，请点击「重新生成」按钮重试。"
                interview.scoring_status = "done"  # 评分已完成，只有总评超时
            except Exception as e:
                print(f"[Orchestrator] Phase 3 failed: {e}")
                traceback.print_exc()
                interview.ai_overview = f"总评生成失败，请稍后重试。"
                interview.scoring_status = "done"  # 仍然是 done，前端可显示分数+重试按钮

            await db.commit()
            print(f"[Orchestrator] Scoring pipeline completed for interview {interview_id}")

    except Exception as e:
        print(f"[Orchestrator] FATAL: {e}")
        traceback.print_exc()
        # 尝试写入错误状态
        try:
            async with async_session_factory() as db:
                await _update_status(db, interview_id, "failed",
                                     scoring_error=str(e)[:500])
        except Exception:
            pass

    finally:
        # 始终触发 SSE 事件（无论成功、失败还是被取消）
        event.set()
        try:
            await asyncio.sleep(2)
        except asyncio.CancelledError:
            pass  # 任务被取消时不要阻止清理
        cleanup_sse_event(str(interview_id))
