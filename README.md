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
- Manual SB Docs, SB Slides and SB Sheets editors with private cloud projects, browser draft recovery, Office import/export, and AI suggestions applied only after the student chooses
- Local JSON database for development or small private deployments
- Optional DynamoDB storage for AWS production
- Full-window classmate chats with live messages, persistent unread counts, latest-message sorting, and clickable peer avatars and public profiles

## Manual Office editors

Tools opens Docs, Slides and Sheets in **自主编辑** mode. **AI 文件生成** retains the existing file-generation and revision workflow; Images and Cheatsheet PDF are unchanged.

- **SB Docs:** a spacious paper canvas, selected-text font/size/color/bold/italic/underline controls, headings, lists, alignment, paragraph line spacing (including Double), A4/Letter, margins, images, undo/redo, DOCX export, and browser printing/PDF.
- **AI 赋能 in SB Docs:** a permanent request bar below the document title, with whole-document or selected-text scope and optional polish/academic/concise/translation shortcuts. Preview before/after changes, then apply them directly to the existing text or discard them. Unchanged text, paragraph structure, images and formatting remain; rewritten spans inherit nearby formatting. One undo restores the pre-AI text. Editing the document after requesting a preview requires a fresh preview. Requests are limited to 20,000 source characters/500 non-empty text blocks; select shorter passages in larger documents. This workflow edits existing prose; the separate **AI 文件生成** mode creates complete files from a prompt.
- **SB Slides:** editable 16:9 pages with real thumbnails, add/duplicate/reorder/delete, text boxes and local images, drag/resize and numeric geometry controls, fonts/colors/backgrounds, speaker notes, Fade/Push/Wipe transitions and presentation mode. PPTX exports retain native editable text/images and transitions.
- **SB Sheets:** multiple named worksheets, cell editing and formatting, formula bar, keyboard navigation, TSV paste, added rows/columns, arithmetic, ranges, cross-sheet references, and functions such as SUM, AVERAGE, IF, ROUND and VLOOKUP. XLSX export retains formulas and cached calculated results. Circular, unsupported or invalid formulas show errors rather than executing JavaScript.
- **AI 赋能 in Slides and Sheets:** the same permanent title-level request bar edits existing content in place. Slides scopes are current slide, whole presentation or selected element; edit text, fonts/colors/geometry, speaker notes, backgrounds and transitions while retaining all other elements and image bytes. Sheets scopes are current worksheet, a typed range such as `A1:D10`, current cell or the whole workbook; update multiple values, formulas and partial styles, including empty destination cells inside the allowed range. Previews identify page/element or worksheet/cell, show changed fields before/after and formula results, and apply as one undoable change. Any intervening model edit invalidates the preview. Source context is bounded to 60,000 serialized characters and a preview to 500 targets; shrink the scope for larger projects. These revisions retain existing pages/elements and worksheet structure; use manual controls or the separate full-file generator to add/remove/reorder structure.

DOCX/PPTX/XLSX import creates a new editable project. Common content and formatting are converted; advanced Word pagination/styles/objects, PowerPoint masters/charts/groups/complex animations, and spreadsheet charts/merged layouts are not fully supported. Each import shows its compatibility notes. Recheck imported calculations and layout. This is an initial manual editing implementation, not full Office-format parity or real-time collaborative editing.

Private projects autosave after editing pauses and can be explicitly saved, renamed, reopened or copied. The UI distinguishes browser draft recovery from confirmed cloud saves. Version checks reject stale saves; use **另存副本** when another tab/device has updated a project. Limits: 200 projects per user, 10 MB per model, 100 slides/100 elements per slide, 10 worksheets/1,000 rows/100 columns/50,000 populated cells, and 12 MB Office imports. Imported embedded pictures must be PNG/JPEG and at most 1 MB; browser-added PNG/JPEG/WebP images are resized and converted before saving.

The authenticated `/api/office` routes store user-scoped metadata and immutable chunked content through the existing local/DynamoDB stores. Exports are generated from the manually edited model without an AI call. `/api/office/assist` with `operation: revise` returns validated text-block revisions or scoped slide/cell patches; it never overwrites saved work automatically. Legacy suggestion requests remain supported. Client and server share target, field, geometry, range, formula and size validation; unsupported or out-of-scope responses are rejected atomically.

The editor bundle is lazy-loaded from this server. After changing `client/office-editor.mjs`, `public/office-model.js`, `lib/office-formulas.js` or its dependencies, run `npm ci` and `npm run build:office`, then commit the rebuilt `public/vendor/office-editor.min.js` and its dependency notices. Production installs omit development dependencies and serve the committed bundle. The pinned `image-size` and ExcelJS `uuid` overrides address dependency advisories and are covered by native export tests.

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

