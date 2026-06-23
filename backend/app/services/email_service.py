import smtplib
import random
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import get_settings

settings = get_settings()


def _generate_code() -> str:
    return str(random.randint(100000, 999999))


def _build_verification_email_html(code: str, scenario: str = "register") -> str:
    """Build a responsive HTML email for verification codes.

    scenario: "register" (default) or "reset"
    """
    title = "邮箱验证" if scenario == "register" else "重置密码"
    greeting = (
        "欢迎注册 AI 模拟面试！"
        if scenario == "register"
        else "您正在申请重置 AI 模拟面试账号的密码。"
    )
    action_text = "完成注册" if scenario == "register" else "继续重置密码"
    note_subject = "注册" if scenario == "register" else "重置"

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <title>{title}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'PingFang SC','Microsoft YaHei','Helvetica Neue',Arial,sans-serif;-webkit-font-smoothing:antialiased;">
  <!-- Preheader text (visible in email preview, hidden in body) -->
  <div style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">
    您的验证码为 {code}，10 分钟内有效
  </div>

  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f4f5;">
    <tr>
      <td align="center" style="padding:32px 16px;">

        <!-- Outer container -->
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">

          <!-- ===== HEADER ===== -->
          <tr>
            <td align="center" style="padding:28px 24px 20px;background:linear-gradient(135deg,#6366F1,#4F46E5);border-radius:16px 16px 0 0;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td align="center">
                    <!-- Logo area -->
                    <div style="display:inline-block;width:48px;height:48px;line-height:48px;border-radius:12px;background:rgba(255,255,255,0.15);font-size:24px;margin-bottom:12px;">&#x1f3a4;</div>
                    <h1 style="margin:0;font-size:20px;font-weight:700;color:#ffffff;letter-spacing:0.3px;">AI 模拟面试</h1>
                    <p style="margin:4px 0 0;font-size:13px;color:rgba(255,255,255,0.7);">智能语音面试 &middot; AI 即时评分 &middot; 专业报告导出</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ===== BODY ===== -->
          <tr>
            <td style="background:#ffffff;padding:32px 32px 24px;border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;">
              <table cellpadding="0" cellspacing="0" border="0" width="100%">
                <tr>
                  <td style="font-size:15px;color:#374151;line-height:1.7;">
                    <h2 style="margin:0 0 6px;font-size:18px;font-weight:600;color:#111827;">{title}</h2>
                    <p style="margin:0 0 20px;font-size:15px;color:#6b7280;">{greeting}</p>

                    <p style="margin:0 0 14px;font-size:14px;color:#374151;font-weight:500;">您的邮箱验证码为：</p>

                    <!-- Verification code block -->
                    <table cellpadding="0" cellspacing="0" border="0" width="100%">
                      <tr>
                        <td align="center" style="background:#eef2ff;border-radius:12px;padding:24px 16px;border:1px solid #e0e7ff;">
                          <span style="font-size:32px;font-weight:700;letter-spacing:10px;color:#6366F1;font-family:'JetBrains Mono','Menlo','Courier New',monospace;">{code}</span>
                        </td>
                      </tr>
                    </table>

                    <!-- Validity & security notices -->
                    <table cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:20px;">
                      <tr>
                        <td style="font-size:14px;color:#6b7280;line-height:1.7;">
                          <p style="margin:0 0 6px;">
                            验证码 <strong style="color:#374151;">10 分钟</strong> 内有效，请尽快{action_text}。
                          </p>
                          <p style="margin:0;color:#9ca3af;font-size:13px;">
                            切勿将验证码告知他人，谨防诈骗。
                          </p>
                        </td>
                      </tr>
                    </table>

                    <hr style="border:none;border-top:1px solid #e5e7eb;margin:22px 0 16px;">

                    <p style="margin:0;font-size:13px;color:#9ca3af;line-height:1.6;">
                      &#x26a0;&#xfe0f; 如果这不是您的{note_subject}操作，请忽略此邮件。<br>
                      如您有任何疑问，请通过官方渠道联系我们。
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- ===== FOOTER ===== -->
          <tr>
            <td align="center" style="background:#f9fafb;padding:16px 24px;border-radius:0 0 16px 16px;border:1px solid #e5e7eb;border-top:none;font-size:12px;color:#9ca3af;line-height:1.6;">
              AI 模拟面试 &copy; {datetime.now().year} &nbsp;&middot;&nbsp; moniiv.cloud<br>
              <span style="color:#d1d5db;">此邮件由系统自动发送，请勿回复。</span>
            </td>
          </tr>
        </table>

        <!-- Unbranded spacer below card -->
        <table width="560" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;width:100%;">
          <tr>
            <td align="center" style="padding:16px 0 0;font-size:11px;color:#a1a1aa;">
              如无法正常显示，请尝试在浏览器中打开此邮件
            </td>
          </tr>
        </table>

      </td>
    </tr>
  </table>
</body>
</html>"""


async def send_verification_email(to_email: str, scenario: str = "register") -> str | None:
    """发送验证邮件，返回验证码；失败返回 None。

    Parameters
    ----------
    to_email : str
        收件人邮箱
    scenario : str
        "register" 注册验证 / "reset" 密码重置

    Returns
    -------
    str | None
        6 位验证码，发送失败返回 None
    """
    code = _generate_code()
    subject = "重置密码 - 验证码" if scenario == "reset" else "邮箱验证 - 验证码"

    html_body = _build_verification_email_html(code, scenario)

    msg = MIMEMultipart("alternative")
    msg["From"] = settings.smtp_from or settings.smtp_user
    msg["To"] = to_email
    msg["Subject"] = f"AI 模拟面试 - {subject}"

    # Plain-text fallback
    plain_body = (
        f"您好，\n\n"
        f"您的验证码是：{code}\n\n"
        f"验证码 10 分钟内有效，请勿转发给他人。\n\n"
        f"如果这不是您的操作，请忽略此邮件。\n\n"
        f"--\nAI 模拟面试 (moniiv.cloud)"
    )
    msg.attach(MIMEText(plain_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    try:
        server = smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=15)
        server.login(settings.smtp_user, settings.smtp_password)
        server.sendmail(msg["From"], [to_email], msg.as_string())
        server.quit()
        return code
    except Exception as e:
        print(f"[Email] Failed to send: {e}")
        return None
