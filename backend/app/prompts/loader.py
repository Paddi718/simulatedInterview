"""
提示词加载器：从 YAML 文件加载模板，通过 Jinja2 渲染注入变量。
用法:
    from app.prompts.loader import load_prompt
    system, user_msg, temperature = load_prompt("score_question_answered", **vars)
"""
import json
from pathlib import Path
from typing import Optional
import yaml
from jinja2 import Template

_PROMPTS_DIR = Path(__file__).parent
_PROMPTS_FILE = _PROMPTS_DIR / "prompts.yaml"

# 缓存加载的 YAML
_cache: Optional[dict] = None


def _load_yaml() -> dict:
    global _cache
    if _cache is not None:
        return _cache
    with open(_PROMPTS_FILE, "r", encoding="utf-8") as f:
        _cache = yaml.safe_load(f)
    return _cache


def load_prompt(name: str, **variables) -> tuple[str, str, float]:
    """
    加载提示词并渲染变量。

    Args:
        name: 提示词名称（对应 YAML 中 prompts 下的 key）
        **variables: 要注入模板的变量
            - 约定：以 _json 结尾的变量名会自动 json.dumps(ensure_ascii=False)
            - 示例：resume_data_json → json.dumps 后的字符串

    Returns:
        (system_message, user_message, temperature)
    """
    data = _load_yaml()
    prompt_config = data["prompts"].get(name)
    if not prompt_config:
        raise ValueError(f"Prompt '{name}' not found in prompts.yaml")

    # 获取系统消息
    system_key = prompt_config.get("system", "default")
    system_msg = data["system"].get(system_key, data["system"]["default"])

    # 获取模板和温度
    template_str = prompt_config["template"]
    temperature = prompt_config.get("temperature", 0.7)

    # 自动处理 _json 后缀的变量：把 Python dict/list 转为 JSON 字符串
    rendered_vars = {}
    for k, v in variables.items():
        if k.endswith("_json") and isinstance(v, (dict, list)):
            rendered_vars[k] = json.dumps(v, ensure_ascii=False, indent=2)
        elif k.endswith("_json") and isinstance(v, str):
            rendered_vars[k] = v  # 已经是字符串
        else:
            rendered_vars[k] = v

    # Jinja2 渲染
    template = Template(template_str)
    user_msg = template.render(**rendered_vars)

    return system_msg, user_msg, temperature
