# 模拟面试报告

## 面试概览

| 项目 | 内容 |
|------|------|
| 面试岗位 | {{ position }} |
| 面试时间 | {{ interview_time }} |
| 总体评分 | **{{ total_score }} 分 / 100** |
| 难度级别 | {{ difficulty }} |

### 各维度评分

| 维度 | 分数 |
|------|------|
| 内容完整性 | {{ content_score }} |
| 专业度 | {{ professional_score }} |
| 表达能力 | {{ expression_score }} |
| STAR 法则 | {{ star_score }} |

## 能力差距分析

{{ gap_analysis }}

## 逐题评分详情
{% for q in questions %}
### 第 {{ q.index }} 题：{{ q.question_type_label }}

**题目：** {{ q.question_text }}

**你的回答：** {{ q.answer }}

| 维度 | 分数 |
|------|------|
| 内容完整性 | {{ q.content_score }} |
| 专业度 | {{ q.professional_score }} |
| 表达能力 | {{ q.expression_score }} |
| STAR 法则 | {{ q.star_score }} |
| **总分** | **{{ q.total_score }}** |

**AI 评语：** {{ q.evaluation }}

**参考答案：** {{ q.reference_answer }}

**改进建议：** {{ q.improvement }}

{% endfor %}

## 综合提升计划

### 短期（1-3天）
{% for item in short_term %}
1. {{ item }}
{% endfor %}

### 中期（1-2周）
{% for item in medium_term %}
1. {{ item }}
{% endfor %}

### 长期
{% for item in long_term %}
1. {{ item }}
{% endfor %}

## 简历优化建议

{{ resume_suggestions }}

*由 AI 模拟面试系统生成 | {{ generated_at }}*
