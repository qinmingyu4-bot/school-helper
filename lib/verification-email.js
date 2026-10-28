function verificationEmail({ code, purpose, minutes }) {
  if (!/^\d{6}$/.test(String(code)) || !Number.isFinite(minutes) || minutes <= 0 || minutes > 60) throw new Error('Invalid verification email');
  const reset = purpose === 'password-reset';
  const title = reset ? '重置你的密码' : '验证你的邮箱';
  const action = reset ? '重置密码' : '注册账号';
  const subject = `StudyBridge · ${reset ? '重置密码' : '注册邮箱'}验证码`;
  const text = `StudyBridge\n\n${title}\n\n你的验证码：${code}\n\n请在 ${minutes} 分钟内回到 StudyBridge 输入此验证码，完成${action}。验证码仅可使用一次，请勿转发或告诉他人。\n\n如果你没有请求${action}，请忽略此邮件。\nhttps://studybridge.ink\n连接学习的每一步。`;
  const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${subject}</title></head>
<body style="margin:0;padding:0;background:#f4f4f4;color:#242424;font-family:Arial,'PingFang SC','Microsoft YaHei',sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all;">完成${action}的下一步，验证码 ${minutes} 分钟内有效。</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;"><tr><td align="center" style="padding:32px 16px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e2e2;">
<tr><td style="padding:32px 28px;border-bottom:1px solid #ededed;"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td width="40" height="40" align="center" bgcolor="#252525" style="color:#ffffff;font-size:16px;font-weight:700;border-radius:8px;">SB</td><td style="padding-left:12px;font-size:23px;letter-spacing:-0.8px;font-weight:700;">StudyBridge<span style="color:#8b8b8b;">.</span></td></tr></table></td></tr>
<tr><td align="center" style="padding:40px 24px 28px;"><p style="margin:0 0 12px;color:#808080;font-size:11px;letter-spacing:2px;">ACCOUNT VERIFICATION</p><h1 style="margin:0;font-size:28px;line-height:1.4;font-weight:600;">${title}</h1><p style="margin:16px 0 0;font-size:14px;line-height:1.8;color:#666666;">请回到 StudyBridge 输入下方验证码，完成${action}。</p></td></tr>
<tr><td style="padding:0 24px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f6f6;border:1px solid #ebebeb;"><tr><td align="center" style="padding:28px 12px 12px;color:#777777;font-size:13px;">你的验证码</td></tr><tr><td align="center" dir="ltr" style="padding:8px 0 16px 8px;font-family:'Courier New',monospace;font-size:38px;font-weight:700;line-height:1.4;letter-spacing:8px;color:#222222;white-space:nowrap;">${code}</td></tr><tr><td align="center" style="padding:0 12px 28px;font-size:13px;line-height:1.6;color:#737373;">${minutes} 分钟内有效 · 仅可使用一次</td></tr></table></td></tr>
<tr><td style="padding:28px 28px 36px;"><p style="margin:0;font-size:13px;line-height:1.9;color:#777777;">为了保护账号，请勿转发此邮件或将验证码告诉他人。</p><p style="margin:12px 0 0;font-size:13px;line-height:1.9;color:#777777;">如果你没有请求${action}，请忽略此邮件。</p></td></tr>
<tr><td align="center" style="padding:24px;border-top:1px solid #ededed;background:#fafafa;"><a href="https://studybridge.ink" style="font-size:13px;font-weight:700;color:#454545;text-decoration:none;">StudyBridge</a><p style="margin:8px 0 0;color:#999999;font-size:12px;line-height:1.6;">连接学习的每一步。</p><p style="margin:12px 0 0;color:#aaaaaa;font-size:11px;line-height:1.6;">此邮件由系统自动发送，请勿直接回复。</p></td></tr>
</table></td></tr></table></body></html>`;
  return { subject, text, html };
}
module.exports = { verificationEmail };
