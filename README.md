# StudyBridge Cloud

StudyBridge Cloud is the server-backed version of StudyBridge. It adds login, open registration with optional Plus invitations, a creator console, per-student cloud data, and a backend AI API so the OpenAI key never appears in browser code.

## Features

- Chinese / English interface: switch on the homepage, sign-in screen, sidebar, or **Settings → Personalization**. On first use, the first supported browser language is selected (`zh-*` → Simplified Chinese, `en-*` → English), falling back to Chinese. The choice is saved as `studybridge.interface-language` in this browser, shared by the homepage and app, and synchronized across tabs. Switching preserves active form and chat drafts. Interface language is independent of AI Learning Style; user content, course names, messages and documents are kept in their original language. Missing translations fall back to Chinese. Add interface text to `public/i18n-en.js`, use `StudyBridgeI18n.text` / `message` for labels and `html` for trusted UI templates; keep user content in interpolations and escape it as before. Interface language is a browser preference, not an account-synced preference.

- Six student destinations: Community, Classmates, Schedule, Study, Tools and **邮箱助手**. Bind Gmail or Outlook under **设置 → 邮箱授权**; the assistant's compact header shows connection state and linked addresses. **邮件解读与回复** opens directly with visible input/draft panels; **学习通知** separately reviews extracted items before calendar confirmation. View switching retains inputs, replies and review edits. Private OAuth setup and first-release limits: [Mailbox assistant](docs/mailbox-assistant.md).

- Public product introduction at `/`, a dedicated `/login` entry and authenticated learning space at `/app`. Homepage entry buttons open `/app`; guests are redirected to `/login`, while signed-in visitors enter directly. The homepage stays public in either state.
- Login and registration with salted `scrypt` password hashes
- Invitation-only registration
- Creator/admin account controlled by `ADMIN_EMAILS`
- Creator console for creating, copying, enabling, and disabling invite codes
- Creator overview of registered students and their course/document/chat counts
- Admin-only recent online timestamps with relative labels and exact-time tooltips
- HttpOnly session cookie
- Per-student courses, course documents, preferences, and chat history
- Expandable course folders with multiple independently titled chats, first-question titles and manual renaming. Course documents are shared; each chat keeps its own messages, uploads, input drafts and streaming reply. Historical course messages remain in the default conversation.
- Timetable/syllabus extraction automatically adds recognized courses and reuses existing ones; calendar entries are saved only after confirmation and filed under the corresponding course.
- Backend AI calls using `OPENAI_API_KEY`
- Incremental Study Area replies with animated activity states and a stop-generation control
- Self-hosted Inter Variable and Noto Sans SC interface fonts, with bundled licenses and source notes in `public/fonts/SOURCES.md`
- Shared book-and-bridge logo on the homepage, login and app, defaulting to monochrome. **设置 → 个性化 → 品牌 Logo** offers the approved indigo/mint alternative with immediate preview and account-scoped saving, independent of interface palette and dark mode. Both original design proofs and scalable assets are documented in `docs/branding/README.md`.
- Six Study Area modes with mode-specific question shortcuts and AI workflows: preview, guided learning, review, assignment help, mock exams, and exam cramming
- Manual SB Docs, SB Slides and SB Sheets editors with private cloud projects, browser draft recovery, Office import/export, and AI suggestions applied only after the student chooses
- Local JSON database for development or small private deployments
- Optional DynamoDB storage for AWS production
- Full-window classmate chats with live messages/requests, persistent unread counts, latest-message sorting, and clickable peer avatars and public profiles. Concurrent requests/acceptance share one chat; failed saves retain pending requests, and refreshes or delayed responses preserve new drafts and the current destination.
- A red dot beside **Classmates** remains visible while using Study or another student page. The phone's **Main menu** button also carries the dot while a page is open. Opening the classmate list does not mark chats read; the dot clears after all incoming messages are read, including reads from another tab/device. Background updates change only the indicator, preserving Study input, focus and streamed answers. Live events are reconciled with a private unread-only check every 15 seconds while the tab is visible; sign-out/account or admin-mode changes stop the previous subscription.
- New incoming live classmate messages also show a small in-page notification for 10 seconds, with a manual close button. A later message replaces the reminder and restarts its timer. The current visible conversation, outgoing messages, read receipts, duplicate message events and hidden tabs do not raise popups. Closing a reminder does not mark a message read or clear the unread dot. Notifications contain no message text or attachment data and preserve the current page, draft and focus.
- Classmate messages support original images and files, with thumbnails, enlarged image viewing and private downloads. Pick multiple files, paste screenshots or drag files into chat; remove queued attachments before sending. Send up to 6 files, 12 MB each and 20 MB total, with or without text. Failed sends retain the draft and retries reuse the same message identity. Selected files stay separate by chat during navigation; unsent files must be selected again after a page reload. Sent originals survive reloads/restarts and are accessible only to that chat's participants. SVG/HTML and other files download as attachments; only validated raster images preview inline.

## Website entry paths

The bare domain serves `public/landing.html` with its own responsive styles and
no application scripts or account requests. Its neutral white/light-gray surfaces,
charcoal text and thin frames are independent of saved learning-space themes.
Login and registration use the same neutral style through scoped `public/auth.css`,
with the shared bridge wordmark, visible field focus, status messages and a homepage
link. Existing authentication actions, invitation/email-code fields and Google
sign-in remain connected to the original handlers.
All **进入 StudyBridge / 开始使用**
links point to `/app`, where the server checks the existing session cookie.
`/login` serves the existing authentication UI and sends an already authenticated
visitor to `/app`. Login and registration continue in the learning space;
logout returns to `/login`, and the login screen links back to the public homepage.

