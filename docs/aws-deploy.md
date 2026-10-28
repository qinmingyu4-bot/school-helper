# AWS 部署路线

## 可选黑白灰色调发布（1.1.111）

在「设置 → 外观与显示 → 界面色调」新增「黑白灰简约」。原有七种色调、
默认值、每个账号已保存的色调和黑夜模式均继续保留，不自动切换到新选项。
使用原账号独立的外观保存记录，无需迁移或重写偏好。发布前须完成私有备份，
安装后核对数据库和配置未被改写，并在原账号中比对当前色调/黑夜模式和课程。
上一生产代码为 `6e665ce`（1.1.110，含账号安全）。

## 账号安全发布（1.1.110）

经所有者批准，发布 `bf4a641` 的「设置 → 账号安全」。Google 注册用户可在
最近十分钟内的 Google 验证后设置网站密码，已有密码的用户需输入当前密码。
两种登录方式继续使用原账号、SB ID、课程和其他资料。首次发布不会修改现有
密码或退出已有会话；用户保存新密码时才轮换当前会话并使其他会话失效。
保留原有密码找回流程和 Google 配置，不重建、迁移或清空数据库。

发布前沿用下述已验证的私有备份与代码回退流程；安装后检查配置和本地数据
未变化，检查网站健康、新版本资源、现有账号设置页及 Google 登录启用状态。
上一生产代码为 `fc0cc7d`（1.1.109）。

## 登录与注册页面发布（1.1.109）

登录和注册页面沿用首页的黑白灰外观，使用独立的 `public/auth.css`，只作用于
登录区域，保留学习空间里账号已保存的主题。原登录/注册按钮、邮箱验证码、
邀请码、密码帮助和 Google 登录继续使用原处理逻辑；后端和数据结构不变。
部署前仍须完成私有备份，保留线上配置、账号、会话和全部学习数据。
上一生产代码为 `5662fef`（1.1.108）。

## 介绍首页发布（1.1.108）

根域名 `/` 显示经确认的黑白灰介绍首页；右上角「进入 StudyBridge」进入
`/app`，没有有效登录状态时转到 `/login`。保留旧 `/?page=...` 书签及
`/index.html` 入口；邮箱密码登录后恢复请求的页面。Google 登录成功返回
`/app`，失败在 `/login` 显示提示，继续保留现有浏览器绑定与 PKCE 校验。

这次只更新页面和入口，沿用线上账号、会话密钥、Google 配置、数据库及
课程/聊天/日程/作品，不迁移或清空数据。使用下述已验证的发布前私有备份
与代码回退流程，之前的生产代码为 `1165f3c`（1.1.107，含 Google 登录）。

## 正式域名的 Google 登录

正式回调为 `https://studybridge.ink/api/auth/google/callback`，Google Cloud
中创建 Web application 客户端，并在 Google Auth Platform 配置 StudyBridge、
支持邮箱、External 受众及授权域名 `studybridge.ink`。只请求 `openid email
profile`，用于登录身份验证。测试期间需按 Google 控制台设置测试账号及发布状态。

`GOOGLE_CLIENT_ID` 和 `GOOGLE_CLIENT_SECRET` 仅保存在 GitHub Actions 加密
配置及生产服务器私有配置中，不能写入代码、日志或工作流产物。部署完成后，
`.github/workflows/deploy.yml` 通过加密 SSH 标准输入交给
`aws/configure-google-login.py`，只更新这两个值、正式网站地址、回调地址及
`NODE_ENV=production`，保证正式 HTTPS 登录使用 Secure 的浏览器保护 cookie。
更新前在服务器 `~/.studybridge-private-backups/` 创建权限受限的配置备份；
启动校验失败恢复旧配置。应用账号、课程和其他数据不迁移。

Google 登录使用浏览器绑定的十分钟 HttpOnly/Secure/SameSite cookie、
签名 state 和 PKCE。仅接受 Google 已确认验证的邮箱和稳定账号 ID，已有相同
邮箱账号继续使用原账号及资料；已绑定不同 Google ID 的账号拒绝覆盖绑定。
原邮箱密码登录继续保留，新用户仍需在注册页面按现有规则填写邀请码。
已有用户应选择与 StudyBridge 注册邮箱相同的 Google 账号，不会自动合并不同邮箱。

## 正式域名 studybridge.ink

正式入口为 **https://studybridge.ink/**，2026-10-28 已完成域名实名认证、
解析、HTTPS 签发及续期测试。初次签发的证书覆盖根域名与 www，有效期至
2027-01-26，之后由现有自动续期任务更新。新域名和原 IP 入口返回同一网站，
原 IP 与同服务器其他网站的访问检查均通过。

阿里云中已配置两条默认线路 A 记录：`@` 与 `www` 都指向 `3.98.63.195`，
TTL 为 10 分钟。域名及信息模板需分别完成实名认证；注册局解除暂停解析后，
公共 DNS 仍可能暂时缓存此前的不存在结果。

