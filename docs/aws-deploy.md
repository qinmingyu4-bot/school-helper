# AWS 部署路线

## 现有 Lightsail 公网 IP HTTPS

现有生产实例的 StudyBridge 在 `127.0.0.1:3000`，对外 HTTPS 入口为
`https://3.98.63.195/`。无需购买域名。手机请使用这个地址，在日程的
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
