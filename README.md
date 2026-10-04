# StudyBridge Cloud

StudyBridge Cloud 是 StudyBridge 的云端版本：它加入了登录系统、服务端数据库、AI 后端，以及每个学生独立保存的课程资料和聊天记录。

## 已加入的能力

- 注册和登录
- 密码用 `scrypt` 加盐哈希保存
- HttpOnly session cookie
- 每个学生只能访问自己的课程、资料和聊天记录
- 云端保存课程列表
- 云端保存 syllabus、lecture notes、rubric、deadline 等资料文字
- 云端保存 AI 对话记录
- 后端调用 AI，浏览器不会看到 API key
- 本地开发数据库：`.data/studybridge.json`
- AWS 生产数据库：DynamoDB
- Dockerfile 和 AWS DynamoDB CloudFormation 模板

## 本地运行

```bash
cp .env.example .env
node server.js
```

打开：

```text
http://localhost:3000
```

没有配置 `OPENAI_API_KEY` 时，聊天接口仍然会保存消息，并返回内置提示。配置后才会调用真正的 AI。

## 环境变量

复制 `.env.example` 为 `.env`，至少设置：

```text
SESSION_SECRET=replace-with-a-long-random-secret
OPENAI_API_KEY=你的 key
```

AWS 上使用 DynamoDB：

```text
STUDYBRIDGE_DB=dynamodb
AWS_REGION=us-east-1
DYNAMODB_TABLE=StudyBridge
```

## 部署

见：

```text
docs/aws-deploy.md
```

## 文件结构

```text
server.js                 后端 API 和静态文件服务
lib/security.js           密码、session、cookie 工具
lib/database.js           本地数据库和 DynamoDB 数据接口
lib/aws-dynamodb.js       无第三方依赖的 DynamoDB SigV4 调用
public/index.html         登录和学习工作台界面
public/app.js             前端交互和 API 调用
public/style.css          视觉样式
aws/dynamodb-table.yml    DynamoDB 表模板
docs/aws-deploy.md        AWS 部署说明
```
