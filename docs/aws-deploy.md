# AWS 部署路线

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