Existing `/?page=...` and `/index.html` bookmarks redirect to `/app`, retaining
their query parameters. An unauthenticated deep link keeps its `page` through
password login. Learning navigation continues to use `/app?page=...` and retains existing
saved-page behavior. Google sign-in returns to `/app` on success and `/login`
with an escaped visible error on failure; legacy root OAuth links also redirect.
Session-dependent page redirects use `Cache-Control: no-store`.

Preview this change with an isolated local database. Push review work to a task
branch: pushing to `main` triggers the AWS deployment workflow.

## Study input

Study uses the approved **轻量横排** input on desktop and mobile: a quiet
mode/shortcut row, integrated attachment/input/send field and an upward-opening
**更多** menu. All seven Study modes, general prompts, Cheatsheet PDF, attachments
and stop-generation remain available. Text and restored drafts grow the field up
to 140 px, then scroll within it. Colors follow all eight account palettes and
independent dark mode through the existing Settings controls.

## Mobile navigation

Mobile Study replies retain 14 px body text with 1.65 line spacing, wider text
columns and smaller paragraph/list gaps. Speaker labels remain accessible without
occupying a side column. Empty deadline placeholders do not consume phone reading
space; actual upcoming schedules remain visible. Desktop reply typography and
scrollable formula/table rendering are unchanged.

At widths up to 700 px, the student app uses a main menu and separate full-screen
pages for Community, Classmates, Schedule, Study and Tools. Opening an entry slides
the page in from the right. **主菜单** in the upper left returns to the menu;
the browser Back button also returns after opening a menu entry. Returning and
reopening the same page retains its mounted forms, selected files and unsent chat
text. A bare `/app` starts at the menu; explicit `?page=...` links open their page.
Study opens directly to chat; **课程与资料** opens course selection, shared materials
and learning preferences, with a separate return to Study. Larger layouts and the
creator console keep their existing navigation. Reduced-motion preferences disable
the slide transition.

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

Profile avatar and cover uploads accept source photos up to 25 MiB. The browser
resizes and re-encodes them locally before saving: avatar up to 512 px/80 KiB and
cover up to 1600 px/128 KiB. Only the processed image is uploaded; originals are
not modified. The combined encoded images leave room for profile metadata in a
DynamoDB item. Transparent images receive a white background; animated images
become still images. HEIC/HEIF works only when the browser can decode it; otherwise
export a JPG/PNG first. Unsupported or oversized images show an error without
silently truncating the image data or replacing the saved profile.

Community publishing has explicit checkboxes for all, school and major channels.
Authors can choose **编辑帖子** to change the topic, body, destination channels or
anonymous setting. The editor prefills the original destinations, offers profile
school/major defaults when adding a channel, and accepts another school/major name.
Saving updates the same post in every selected channel and removes it from channels
that were unchecked. Creation time, likes and replies stay attached to the original
post; search indexes update atomically in DynamoDB. Other accounts, including admins,
cannot edit the author's text. An edited-time label distinguishes an edit from a new
post. Failed saves retain the draft; stale edits show a conflict instead of overwriting
a newer edit. Cancel and reopen to load the newer text after copying any desired draft
changes. No extra reply notification is sent for editing a post.

Only checked destinations receive a new post; a shared post ID keeps likes and
replies together across those destinations. School/major destinations use the
selected channel, falling back to the profile. Anonymous posts hide the account
name and omit profile school/major fields from public responses; the explicitly
chosen destinations remain visible. Replies have their own anonymous switch.
Authors can delete their posts/replies; administrators can also delete them.
Deleting a post removes access to its discussion and notices in every channel.

The feed loads 40 posts at a time with no fixed 80-post history cutoff. Search
matches topic/body in the selected channel, case-insensitively after Unicode
normalization. Each cloud search request examines at most 100 indexed feed
references; use **继续搜索更早讨论** to continue when a batch has no matches.
Deleted references can produce a shorter page. Older replies load in 50-reply
pages. Unsent reply drafts and anonymous choices survive page/channel navigation
within the session; failed sends retain text and account changes clear drafts.

Reply notifications are private to the post author, omit self-replies, and honor
reply anonymity. The community page loads the latest 30 notifications, supports
older pages and manual refresh, and marks a notification read when opening its
discussion. There is no background polling, email or push delivery. The unread
number counts the currently loaded notifications. Notices for deleted posts or
replies are hidden.

DynamoDB community posts use one canonical record with small per-channel feed
references. Conditional transactions with bounded conflict retries prevent likes
from overwriting concurrent updates; the current client sends the desired liked
state so repeated requests are idempotent. Replies and notifications are committed
atomically after checking the post still exists. Soft deletion retains a content-free
tombstone to stop in-flight writes or legacy indexing from restoring a deleted post.
Deleted reply tombstones retain only the IDs/date needed for stable pagination.

