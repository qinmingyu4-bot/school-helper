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
- Expandable course folders with multiple independently titled chats, first-question titles and manual renaming. Course documents are shared; each chat keeps its own messages, uploads, input drafts and streaming reply. Historical course messages remain in the default conversation.
- Timetable/syllabus extraction automatically adds recognized courses and reuses existing ones; calendar entries are saved only after confirmation and filed under the corresponding course.
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

Profile avatar and cover uploads accept source photos up to 25 MiB. The browser
resizes and re-encodes them locally before saving: avatar up to 512 px/80 KiB and
cover up to 1600 px/128 KiB. Only the processed image is uploaded; originals are
not modified. The combined encoded images leave room for profile metadata in a
DynamoDB item. Transparent images receive a white background; animated images
become still images. HEIC/HEIF works only when the browser can decode it; otherwise
export a JPG/PNG first. Unsupported or oversized images show an error without
silently truncating the image data or replacing the saved profile.

Community publishing has explicit checkboxes for all, school and major channels.
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
  login email, open avatar/cover management, and request the existing manual
  password-reset workflow. Existing avatar/cover images are retained on text saves.
  New accounts (email or Google) receive an eight-character alphanumeric SB ID on
  the server during registration. Custom SB IDs accept 1–8 ASCII letters/digits,
  are case-sensitive and unique; classmate requests use the exact case, including
  single-character IDs such as `1`. Saving other profile fields preserves an omitted SB ID.
  School fields in Profile and Settings suggest full names from the bundled catalog
  when typing a name, abbreviation (such as UofT/UBC) or Chinese alias. Select by
  click or arrow keys and Enter; unlisted schools can still be entered manually.
- **学习与 AI:** change independent English-term, English-answer and Chinese-explanation
  choices plus custom instructions. Uses the same serialized saver as the Study
  Area sidebar, with automatic save, synchronized controls and failure/retry status.
- **外观与显示:** keep the blue/green default or choose 烟紫灰, 石墨灰, 雾蓝灰,
  灰玫瑰, 青瓷灰 or 冷银灰 for daytime. The independent **黑夜模式** switch applies
  暮色深灰 (charcoal surfaces and champagne accents); switching it off restores
  the selected daytime palette. Both choices preview immediately and save to the
  account. The five main destinations share outline icons and a rounded selected
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

The Add Arrangement panel accepts ordinary-language text or voice. Describe one
or several plans, then choose AI 整理安排 and confirm the resulting editable drafts.
Relative dates use the actual current date in the browser's IANA time zone;
omitted dates use the visibly selected calendar date. Missing/ambiguous times
stay blank, explicit end times are retained, and open-ended recurrence asks for
an end date instead of guessing. Existing duplicate checks run before review
and again before saving. Manual entry remains available in a collapsible form.

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

Import review keeps duplicate items visible: entries fully present in the calendar are labeled and unchecked by default, regardless of timetable/syllabus upload order. Manual checkbox changes remain possible. Partly overlapping weekly patterns stay selected with existing/new occurrence counts; final batch saving skips existing occurrences. Editing draft dates, courses or teaching-period settings rechecks duplicate status without discarding explicit checkbox choices. Saved records, notes and assessments are not removed by review.

When calendar lookup fails, duplicate review can compare a bounded weekly source against its explicit dates without inventing university breaks. If source boundaries are missing, matching saved course/kind/section/weekday/clock patterns are labeled with an unverified-term notice and default unchecked only when every stated weekday has a match; unmatched weekdays remain selected. This comparison never authorizes saving an unconfirmed academic calendar.

Selected import drafts with missing or invalid title/date/time/weekday/end-time fields use amber highlighting and inline accessible explanations. A persistent footer counts affected items; confirmation opens and focuses the first issue before starting any save. Correcting fields or deselecting incomplete items clears the relevant highlights. Source review warnings remain nonblocking, and API/calendar/save errors stay visible in the preview.
