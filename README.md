# StudyBridge Cloud

StudyBridge Cloud is the server-backed version of StudyBridge. It adds login, invitation-only registration, a creator console, per-student cloud data, and a backend AI API so the OpenAI key never appears in browser code.

## Features

- Login and registration with salted `scrypt` password hashes
- Invitation-only registration
- Creator/admin account controlled by `ADMIN_EMAILS`
- Creator console for creating, copying, enabling, and disabling invite codes
- Creator overview of registered students and their course/document/chat counts
- HttpOnly session cookie
- Per-student courses, course documents, preferences, and chat history
- Backend AI calls using `OPENAI_API_KEY`
- Seven Study Area modes with mode-specific question shortcuts and AI workflows: preview, guided learning, review, assignment help, mock exams, cheatsheets, and exam cramming
- Local JSON database for development or small private deployments
- Optional DynamoDB storage for AWS production
- Full-window classmate chats with live messages, persistent unread counts, latest-message sorting, and clickable peer avatars and public profiles

## Local Run

```bash
cp .env.example .env
npm ci
node server.js
```

Open:

```text
http://localhost:3000
```

Before registering the creator account, set these in `.env`:

```text
ADMIN_EMAILS=your-real-email@example.com
OWNER_INVITE_CODE=your-private-creator-code
```

Register with that email and owner invite code. After login, the creator console appears inside the app.

## Study Area

The Study Area mode selector sits beside the question shortcuts above the input.
Each mode supplies four editable prompts, with course introduction and deadline
summary available in every mode. Selecting a shortcut fills the question without
sending it. The selected mode is remembered in this browser per account and course;
switching modes leaves drafts, attachments, and the current reading position intact.
Course materials, account learning preferences, and the latest explicit request
continue to guide the AI response.

## Health Checks

```bash
npm run check
npm test
npm audit --omit=dev
```

Tests use isolated temporary databases and disable external AI, email, and Google services.
Pushes to `main` run these checks before the Lightsail deployment. Historical one-time
hotfix workflows are preserved in `.github/legacy-workflows` and no longer run automatically
or overwrite the checked source. Some archived definitions contain invalid YAML and are
kept only as historical references.

## Important Environment Variables

Each invitation permits one successful registration. Previously used codes cannot
be reused, even if their old usage limit was higher or they are re-enabled.

```text
SESSION_SECRET=replace-with-a-long-random-secret
ADMIN_EMAILS=your-real-email@example.com
REQUIRE_INVITE_CODE=true
OWNER_INVITE_CODE=your-private-creator-code
OPENAI_API_KEY=your-openai-api-key
OPENAI_SIMPLE_MODEL=gpt-6-luna
OPENAI_COMPLEX_MODEL=gpt-6.1-sol
OPENAI_SOL_ROUTE_PERCENT=15
```

For AWS DynamoDB:

```text
STUDYBRIDGE_DB=dynamodb
AWS_REGION=us-east-1
DYNAMODB_TABLE=StudyBridge
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_SESSION_TOKEN=
```

## Deployment

See:

```text
docs/aws-deploy.md
```

GitHub Pages can only serve the older static app. This cloud version needs a Node server, so deploy it to AWS Lightsail, EC2, Render, Railway, Fly.io, or another Node hosting provider.