Existing cloud posts are indexed incrementally: each feed request advances at most
one 100-item table-scan page, with a persistent restart-safe checkpoint. The page
shows a historical-indexing message until this one-time upgrade is complete; refresh
to advance it. Legacy posts retain their previous aggregate-feed visibility, and
legacy replies remain attached to the same post IDs. Once complete, normal feed,
search, post lookup and reply/notification pagination use bounded queries or direct
reads. Channel suggestions are capped at 100 stored entries; other names can still
be typed. No database credentials or infrastructure changes are required. Older
clients without destination checkboxes retain their prior aggregate-feed behavior.

Course-material uploads accept files up to **50 MiB each**, including PDF, Word,
PowerPoint, Excel and text files. Multiple selected files are read and uploaded
sequentially to limit browser memory; failed batches retain successful uploads.
The course-upload JSON body limit includes base64 overhead; other API body limits,
chat attachments, Schedule imports and manual Office-editor imports are unchanged.
PDF originals remain private and durable. Large PDFs still contribute extracted
text to retrieval, but PDFs over the existing 32 MiB encoded visual-input budget
are not sent whole to AI. Split scanned PDFs or perform OCR when no text can be
extracted. This does not add OCR or unlimited AI context.

If deployed behind Nginx or another reverse proxy, permit at least a **70 MiB
request body** for course uploads (for example, `client_max_body_size 70m;` in
the relevant Nginx location). A smaller proxy limit can reject a file before
StudyBridge receives it. Review the deployed proxy configuration before release.

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

### Registration email verification

Email/password registration uses a six-digit code delivered to the entered mailbox.
Set `REQUIRE_EMAIL_VERIFICATION=true` and configure `SMTP_HOST`, `SMTP_PORT`,
`SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` and `MAIL_FROM` privately on the server.
A domain alone does not provide email delivery: provision a mail service and complete
its sender/domain verification before activation. Keep credentials out of Git.
Use port 465 with `SMTP_SECURE=true`, or port 587 with `SMTP_SECURE=false` for STARTTLS.

Codes last 15 minutes (`EMAIL_CODE_TTL_MINUTES`, valid range >0–60), bind to the exact
normalized email and purpose, and can be used once. Resending is limited to once per
60 seconds per mailbox/purpose; five incorrect attempts require a new code. Sending
and consuming codes are serialized per mailbox in the current single Node process;
multiple application instances would need database-level conditional operations.
Changing the email clears the code input; send/error feedback retains other fields.
Missing or failed email delivery blocks verified registration with a retry message.
Production never exposes a page code, even if `ALLOW_EMAIL_CODE_FALLBACK=true`.
For isolated development only, explicitly enable this flag to use a setup fallback.
Production defaults to verification required when the requirement flag is absent;
an explicit `false` retains the previous registration mode during rollout.

Existing password logins and manual password-reset requests remain available.
Google first entry accepts Google's verified email and the same optional Plus invitation; both login and registration automatically create an ordinary account when needed.
The delivered-code password-reset API shares expiration, resend and attempt limits.

Before release: configure and verify a sender, set the requirement flag to `true`,
check the developer email status, then test real inbox delivery (including spam),
resending, incorrect/expired codes, changed addresses, successful invited registration,
and an existing account login. This branch uses isolated mail fixtures; no live mail
service has been configured and no AWS deployment is included.

Recent online times begin with successful logins and authenticated browser activity.
Visible tabs report at most once per minute while recently active; hidden tabs and
tabs idle for five minutes stop reporting. The admin list refreshes times once per
minute without replacing draft inputs. Times are approximate activity indicators,
not proof of a live connection. Older accounts show no record until their next
login or activity; historical online times are not inferred from account creation.
Only admins can view this metadata. No keystrokes, page history, or IP addresses
are stored by this feature.

## Study Area

### Settings and appearance

**设置 (Settings)** occupies the former logout position beside StudyBridge at the
top of the sidebar. It opens a full settings center: category navigation on the
left and persistent detail panels on the right, or a category list with back
navigation on mobile. **退出登录** remains inside Settings. Categories are:

- **账号与资料:** edit name, school, major and SB ID with explicit save; inspect the
  login email and open avatar/cover management. Existing avatar/cover images are retained on text saves.
  New accounts (email or Google) receive an eight-character alphanumeric SB ID on
  the server during registration. Custom SB IDs accept 1–8 ASCII letters/digits,
  are case-sensitive and unique; classmate requests use the exact case, including
  single-character IDs such as `1`. Saving other profile fields preserves an omitted SB ID.
  School fields in Profile and Settings suggest full names from the bundled catalog
  when typing a name, abbreviation (such as UofT/UBC) or Chinese alias. Select by
  click or arrow keys and Enter; unlisted schools can still be entered manually.
- **账号安全:** Google-first accounts can add a StudyBridge website password after a
  Google sign-in within the last ten minutes; older or legacy sessions prompt a
  fresh Google login. Accounts with a website password must supply their current
  password to change it. The password is 8–128 characters and must be confirmed.
  Google and email/password sign-in continue to use the same account, SB ID and
  saved data. Saving rotates the current session and invalidates other sessions;
  Google remains linked. Forgotten passwords retain the creator-assisted recovery
  flow. Password fields clear on close/category change and are never auto-saved,
  exported, cached in browser storage, or returned by the API.
- **邮箱授权:** connect/reconnect or unlink one Gmail and one Outlook/Microsoft 365
  mailbox, with explicit read-only inbox/AI consent. Authorization feedback and
  extracted learning notices appear in the separate **邮箱助手** destination.
  Schedule additions require review and confirmation; see the mailbox setup guide.