Learning Style checkboxes are independent saved preferences. English answers
select English final answers/drafts; Chinese explanations select Chinese teaching
and supporting explanations. Enabling both produces an English answer followed by
a complementary Chinese explanation for worked academic problems, even with an
empty custom instruction. English terms preserves useful academic keywords in
Chinese explanations. The latest explicit language/format request takes priority,
followed by custom instructions, checkboxes, then the question's language; simply
asking “怎么做” does not cancel the saved English-answer setting. Hint-only and
interactive quiz modes still withhold final answers when appropriate.

Checkboxes and custom instructions auto-save, with visible unsaved/saving/saved/
failure states and a summary of the selected style. Saves are serialized to retain
rapid edits. Sending waits for the latest preferences to save and includes that
normalized snapshot in the chat request; a failed save preserves the draft and
stops the question from being sent with stale preferences. Other clients that omit
the snapshot use the server's saved account preferences.

For academic problem-solving, a short request such as “怎么做” now defaults to a
worked teaching explanation: introduce the necessary concept, interpret the given
facts/diagram, explain the important steps, and state the conclusion and a useful
takeaway. Explicit short-answer, hints-only, quiz, cheatsheet, and cram constraints
still take priority. Current or retained problem images paired with a solve/help
request select the complex model; ordinary photo descriptions and everyday
questions remain eligible for Luna.

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

User messages display uploaded image thumbnails and filenames alongside the
question, with click-to-enlarge previews and keyboard dismissal. Local previews
appear immediately on send; saved previews survive reload and a new login.
Chat-history responses contain attachment metadata and account/course-scoped
image URLs, not image data or extracted attachment text. Image responses require
the owner's session and disable caching. Existing retained attachment groups are
matched to their original message IDs when displaying older history; filename-only
uploads whose bytes were never saved still require re-upload.

Paste a screenshot with Ctrl+V while the Study Area question input is focused
(including General Chat and every course mode). Clipboard image files become
pending attachments with thumbnails and remove buttons; they upload only when
the question is sent and use the same persistent image history as selected files.
Repeated screenshots receive distinct identities. Ordinary text paste stays
native; image-plus-text paste inserts the plain text at the current selection and
retains input focus. Other text fields are unaffected. The existing 12 MB
per-file limit applies, and invalid batches do not partially add attachments.
This uses the user-initiated paste event, without polling the system clipboard.

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
Mathematical notation uses self-hosted KaTeX with local WOFF2 fonts: inline
`\( ... \)` / `$...$` and display `\[ ... \]` / `$$...$$` render roots, fractions,
powers, integral bounds and limits in historical and streaming replies. Balanced
arithmetic `sqrt(...)` / `cbrt(...)` calls in older prose also render as radicals;
code, URLs, currency and unsupported expressions retain their literal text.
No stored messages are rewritten. Untrusted math cannot load external images,
create links or HTML attributes; incomplete/unsupported formulas fall back to
escaped text. Regenerate pinned math assets with `npm run vendor:math`.

Academic explanations default to a method overview, why the method applies,
reproducible intermediate calculations and a final answer, one part at a time.
Learning Style chooses the answer/explanation languages without shortening the
teaching: English answers plus Chinese explanations teach each part in Chinese
before its concise English exam answer. Explicit brevity, answer-only, hints,
quiz answer timing and print/time budgets still take priority. Image requests
such as `teach me` and `教我` use the complex-task model, including retained images.

The Study Area also has a permanent General Chat entry beside courses for everyday
questions. It works without creating a course, keeps account-scoped history and
attachments separately, and does not use academic mode instructions or other
courses' materials. Course lists/counts and saved course conversations are unchanged.
The selected conversation is remembered per account in the browser. General Chat
supports the same streaming, cancellation, Markdown, and latest-message scrolling;
its course-material controls are hidden and files attach through the composer.

Tools now creates downloadable Word/PDF, Excel, PowerPoint and PNG images with
preview, source uploads, optional owned-course context, revision history and
cancellation. Document files use hosted Code Interpreter rather than executing
model-generated code on the app server; image revisions use the actual prior image.
Video infrastructure is present but closed by default at both UI/API levels.
See [Creative Tools](docs/creative-tools.md) for model configuration, quality
limits, billing/concurrency controls, authenticated file storage and backup needs.

The course Cheatsheet PDF workspace also follows saved Learning Style and reuses
historical course-chat images as real image inputs. Use “继续修改” on a completed
PDF to revise it with current preferences, current course sources, retained image
references, prior requirements and the latest PDF. Workspace source uploads remain
available across revisions/restarts without another upload; each version retains
its own private source copies. See Creative Tools for source/context size limits
and compatibility with older PDFs whose originals were not previously retained.

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
