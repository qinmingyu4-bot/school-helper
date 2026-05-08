# StudyBridge

StudyBridge 是一个面向留学生的整学期多课程学习工作台。界面使用中文，但默认围绕北美学校教育模式设计；每门课都是一个独立 section，可以分别保存 syllabus、lecture notes、readings、rubric、deadline、midterm 和 final 等材料。

## Features

- 上传 PDF、TXT、MD、CSV、JSON、HTML 等可读课程资料
- 每次打开先进入欢迎封面页，点击开始后进入 semester course 学习工作台
- 创建多个 semester courses，每门课都有自己的 Course Pack、Past Chats 和学习模式
- 支持删除 semester course，并同步清理该课程的 Course Pack 和 Past Chats
- 支持客制化 Learning Style：知识点中文解释、关键内容保留 English terms、做题优先 English final answer 并配中文 reasoning
- 根据用户常用问法更新浏览器本地偏好记忆，后续回答会参考这些教学习惯
- 在对话框上传、拖拽或粘贴 PNG、JPG、WEBP、GIF、BMP、AVIF、HEIC、TIFF 等图片附件
- 粘贴 syllabus、lecture notes、reading guide、rubric、midterm/final 样卷、deadline 或教授邮件
- 自动识别资料类型：Syllabus、Schedule、Rubric、Lecture notes、Exam material
- 支持预习、带着学习、复习、模拟出题、课程介绍、Deadline 汇总等学习模式
- 模拟出题既可以生成单独题目，也可以模仿上传的 midterm/final 格式生成完整练习卷
- 自动保存浏览器本地历史对话和 Course Pack 文字内容，并在后续回答中参考最近学习记录
- 提供 cheatsheet 辅助，把概念、步骤、易错点和题型套路压缩成考前速查结构
- 提供紧急考前复习模式，先补最低必要知识，再快速进入做题方法和题型训练
- 用中文解释英文课程材料，同时保留考试需要使用的英文术语、作答表达和 rubric 语言
- 基于已上传资料生成答疑内容，并显示引用来源
- 纯前端运行，不需要后端

## Local Memory

每门课的对话历史和 Course Pack 中可读取的文字内容会保存在当前浏览器的 localStorage 中。它可以帮助 StudyBridge 在后续对话中参考该课程的最近学习记录和之前上传过的课程资料；这些记录不会自动同步到其他设备或其他用户。PDF 原文件不会被保存，系统只保存提取出的文字。

## PDF Support

PDF 会在浏览器本地用 PDF.js 提取文字，不会上传到服务器。普通文字版 PDF 可以读取；扫描版 PDF 或图片型 PDF 需要 OCR，当前版本会提示粘贴关键文字。

## Image Attachments

对话框支持上传、拖拽和粘贴常见图片格式。图片会显示在聊天记录中，并保存在当前浏览器的本地对话历史里。当前静态版本不会自动识别图片内容；如果需要解题或讲解，请同时粘贴图片里的题目文字。

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