- **学习与 AI:** change independent English-term, English-answer and Chinese-explanation
  choices plus custom instructions. Uses the same serialized saver as the Study
  Area sidebar, with automatic save, synchronized controls and failure/retry status.
- **个性化** (previously 外观与显示): choose the default **黑白简约** book-and-bridge
  logo or its **蓝紫 · 薄荷青** alternative. Logo previews, the sidebar and the browser
  tab update together, with the choice saved per account and included in preference
  exports. Logo selection remains available in dark mode. Separately, keep the blue/green
  interface default or choose 烟紫灰, 石墨灰, 雾蓝灰,
  灰玫瑰, 青瓷灰, 冷银灰 or **黑白灰简约** for daytime. The new monochrome option
  matches the homepage's white content panels, light-gray background, charcoal
  controls and thin frames, keeping the seven original palettes. Calendar/status
  meanings and authored document/slide/cell colors are retained. The independent **黑夜模式** switch applies
  暮色深灰 (charcoal surfaces and champagne accents); switching it off restores
  the selected daytime palette. All choices preview immediately and save to the
  account. The six main destinations share outline icons and a rounded selected
  row with a filled icon, while retaining their existing order and layout.
- **课程与提醒:** open course/document management and the timetable; distinguish
  available in-app reminders from email/system push, which is not yet available.
- **隐私与数据:** inspect profile visibility through the profile page and download
  current appearance/language/instruction choices as a JSON preference copy. This
  is not an account/course/chat export or a restore/import feature.
- **帮助与关于:** expandable usage help and the current application version.

Category switches preserve form drafts. Opening Settings and changing themes do
not rebuild the current page or interrupt attachments and active replies. Closing
and reopening Settings retains unsaved profile edits until logout. Category
definitions and panel builders in `public/settings.js` allow future expansion.

`GET /api/me/security` returns only password/Google availability, fresh-Google
verification status and a session-bound CSRF token with `private, no-store`.
`POST /api/me/password` requires the same session's token, JSON content, the current
account ID, and either the current password or a fresh Google-only session. Five
incorrect current-password attempts block further attempts for fifteen minutes
per account in the running server. Password writes compare the authenticated hash
inside the local transaction or DynamoDB conditional write, preserve unrelated
fields, and increment a credential version. Legacy users/sessions default to
version zero until a password changes. All new sessions carry that version; old
versions are rejected, including after existing email/manual password recovery.
Secrets and password hashes never appear in account responses.

`GET/PUT /api/me/appearance` stores an allowlisted theme and optional `mode: "dark"`
independently of Learning Style and profile data, in local `appearances` or DynamoDB's user-owned
`APPEARANCE` record. Existing accounts default to the original colors without a
migration. Optional browser caches are scoped by user ID. Disabling dark mode
restores the saved daytime theme; selecting the default daytime theme removes
its palette overrides. Office document/slide/cell content colors are preserved.

The Study Area mode selector sits beside the question shortcuts above the input.
Each mode supplies four editable prompts, with course introduction and deadline
summary available in every mode. Selecting a shortcut fills the question without
sending it. The selected mode is remembered in this browser per account and course;
switching modes leaves drafts, attachments, and the current reading position intact.
Course materials, account learning preferences, and the latest explicit request
continue to guide the AI response.

Each course conversation (including the legacy default) has a delete action with confirmation. Deletion removes its messages and private attachments while keeping the course, shared documents, calendar data and other conversations. A deletion marker prevents late replies or renames from resurrecting it. Deleting the last chat returns to general chat; reopening the empty course starts a fresh conversation.

The internal `Schedule & Deadlines` storage course is hidden from the study chat/course list. Saved chat selections fall back to a visible course or general chat. Its records remain intact for calendar events, personal plans, deadlines and duplicate checks; do not delete or filter it from schedule storage/API reads.

Schedule extraction retains a known date even when no clock time is supplied. Drafts use separate date/time inputs, and a date-only deadline displays its date while asking only for the missing time. A unique, explicitly worded due date in that item's evidence/notes can be recovered without treating grace-period or late-submission cutoffs as the deadline. No 09:00/23:59 time is invented; confirmation still requires a valid time before calendar saving, with existing time-zone conversion and duplicate checks unchanged.

The full agenda supports multi-select type filters alongside pending/all/completed status. An empty selection means all types; users can combine Lecture, Tutorial, assignment/deadline, Quiz, exam and personal categories. Status counts reflect selected types, type counts reflect the current status, and the month calendar remains unfiltered. Historical DDL assessments are classified by their titles (Quiz/小测/测验 and exam/test/midterm/final/考试); stored kinds and completion rules remain unchanged.

**日程 → 按课程管理日程** provides bulk editing and deletion across every month, including legacy planner entries and course-owned schedule documents. Review the number and sample of affected entries, choose not-yet-started or all entries (including history), and optionally restrict to Lecture, Tutorial, assignments/exams or personal plans. Each agenda/day item also has edit/delete actions with a single-entry scope. Bulk edits change only checked time, room/link or notes fields; single-entry edits also support title/date. Local dates and per-entry time zones survive time changes, including daylight-saving offsets; legacy entries without a time zone use UTC. Course materials and chats remain intact. Named courses group by normalized course code/name; a short code joins a full code only when its campus match is unambiguous. Unnamed personal plans remain individually manageable.