`aws/domain-https.sh` 为现有 Nginx 增加独立域名站点。`prepare` 准备 HTTP-01
验证路由；`apply` 确认根域名及 www 的公共 A 记录正确、无意外 IPv6 记录后，
通过现有 Certbot 签发两域名证书、安装 HTTPS，并测试续期。DNS 未就绪返回 75，
不请求证书。失败恢复本次修改前的域名站点，备份位于服务器私有的
`/root/studybridge-domain-backup.*`。

`.github/workflows/domain-https.yml` 使用已有部署连接在独立任务分支运行，
最多等待 30 分钟 DNS 同步，不发布或重启应用。HTTPS 使用原有每六小时运行的
`studybridge-certbot.timer` 自动续期及 Nginx reload hook。根域名提供网站，
HTTP 和 www 保留请求路径及参数并跳转至 `https://studybridge.ink`。
保留 70 MiB 上传上限及 AI 流式响应，并继续保留原 IP HTTPS 入口和其他站点。
现有账号、数据库和资料继续使用同一应用；新域名首次访问需要重新登录。

维护时检查公共 DNS、两个域名的证书、HTTP/www 跳转和 `/api/health`。
域名初次启用时，应用根据可信反向代理的正式域名生成地址。Google 登录配置
会明确写入正式网站和回调地址，维护步骤见上方 Google 登录章节。

## 现有 Lightsail 公网 IP HTTPS

现有生产实例的 StudyBridge 在 `127.0.0.1:3000`，对外 HTTPS 入口为
`https://3.98.63.195/`，继续兼容旧链接。手机也可使用正式域名，在日程的
「新增安排」里点「语音输入」，首次使用允许浏览器访问麦克风。

`aws/ip-https.sh` 由 `.github/workflows/ip-https.yml` 使用已有部署连接运行，
也可在该 Ubuntu 服务器运行 `sudo bash aws/ip-https.sh inspect` 检查配置，
运行 `sudo bash aws/ip-https.sh apply` 安装/更新。脚本不修改应用进程、`.env`
或数据库，先备份 Nginx 到 `/root/studybridge-https-backup.*`，配置失败恢复原站点。
其他域名网站的配置和 Certbot 保持独立。

- 使用 Certbot 5.8.0 和 Let's Encrypt `shortlived` IP 证书，有效期约六天。
- 独立证书目录 `/etc/letsencrypt-studybridge`，私钥不进入 Git。
- `studybridge-certbot.timer` 每六小时检查是否需要续期，重启后补跑；
  成功续期后先 `nginx -t` 再 reload，不中断应用或其他站点。
- `systemctl list-timers studybridge-certbot.timer` 查看下次检查时间；
  `journalctl -u studybridge-certbot.service` 查看续期结果。
- 测试续期：`sudo /opt/studybridge-certbot/bin/certbot renew --dry-run --run-deploy-hooks --no-random-sleep-on-renew --config-dir /etc/letsencrypt-studybridge --work-dir /var/lib/letsencrypt-studybridge --logs-dir /var/log/letsencrypt-studybridge`。
- 80 端口保留 HTTP-01 验证，其余请求跳转 HTTPS；443 反向代理现有服务。
  保留 70 MiB 请求上限以容纳 50 MiB 资料的 base64 编码，AI 流式响应不缓存。
- 公网 IP 必须保持不变；若 AWS 更换 IP，需更新脚本地址并重新签发证书。
  原 `http://IP:3000` 入口为兼容旧链接暂时保留，手机录音请用 HTTPS 入口。
- HTTPS 满足麦克风的安全访问要求，仍需手机浏览器支持录音并允许麦克风权限。
  账号和数据继续使用现有服务器，首次打开新入口可能需要重新登录。

