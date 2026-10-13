# StudyBridge Cloud

StudyBridge Cloud is the server-backed version of StudyBridge. It adds login, invitation-only registration, a creator console, per-student cloud data, and a backend AI API so the OpenAI key never appears in browser code.

## Features

- Login and registration with salted `scrypt` password hashes
- Invitation-only registration
- Creator/admin account controlled by `ADMIN_EMAILS`
- Creator console for creating, copying, enabling, and disabling invite codes
- Creator overview of registered students and their course/document/chat counts
- Admin-only recent online timestamps with relative labels and exact-time tooltips
- HttpOnly session cookie
- Per-student courses, course documents, preferences, and chat history
- Backend AI calls using `OPENAI_API_KEY`
- Incremental Study Area replies with animated activity states and a stop-generation control
- Self-hosted Inter Variable and Noto Sans SC interface fonts, with bundled licenses and source notes in `public/fonts/SOURCES.md`
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

Recent online times begin with successful logins and authenticated browser activity.
Visible tabs report at most once per minute while recently active; hidden tabs and
tabs idle for five minutes stop reporting. The admin list refreshes times once per
minute without replacing draft inputs. Times are approximate activity indicators,
not proof of a live connection. Older accounts show no record until their next
login or activity; historical online times are not inferred from account creation.
Only admins can view this metadata. No keystrokes, page history, or IP addresses
are stored by this feature.

## Study Area

The Study Area mode selector sits beside the question shortcuts above the input.
Each mode supplies four editable prompts, with course introduction and deadline
summary available in every mode. Selecting a shortcut fills the question without
sending it. The selected mode is remembered in this browser per account and course;
switching modes leaves drafts, attachments, and the current reading position intact.
Course materials, account learning preferences, and the latest explicit request
continue to guide the AI response.

All seven modes search the complete extracted text of every material in the
current course and every chat attachment saved in that course. Small collections
are supplied in full; larger collections use question- and recent-conversation-
matched passages within a 60,000-character material budget. Broad reviews also
sample source endings and middles. Replies should cite source filenames and must
not claim exhaustive coverage when only selected passages were supplied.
New uploads no longer discard text after 12,000/9,000 characters. Unsupported or
scanned files still require readable text; this does not add OCR.

Chat attachment text and image data survive later turns, mode changes, and server
restarts independently of the latest conversation window. Images named in the
question are prioritized, followed by recent images, up to eight images and a
32 MiB data-URL budget per request. Material content is private to the account and
course and is not included in ordinary chat-history responses. Deleting a course
also deletes its saved attachments. DynamoDB stores large source bodies in
versioned chunks and reads all query pages instead of stopping at the first page.
Existing saved document text remains compatible, but text previously discarded
and old chat attachments previously saved only as filenames cannot be recovered;
upload those originals again to enable complete-source follow-ups.

Study replies use an authenticated POST to `/api/courses/:id/chat` with
`stream: true`. The server forwards only answer text, not internal reasoning,
through SSE `status`, `start`, `delta`, `done`, and `error` events. Activity states
reflect course-context preparation, AI processing, optional web search/integration,
answer generation, and persistence. A stopped or interrupted reply retains its
received text and is marked incomplete in history. Generation can continue while
viewing another course; replies and controls remain isolated per account/course.
New requests and the first answer appear at the bottom. Subsequent output follows
the bottom unless the student scrolls up to read history, and leaves drafts and
sidebar scroll positions untouched. Reduced-motion settings disable the spinner.
Other clients (including Tools) can omit `stream` and retain the existing JSON API.

AI replies render Markdown headings, lists, quotations, code, and source links with
responsive reading spacing. Historical and live streamed answers use the same
self-hosted, pinned markdown-it renderer; tables and code scroll locally. Raw HTML,
unsafe link schemes, and remote tracking images are not rendered. The browser
bundle and dependency licenses are regenerated with `npm run vendor:markdown`.

Streaming requests time out after three minutes. If placing a reverse proxy in
front of the app, disable response buffering for the chat endpoint and allow an
idle timeout longer than the server's ten-second SSE heartbeat. Keep API keys on
the server; no additional browser credentials or environment settings are needed.

## Schedule imports

The Schedule page accepts PDF (up to 8 MB), Word, PowerPoint, Excel, TXT, MD,
CSV, and JSON (up to 12 MB). An authenticated AI extraction request reads only
the selected file and returns editable DDL, LEC, and TUT drafts. It does not
create a course, document, chat message, or reminder until the student confirms
selected rows. Missing dates/times remain blank for review; original evidence
and ambiguity notes appear beside each draft. Weekly meetings expand only when
the source specifies semester boundaries and meeting times.

File import and the reminder list use the full available page width. The manual
form expands on demand, and completed reminders stay in a collapsible section.
Review cards adapt to the width of the content area, including narrow side panels.

Confirmation saves reminders in the existing per-user planner, skips duplicates,
and preserves remaining drafts if saving fails. Countdown labels refresh every
15 seconds while the page is open, without replacing the student's draft inputs.
Dates are displayed in the browser's time zone and saved as UTC instants.
AI extraction requires the server's existing `OPENAI_API_KEY` and uses
`OPENAI_COMPLEX_MODEL`. Scanned PDFs without readable text need conversion first;
legacy DOC/PPT/XLS extraction is best-effort and displays a review warning.
Documents over 100,000 extracted characters must be split rather than truncated.
Drafts stay in memory while navigating but are discarded on page reload.

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
```

AI routing is deterministic: ordinary questions use Luna; complex academic modes,
reasoning/coding tasks, long questions, and newly uploaded long attachments use
Sol. Brief follow-ups inherit the earlier task. The amount of saved course text or
old assistant output does not independently escalate a new ordinary question.
Responses web search, its preview compatibility retry, and Chat Completions
fallback all use the selected task model. Legacy `OPENAI_SOL_ROUTE_PERCENT`,
`STUDYBRIDGE_SOL_ROUTE_PERCENT`, `OPENAI_WEB_MODEL`, and `STUDYBRIDGE_WEB_MODEL`
settings no longer override this policy. The admin status panel shows runtime
model configuration, web routing, and the last completed request's model/API;
it does not record question text in that diagnostic.

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