`POST /api/schedule/manage` accepts an authenticated, explicit snapshot of up to 80 `{courseId, docId}` targets and an edit/delete operation. Every batch validates ownership and schedule-document type before writing, with atomic local persistence or conditional DynamoDB transactions. The dialog prevalidates edits for the entire selection and processes larger selections in batches; failed requests retain the reviewed snapshot and retry only outstanding batches. Deleting already-removed targets is safe to retry. Concurrent DynamoDB changes return 409 instead of overwriting them. This endpoint never deletes course workspaces.

Learning Style checkboxes are independent saved **academic** preferences. The reply model first infers the current intent from the question and relevant follow-ups. Everyday conversation and practical software/product questions use the question's language without mandatory bilingual repetition; necessary terms such as API, HTTPS and BYOK remain intact. Course membership or a study-mode selection alone does not make a question academic, while academic work in general chat still follows the saved study preferences. Explicit language requests override these defaults, and mixed requests apply the study preferences only to their academic portion. Saved settings are not changed by this scope decision.

Within academic work, English answers
select English final answers/drafts; Chinese explanations select Chinese teaching
and supporting explanations. Enabling both produces Chinese teaching followed by
a concise English answer for worked academic problems, even with an
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

All six study-chat modes search the extracted text of shared materials in the
current course and attachments in the current conversation. Small collections
are supplied in full. For larger collections, the configured simple model rewrites
the question and recent user questions into up to eight short Chinese/English
search phrases, synonyms and academic terms. This extra non-stored request has an
eight-second limit, receives no source files, and falls back to the original
query if unavailable, malformed or timed out; stopping a streamed reply cancels it.
No queries or results are cached across accounts or courses.

Passages are ranked using original terms, bilingual alternatives, exact phrases,
filenames and term rarity, ignoring common filler and respecting English word
boundaries. Original terms remain in the search even when expansion fails or is
imperfect. New attachments retain priority; broad reviews also sample source
endings and middles within the approximately 60,000-character material budget.
Generated search phrases affect ranking only and never count as source evidence.
Replies should cite source filenames and must not claim exhaustive coverage when
only selected passages were supplied. Expansion improves cross-language recall
without guaranteeing that every relevant passage will be selected.

Study answers annotate uploaded-source definitions, facts, formulas and methods
beside the relevant claim or worked step, using the supplied filename/title and
the most specific supported position. New PDF uploads retain physical page indices
and exact extracted-text offsets; blank pages do not renumber subsequent pages.
Retrieval preserves page markers for the actual excerpts supplied. PDF page indices
may differ from printed page labels. New PowerPoint extraction follows presentation
order and notes relationships, falling back to XML part names when numbering cannot
be verified. These original-page/slide markers persist with newly uploaded sources;
historical sources are not rewritten or migrated.

Older sources without page metadata use visible section titles, short locating
quotes, or explicitly labeled extracted-text line/character ranges. Duplicate names
have per-request source references to distinguish them. Missing positions must not
be invented; an AI calculation or new practice question is identified as a derivation
or adaptation of the cited source, rather than something quoted from the file.
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
reproducible intermediate calculations and a final answer for each part in order.
Learning Style chooses the answer/explanation languages without shortening the
teaching: English answers plus Chinese explanations teach each part in Chinese
before its concise English exam answer. Explicit brevity, answer-only, hints,
quiz answer timing and print/time budgets still take priority. Image requests
such as `teach me` and `教我` use the complex-task model, including retained images.

For uploaded problem sets, a general teaching request covers all numbered problems
and subparts in the same response, with an initial inventory and a final coverage
summary. The guided “一步步教” shortcut explicitly requests complete coverage;
understanding checks do not stop the explanation after the first example. Explicit
single-question, hints-only, one-at-a-time and quiz requests still take precedence.
Short PDF tutoring tasks and retained multipart course sources select the complex
model even below the generic long-attachment threshold. The immediate upload's text
has priority over older background when retrieval is needed, and recent long replies
retain their completion summary for follow-up questions.

Mock-exam mode defaults to the format and structure of previously uploaded questions
available in the current conversation or shared course materials. It follows observable
question types, section order, numbering/subparts, wording, answer requirements,
marks and difficulty while creating new questions. Explicit current requirements
override these defaults; selected references take priority, otherwise relevant sources
are preferred, with recency breaking ties. Replies identify reference filenames and
important source gaps, or label format assumptions when no prior questions exist.

