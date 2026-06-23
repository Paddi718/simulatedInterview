import smtplib
import random
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import get_settings

settings = get_settings()


def _generate_code() -> str:
    return str(random.randint(100000, 999999))


async def send_verification_email(to_email: str) -> str | None:
    """发送验证邮件，返回验证码；失败返回 None"""
    code = _generate_code()

    subject = "模拟面试 - 邮箱验证码"
    body = f"""您好，

欢迎注册 AI 模拟面试！

您的验证码是：{code}

验证码 10 分钟内有效，请勿转发给他人。

如果这不是您的操作，请忽略此邮件。

---
AI 模拟面试 (moniiv.cloud)
"""

    msg = MIMEMultipart()
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = to_email
    msg["Subject"] = subject
    msg.attach(MIMEText(body, "plain", "utf-8"))

    try:
        server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15)
        server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(msg["From"], [to_email], msg.as_string())
        server.quit()
        return code
    except Exception as e:
        print(f"[Email] Failed to send: {e}")
        return None