依据：[Let's Encrypt IP 证书与 Certbot 说明](https://letsencrypt.org/2026/03/11/shorter-certs-certbot/)。

## 通用部署参考

### 数据完整性修复（1.1.107）

本次发布保留 `1.1.106` 的全部既有更新，部署账号并发保存、云数据库扫描分页、
本地事务失败隔离和旧页面请求保护。沿用原数据格式、数据库位置及 `.env`；
无需迁移、清空或重建账号/课程/聊天/日程/社区/作品。密码重置备用验证码逻辑保持不变。
代码回退目标为 `caf5c5f`（1.1.106），代码回退不会自动恢复旧数据库或覆盖新数据。

主分支发布先通过完整测试、脚本语法检查和高风险生产依赖审查，再使用已有的
Lightsail 连接部署确切提交。生产发布排队执行，避免中途取消备份。服务器会短暂
暂停 `studybridge` 写入，将 `.env`、原位置的本地 JSON 数据库及对应 `creative-files`
保存到 `~/studybridge-release-backups/release-<commit>-<random>/`；目录权限 700，
数据库和配置文件权限 600。DynamoDB 模式使用已有 Scan 权限逐页保存原始表项，
包括材料和文件分块，不修改表或基础设施。成功清单为该目录的 `manifest.json`，
没有成功清单的目录不能视为完整备份。备份不得上传 GitHub 或日志。

备份失败会停止安装并重新启动原应用。安装后会核对原配置/本地数据库未被改写，
再验证健康接口、数据库模式和实际提供的前端文件；失败时回退应用代码并重启，
保留用户数据和备份。新的备份不自动清理，后续按磁盘空间安排留存。数据库/文件
恢复需要独立维护操作，不能在仍有用户写入时直接用旧备份覆盖线上数据。

### 社区功能（1.1.103）

社区帖子按选中的全部、学校、专业频道发布，共享同一条讨论。普通列表每页
最多 40 条；搜索每次最多检查 100 条频道索引；回复每页 50 条、通知每页
30 条。通知在进入社区或手动刷新时获取，不做后台轮询。

DynamoDB 旧帖在首次访问社区后分批建立新索引，每次最多扫描 100 个表项，
进度保存在数据库中，重启可继续。页面提示历史整理尚未完成时，刷新继续。
完成后，列表与搜索按频道查询，帖子按 ID 直接读取。无需手工修改数据库。
部署账号需要已有的 GetItem、PutItem、Query、Scan 和 TransactWriteItems 权限。

新版本新增规范化帖子记录及内容为空的删除标记。若回退到 1.1.102，旧程序
无法完整识别新发布的帖子和新删除状态；回退代码前应暂停社区写入并制定
数据兼容处理，不能把代码回退当作社区数据回退。账号、课程及日历数据不受
本次社区存储变更影响。

课程表确认加入采用每批最多 80 条的 `/api/schedule/import`，界面显示实际完成的
保存/重复数量，失败保留预览供重试。`/api/schedule/items` 一次返回当前用户的完整
日历安排，不传输其他课程资料正文。本地数据库每批统一落盘；DynamoDB 使用
`TransactWriteItems`（已有权限需包含该动作）和导入版本条件，保证每批原子提交。
原数据库及已有逐条新增、修改、完成操作保持兼容。

课表/syllabus 提取成功后，明确识别的课程会自动加入「对话与课程」，按名称及明确的
课程代码复用现有课程，不修改原有名称、学期或资料。未识别名称、模糊的多课程名称
不会创建课程。取消日历预览不会删除已识别课程；具体安排仍须确认后才保存，并归入
对应课程。个人计划和缺少明确课程的条目继续使用原有 planner。

「学习」采用「课程 → 对话」结构。课程可展开/收起并创建多个独立标题的对话，课程资料
共享，聊天记录和对话中上传的附件按 `conversationId` 隔离。`GET/POST
/api/courses/:courseId/conversations` 列出/创建对话，`PATCH .../conversations/:id`
重命名；发送消息的 body 和读取消息的 query 均支持 `conversationId`。
省略时继续使用 `default`，历史消息无须迁移或重写。新对话元数据保存在原数据库内，
现有账号、课程资料、默认聊天及备份机制保持兼容。

StudyBridge Cloud 是一个 Node 服务：前端、登录、数据库 API 和 AI API 都由同一个服务提供。推荐先用 AWS App Runner 或 EC2 跑起来，数据库用 DynamoDB。

## 1. 本地确认

```bash
cp .env.example .env
node server.js
```

打开：

```text
http://localhost:3000
```

本地默认使用 `.data/studybridge.json` 保存数据。

## 2. 创建 DynamoDB

在 AWS CloudFormation 里上传 `aws/dynamodb-table.yml`，创建表名 `StudyBridge`。

如果你用 AWS CLI：

```bash
aws cloudformation deploy \
  --stack-name studybridge-db \
  --template-file aws/dynamodb-table.yml \
  --parameter-overrides TableName=StudyBridge
```

## 3. 部署 Node 服务

最省心路线：

1. 把 GitHub 仓库连接到 AWS App Runner。
2. 选择 Dockerfile 部署。
3. 端口填 `3000`。
4. 设置环境变量：

```text
NODE_ENV=production
PORT=3000
SESSION_SECRET=一串很长的随机字符
STUDYBRIDGE_DB=dynamodb
AWS_REGION=us-east-1
DYNAMODB_TABLE=StudyBridge
OPENAI_API_KEY=你的 OpenAI API key
OPENAI_MODEL=gpt-4o-mini
```

App Runner 的运行角色需要给 DynamoDB 表这些权限：

```text
dynamodb:GetItem
dynamodb:PutItem
dynamodb:DeleteItem
dynamodb:Query
dynamodb:Scan
dynamodb:TransactWriteItems
```

## 4. 域名

部署成功后，App Runner 会给你一个 HTTPS 地址。之后可以在 App Runner 里绑定自己的域名，例如：

```text
https://studybridge.example.com
```

## 5. 重要安全提醒

- 不要把 `.env`、`OPENAI_API_KEY`、AWS 密钥提交到 GitHub。
- 学生数据属于敏感数据，正式给别人用之前建议加上隐私政策、数据删除入口、备份策略和更严格的访问日志。
- 如果是学校/机构用途，可能还需要按所在地要求处理 FERPA、PIPEDA、GDPR 或校内隐私规则。