New chat and course-material PDF uploads retain their original bytes privately and
send bounded original PDF inputs to the model alongside extracted text, so graphs,
table layout and mathematical notation remain available across refresh/restart and
follow-ups. Native file parts survive Responses/Chat Completions fallback. Course
PDF originals live in private chunked material storage, are absent from document/
message display JSON, and are removed on source deletion or source-text replacement.
Per-request selection prioritizes immediate/named files within eight visual files
and 32 MB of encoded input; excluded sources have text-only context and must not be
claimed as visually inspected. Older uploads saved before original-PDF retention
need re-uploading to restore their missing graphics. Native PDF schema follows the
[official OpenAI file-input guide](https://developers.openai.com/api/docs/guides/file-inputs).

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

Open **Tools → Cheatsheet PDF** and choose a course to use its uploaded materials.
The selection is remembered per account; drafts, print settings and results stay
separate per course. Cheatsheet creation is available in Tools; Study Area retains
six learning modes. The workspace follows saved Learning Style and reuses
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

The Add Arrangement panel accepts ordinary-language text or voice. Describe one
or several plans, then choose AI 整理安排 and confirm the resulting editable drafts.
Relative dates use the actual current date in the browser's IANA time zone;
omitted dates use the visibly selected calendar date. Missing/ambiguous times
stay unconfirmed, explicit end times are retained, and open-ended recurrence asks
for an end date instead of guessing. Ambiguous clocks retain the recognized wording
(e.g. “12点”) and offer explicit noon/that-date midnight choices; students can also
enter a time manually. Confirming a choice retains the extracted date. After text
extraction, the review heading receives focus and scrolls into view on desktop and
mobile. While waiting, only the status updates, with a spinner, elapsed time and
cancellation; errors/cancellation/timeout preserve the input. Short text (up to 900
characters) uses the configured simple AI model; longer text retains the complex
model. Requests time out after 60 seconds on the server and 65 seconds in the
browser, and disconnecting cancels the upstream request. Existing duplicate checks
run before review and again before saving. Manual entry remains available in a collapsible form.

Direct recording uses MediaRecorder, stops at two minutes/8 MiB, and releases the
microphone on stop, cancellation, navigation, hiding or leaving the page. It needs
a secure context (HTTPS or localhost); HTTP deployments can import a voice file
or use the phone keyboard's dictation. Audio files are limited to 8 MiB. The
authenticated server forwards audio in memory to OpenAI's file transcription API,
using `OPENAI_TRANSCRIBE_MODEL` (default `gpt-transcribe`) and the existing server
API key; audio is not written to the app database. The resulting text is editable
before parsing. Permission denial, unavailable recording, cancellation and failed
transcription leave typed text intact; failed audio can be retried.
See [OpenAI file transcription](https://developers.openai.com/api/docs/guides/speech-to-text)
and [browser microphone requirements](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia).

The Schedule page accepts timetable JPG/PNG/WebP images, PDF (up to 8 MB), Word,
PowerPoint, Excel, TXT, MD, CSV, and JSON (other files up to 12 MB). Native images
and PDF pages accompany extracted text so the AI can use weekday columns and
the time axis rather than losing the grid layout. An authenticated request reads
the selected file and returns editable DDL, LEC, and TUT drafts. It does not
create a course, document, chat message, or reminder until the student confirms
selected rows. Missing dates/times remain blank for review; original evidence
and genuine ambiguity notes appear beside each draft. Standard timetable LEC/TUT
meetings default to one weekly pattern per section; DDL/exam dates stay one-off.
Missing semester boundaries no longer require editing every class occurrence.
Pending imports use compact expandable cards with selection, title/type/time,
course/location and a two-line notes preview. Expand a card for the complete notes
(including tutorial topics), evidence and editable fields. Missing required
information opens for correction; draft edits, selections and disclosure state
survive calendar navigation. A sticky selected-count confirmation bar reduces
mobile scrolling without truncating saved content or paginating the preview.

For weekly patterns, the server uses the Profile school and the extracted year,
term, campus/faculty and course codes to search the university's allowlisted
official domain. Calendar ranges are accepted only with matching year/term,
confirmed campus scope, confirmed no-class dates and consulted source URLs for
each teaching range, break or makeup day. The UI shows the sources and school
time zone. Calendar results are cached for six hours. No calendar dates are
hardcoded or guessed; an unsupported school, ambiguous scope, disabled search or
lookup failure leaves a single shared semester form for manual confirmation.
The default term is the current term only when the file omits it, with an explicit
review notice. Registry entries are in `lib/academic-calendar.js`.

Confirmation expands selected weekly patterns from the import date through the
last teaching day, excluding reading weeks, closures, holidays, exam/vacation
gaps and dates outside teaching periods. Official weekday substitutions are
supported. Review stays grouped by pattern, not by every occurrence. School-local
wall times are converted to UTC with DST handling. Up to 200 source patterns and
1500 generated occurrences are allowed. Syllabus extraction prioritizes explicit
quiz, test/midterm/final-exam and assignment dates as DDL tasks, including quizzes
held during a lecture. Missing dates/times remain editable rather than invented.
Re-imports compare saved items during review and again at confirmation. Ordinary
Lecture/Tutorial meetings match by normalized course code, kind and actual UTC
start time even when their titles differ; conflicting explicit section identifiers
remain distinct. UofT term suffixes and school-local DST conversions are normalized.
Assessments keep their titles in the duplicate key so a quiz and assignment at the
same course/time both survive, and a quiz never merges with its host lecture.

Schedule opens with a monthly calendar, a today marker, month navigation and
selectable day details. The independent chronological agenda spans every month
and offers pending (待完成), all and completed views for lectures, tutorials, assignment
deadlines and personal events. The next future event is highlighted separately;
ongoing classes and overdue, unfinished assignments remain visible. Lecture and
Tutorial meetings automatically enter the completed view at their valid end time;
legacy meetings without an end use their recorded start time. These classes have
no manual completion button. Assignments/deadlines require an explicit completion
click even after their due time. Past personal plans also remain in the pending
view until manually completed. All pending items retain chronological ordering;
the separate next-event highlight shows the next future arrangement. The same derived rule filters server AI context,
without rewriting saved meetings or relying on a background process. Desktop day
cells show event previews; narrow screens use colored dots and counts.

Students can add a personal event or course/deadline from a selected day, with
a required title/start time and optional same-day end time, course, location and
notes. Manual events use the existing private planner without requiring AI.
File import and manual entry expand on demand. Month/day/agenda navigation keeps
the manual draft and chosen upload file; marking an imported event complete
preserves its duration, school time zone and recurrence metadata. Review cards
adapt to the width of the content area, including narrow side panels.

Confirmation saves reminders in the existing per-user planner, skips duplicates,
and preserves remaining drafts if saving fails. Countdown labels refresh every
15 seconds while the page is open, without replacing the student's draft inputs.
Dates are displayed in the browser's time zone and saved as UTC instants.
AI extraction requires the server's existing `OPENAI_API_KEY` and uses
`OPENAI_COMPLEX_MODEL`. Official calendar lookup also requires `OPENAI_WEB_SEARCH`
and Responses API web search. Scanned PDFs are sent with their original pages;
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
Task-branch pushes and pull requests run syntax/assets/version checks, the full test
suite and the high-severity production dependency audit without deploying. Pushes
to `main` run these checks before the Lightsail deployment. Historical one-time
hotfix workflows are preserved in `.github/legacy-workflows` and no longer run automatically
or overwrite the checked source. Some archived definitions contain invalid YAML and are
kept only as historical references.

### Data and navigation integrity

The integrity fixes start from release `1.1.106` (`caf5c5f`) and retain the existing
JSON/DynamoDB keys and record formats; no data migration or reset is required.
Local writes use isolated drafts and publish them only after atomic file replacement.
Failed saves and rejected mutations cannot appear in later successful saves, and
readers keep seeing the last committed data while a write is pending. Local storage
still requires one application process per database file.

Account updates merge against the latest local record inside the write queue;
DynamoDB updates use conditional transactions and bounded retries against fresh
consistent reads. Disjoint profile, preference and account changes survive concurrent
saves; simultaneous changes to the same field retain the last successful value.
Cloud directory scans follow all continuation pages, including empty filtered pages.
Page loads reject outdated successes, failures and completion handlers before they
change current-page data, loading indicators or drafts.

Release review must retain these existing workflows in addition to the new failure
and concurrency regression tests:

| Area | Required regression coverage |
| --- | --- |
| Accounts | Invitations, Google integration, roles, profile images/SB IDs, preferences and admin activity |
| Study | Seven modes, general and course conversations, retained PDF/images, 50 MiB course uploads, streamed replies and cancellation |
| Schedule | File/voice inputs, calendar/time zones, duplicate and incomplete-field review, completion, existing calendar colors and three-entry date cells |
| Community | Explicit channels, anonymity, concurrent likes, search/history/reply pagination, private notices, classmates and unread messages |
| Tools | Office save/conflict/recovery, import/export, scoped AI previews/undo, generated files and images |
| Appearance | Seven daytime palettes, saved dark mode, outline navigation icons, 日程/学习 naming, desktop/mobile layouts and retained drafts |

Provider-facing tests use fixtures; live Google/email/AI connectivity and the actual
AWS deployment require separate release verification. Password-reset/email fallback
behavior is deliberately outside this integrity change, as requested by the owner.

## Important Environment Variables

Registration is open for email and Google accounts. Leave the invite blank for
**普通用户** (`membershipTier: "standard"`); a valid supplied invitation creates
**Plus 用户** (`"plus"`). Invalid, disabled or spent codes are rejected; users may
clear the field to register normally. Legacy users without an explicit tier and with saved `inviteCode` or
`inviteId` automatically resolve to Plus, even if their invitation was deleted.
An explicitly stored ordinary/Plus tier takes precedence, so administrator
downgrades are not undone by historical invitation evidence.
This compatibility rule does not rewrite credentials or other historical data.
New account tiers are persisted by the server; client-supplied tiers are ignored.
Settings, the sidebar and the admin user list show the tier. Membership is separate
from student/admin roles, and no feature or entitlement difference is enforced yet.
The obsolete `REQUIRE_INVITE_CODE` environment value is ignored, including existing
production `true` values. Email verification remains required when configured;
Google registration still verifies the Google identity. Existing-account Google sign-in reuses the same account. Both Google login and
registration create an ordinary account on first entry; no invitation is needed.
An optional signup invitation can still create Plus immediately. Concurrent first
Google logins recover the already-created verified-email account instead of making
a duplicate. Existing sign-in does not consume a supplied invitation or change its
tier; existing users redeem their code explicitly in Settings.

After signing in, open **设置 → 账号与资料 → 账号类型 → 补填邀请码** to become
Plus. `GET /api/me/membership` supplies a private, noncached, session-bound CSRF
token. `POST /api/me/membership/redeem` requires that token, JSON and the current
account ID. The account upgrade and one-use code claim commit together in a local
transaction or DynamoDB conditional transaction. Repeated requests and already-Plus
accounts never consume additional codes. Redemption changes membership/invitation
provenance only: password, Google binding, SB ID, administrator role, sessions and
learning data stay with the same account. This does not grant administrator rights,
including when redeeming an invitation whose signup role is Co-admin. The form
shows immediate success or retryable validation errors, clears on success/close,
and never stores invitations in browser storage or preference exports.

In **开发者端 → 用户**, show ordinary/Plus badges and counts, with a per-user
**设为 Plus / 设为普通用户** button. `PATCH /api/admin/users/:id/membership`
requires an administrator session, the admin-overview CSRF token, current actor ID,
a valid target tier and expected current tier. Atomic local/DynamoDB updates retain
credentials, Google bindings, roles, SB IDs, invitation history and learning data;
stale decisions return a conflict instead of overwriting a newer classification.
Record the last membership change source/time/actor privately. Administrators can
change their own membership without changing their administrator permission.
A downgraded user may still redeem a new valid code; historical codes remain spent.

User-side badges and open Settings update when membership is read or the existing
foreground activity heartbeat returns a changed tier (at most once per minute while
active). Do not rebuild the learning page or clear drafts for this update. Background
responses from an earlier account or membership request cannot overwrite a newer
local tier. Admin-list polling updates visible classifications and counts as well.


Each invitation permits one successful registration. Previously used codes cannot
be reused, even if their old usage limit was higher or they are re-enabled.

### Subscription and payment testing

Settings → **订阅与账单 / Subscription & billing** prepares a configurable CAD
monthly plan, hosted Stripe Checkout/invoice portal, period-end cancellation,
resumption and signed status updates. `BILLING_MODE=disabled` is the default;
only test keys and test events are accepted when explicitly configured. No real
charges, paid feature restrictions or changes to existing invitation/manual Plus
classification are enabled. The initial CAD 19.99/month is a test price.
See [billing setup, behavior and validation](docs/billing.md). Owner-controlled
Stripe test-account verification and separately authorized live billing remain
required before a charging launch.

### Server configuration

```text
SESSION_SECRET=replace-with-a-long-random-secret
ADMIN_EMAILS=your-real-email@example.com
OWNER_INVITE_CODE=your-private-creator-code
OPENAI_API_KEY=your-openai-api-key
OPENAI_SIMPLE_MODEL=gpt-6-luna
OPENAI_COMPLEX_MODEL=gpt-6.1-sol
```

AI routing is deterministic and favors Luna for ordinary questions, basic review,
definitions, and short readable multiple-choice/true-or-false questions, including
those asked in exam or assignment mode. Subject names alone do not escalate these
simple questions. Review/cram mode no longer automatically requires Sol. Explicit
proofs, derivations, coding, advanced mathematics, demanding analysis, long questions,
new long attachments and ambiguous/unreadable question images retain Sol. A simple
label cannot downgrade a complex or unreadable attached question. These are local
heuristics; routing adds no AI classification request and does not guarantee a fixed
overall Luna/Sol percentage or a particular cost reduction.

Accuracy takes priority over cost: a choice/true-or-false label alone is never
enough to qualify for Luna. Choice questions require a readable stem and at least
two actual options. Negation/exception traps, multiple-answer selection,
quantifiers, conditional reasoning, advanced topics/symbolic mathematics and vague
chapter-wide review retain Sol. Requests to verify or correct an answer explicitly
upgrade to Sol rather than inheriting a prior Luna route. Single-turn and background
answers receive the same instruction to check working, units, conditions and
alternatives, identify evidence gaps and avoid unsupported verification claims.
These conservative heuristics and prompt instructions reduce routing risk; they
are not an answer verifier or proof of equal model accuracy. Automated fixture
tests do not measure real answer correctness. Before deployment, compare both
models on representative course questions with independently checked answer keys,
including traps, figures and numerical problems, and review disagreements. No
fixed usage quota should override a failed quality evaluation.

Background problem sets use the same question criteria and split simple questions
from complex questions before batching. A Luna batch requires every question to
be short (at most 900 characters), readable, independent and single-part, with
bounded shared givens; multipart, dependent, visual and unclassified questions
retain Sol. Planning still uses Luna. Existing concurrency, source verification,
learning preferences, progress/restart/cancellation and selective retry behavior
remain in place. A retry re-evaluates its remaining questions using the same policy.
Brief follow-ups inherit the earlier task before applying review-mode defaults.
The amount of saved course text or old assistant output does not independently
escalate a new ordinary question.
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

Import review keeps duplicate items visible: entries fully present in the calendar are labeled and unchecked by default, regardless of timetable/syllabus upload order. Manual checkbox changes remain possible. Partly overlapping weekly patterns stay selected with existing/new occurrence counts; final batch saving skips existing occurrences. Editing draft dates, courses or teaching-period settings rechecks duplicate status without discarding explicit checkbox choices. Saved records, notes and assessments are not removed by review.

When calendar lookup fails, duplicate review can compare a bounded weekly source against its explicit dates without inventing university breaks. If source boundaries are missing, matching saved course/kind/section/weekday/clock patterns are labeled with an unverified-term notice and default unchecked only when every stated weekday has a match; unmatched weekdays remain selected. This comparison never authorizes saving an unconfirmed academic calendar.

Selected import drafts with missing or invalid title/date/time/weekday/end-time fields use amber highlighting and inline accessible explanations. A persistent footer counts affected items; confirmation opens and focuses the first issue before starting any save. Correcting fields or deselecting incomplete items clears the relevant highlights. Source review warnings remain nonblocking, and API/calendar/save errors stay visible in the preview.
