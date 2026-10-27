# AWS 部署路线

## 现有 Lightsail 公网 IP HTTPS

现有生产实例的 StudyBridge 在 `127.0.0.1:3000`，对外 HTTPS 入口为
`https://3.98.63.195/`。无需购买域名。手机请使用这个地址，在时间表的
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
