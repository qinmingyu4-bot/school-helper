# StudyBridge

StudyBridge 是一个面向留学生的对话型课程学习助手网页原型。界面使用中文，但默认围绕北美学校教育模式设计，重点处理 syllabus、assignment prompt、rubric、lecture notes、office hours 和 quiz prep 等常见学习场景。

## Features

- 上传 TXT、MD、CSV、JSON、HTML 等可读课程资料
- 粘贴 syllabus、rubric、作业要求、课堂笔记或教授邮件
- 自动识别资料类型：Syllabus、Assignment、Rubric、Lecture notes
- 支持 Office Hours、Assignment、Quiz Prep、Writing 四种学习模式
- 用中文解释英文课程材料，帮助学生理解教授期待和评分标准
- 基于已上传资料生成答疑内容，并显示引用来源
- 纯前端运行，不需要后端

## How to Use

直接打开 `index.html` 即可使用。

如果部署到 GitHub Pages，可以在仓库 Settings → Pages 中选择 `main` 分支和 root 目录。

## Files

```text
index.html    页面结构
style.css     视觉设计
app.js        上传、资料分析和对话逻辑
README.md     项目说明
CHANGELOG.md  更新记录
```
