# 注册邮箱验证码与 AWS SES

本次接入使用现有 SMTP 发信接口。先在服务器私有配置中填写 `SMTP_HOST`、
`SMTP_PORT`、`SMTP_SECURE`、`SMTP_USER`、`SMTP_PASS` 和 `MAIL_FROM`，完成服务商要求的
发件人/域名验证，再设置 `REQUIRE_EMAIL_VERIFICATION=true`、
`EMAIL_CODE_TTL_MINUTES=15`、`ALLOW_EMAIL_CODE_FALLBACK=false`。
465 端口使用 `SMTP_SECURE=true`；587 端口使用 `false` 并由 STARTTLS 加密。
域名接入本身不会自动建立发信服务。不要提交 SMTP 凭据或服务器 `.env`。

启用前备份私有配置并检查开发者端邮箱状态，再真实测试收件箱/垃圾邮件、
60 秒重发、错误与过期验证码、修改邮箱后重新取码、邀请码注册和旧账号登录。
正式环境禁止网页临时验证码；发信失败会阻止需要验证码的新注册。
现有账号登录与人工重置申请继续保留，Google 注册沿用已验证邮箱和邀请码。
若现有配置显式关闭了邮箱验证，需在发信服务验证成功后主动启用。
本分支只准备代码；仍需用户授权发布并执行既有备份/回退部署流程。


## AWS SES 接入状态与发布

加拿大中部 `ca-central-1` 已获正式发信权限；域名 DKIM 已验证。专用 SMTP 用户
仅允许 `ses:SendRawEmail`，资源限定为 `studybridge.ink` 身份及其默认配置集
`my-first-configuration-set`，发件地址限定为 `noreply@studybridge.ink`。
真实测试邮件已进入站点所有者 Gmail 收件箱，SPF、DKIM 均通过。

网站配置使用 `email-smtp.ca-central-1.amazonaws.com:465` 和 TLS。凭据保存到
仓库 Actions 的加密 secret `SMTP_CONFIG_JSON`，内容为含 `username`、`password`
的 JSON；不可写进源文件、工作流正文、日志或普通仓库变量。
部署会通过加密 SSH 标准输入交给 `aws/configure-smtp-email.py`。
脚本校验当前提交与凭据格式、验证 TLS/SMTP 登录、备份私有配置，以 0600 权限
原子更新指定邮件配置，保留 Google 登录、数据库、会话密钥等其他设置。
启动检查失败时恢复之前的邮件配置。重启后再从网站真实测试验证码投递与注册。

所有者已授权将凭据保存到 Actions 的加密 Secret，并发布启用。验证码邮件同时发送 HTML 卡片和纯文字版本；主题不包含验证码，正文提供清晰的大号六位数字与有效期。上线后执行真实投递与注册验证。
