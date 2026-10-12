# Changelog

## 2026-10-11

- Prepared the user-approved `1.1.66` production release through the existing main-branch deployment workflow, including the tested `1.1.59`-`1.1.66` updates. Recorded feature commits, verification, and the previous `1.1.58` rollback target in the version archive; private local data and credentials remain excluded.

- Updated to `1.1.66`: reduced Study Area AI reply text from 16px to 15px on desktop and from 15px to 14px on mobile, with proportionally smaller headings. Retained paragraph spacing, padding, visible reply boundaries, and the existing font families. All 42 automated tests and asset checks passed; verified readable layouts without overlap or overflow at 1440px, 1100px, 390px, and 320px.

- Updated to `1.1.65`: render Study Area AI replies with semantic Markdown headings, lists, quotes, code blocks, and source links. Fixed double-converted links that exposed HTML attributes; historical and streamed replies use the same formatter.
- Increased paragraph and section spacing and responsive reply padding, with 16px desktop and 15px mobile text. Retained visible AI reply boundaries, compact user bubbles, pinned bars, and existing composer dimensions; wide tables and code scroll within the reply.
- Bundled pinned `markdown-it` 15.0.2 locally with its dependency licenses and a reproducible vendor script. Raw HTML, unsafe link protocols, and remote tracking images are not rendered.
- All 42 automated tests and JavaScript/asset checks passed, including incomplete streamed Markdown, safe links, and browser/server renderer parity. Verified screenshots at 1440px, 1100px, 390px, and 320px, plus streaming, stop-generation, course isolation, sidebar positions, learning modes, and latest-message scrolling. Dependency audit reported zero vulnerabilities.

- Updated to `1.1.64`: stream Study Area AI answers through authenticated SSE rather than waiting for a complete response. Added a shared UTF-8/event reader, animated stage indicators, and a stop-generation control; forward answer text only, with actual preparation/search/integration/generation/save states instead of internal reasoning.
- Retained JSON compatibility for Tools and older clients, existing prompts and attachments, final conversation persistence, and isolated in-flight replies per account/course. Canceled, failed, and truncated replies retain their received text with an interrupted marker; disconnects cancel upstream work, partial output is never retried into a second answer, and requests have a timeout and bounded reply buffers.
- Preserved drafts, sidebar positions, pinned reminders, and compact reply formatting during updates. New requests/first answer text scroll to the latest message; subsequent chunks follow the bottom unless the student scrolls up. Added reduced-motion support and ordinary HTTP compatibility.
- All 36 automated tests passed, including split UTF-8/CRLF, both AI streaming protocols, incremental delivery before persistence, authentication/isolation, early fallback, interruption, and cancellation. Verified chunked HTTP browser behavior and screenshots at 1440px, 390px, and 320px, plus existing mode/sidebar/layout regressions. A live local AI check delivered 39 text chunks, with the first text at about 2.5 seconds and completion at about 3.3 seconds; its temporary course was removed afterward.

- Updated to `1.1.63`: preserve sidebar scroll position through course-switch loading and completed renders, scoped to the same account, mode, and page. Preserve the shared page scroll on mobile without carrying study positions into other pages.
- Verified switching both directions and reselecting the current course at 1440x900, 1100x600, and 390x844, plus mode changes and page navigation. New courses still show the latest conversation; pinned reminders, drafts, attachments, and automatic scrolling for new requests/replies passed desktop/mobile regression checks. All 26 automated tests and JavaScript/asset checks passed.

- Updated to `1.1.62`: unified product typography with self-hosted Inter Variable and Noto Sans SC, lighter controls/labels, and consistent chat fonts. Bundled the OFL licenses and font source/subsetting notes; the Chinese asset covers GB2312 ideographs with platform sans-serif fallback for rarer characters.
- Added WOFF2 delivery and immutable caching for versioned font assets, preloaded fonts, and preserved latest-message positioning after asynchronous font loads unless the user starts reading older messages.
- Verified actual bundled Latin and CJK glyph rendering, consistent headings/buttons/form controls across student and developer pages at 1440px and 390px, delayed-font scroll behavior, and existing 320px-1440px conversation layouts. All 26 automated tests passed, including font signatures, MIME types, caching, and missing-font responses.

- Updated to `1.1.61`: added a light gray AI reply background, a visible fine outline, and a muted green left edge to separate replies from the white conversation surface while retaining compact padding, paragraph spacing, and independently scrolling nested tables.
- Verified reply/background separation at four desktop/mobile widths, no overlap or overflow, compact questions, nested tables, pinned reminders, and newest-message scrolling; all 26 automated tests and JavaScript/asset checks passed.

- Updated to `1.1.60`: compacted Study Area questions into content-sized right-aligned bubbles, presented AI responses as unframed text, constrained reading width, and tightened paragraph spacing with smaller role markers and neutral text on a white conversation surface.
- Replaced descendant-wide message box styling with direct-child rules so nested answer tables no longer acquire extra cards; added scoped table typography and horizontal scrolling, and kept mobile question alignment consistent with desktop.
- Verified compact 48px short questions, paragraph spacing, long questions/URLs, escaped markup, wide tables, no overlap or page overflow at 1440px, 1100px, 390px, and 320px; rechecked pinned reminders, draft/attachment preservation, mode selection, and newest-message scrolling. All 26 automated tests and JavaScript/asset checks passed.

- Updated to `1.1.59`: display the Courses, Course Materials, and Learning Style sidebar sections only inside the Study Area. Other student pages keep the profile and primary navigation without study-specific controls; returning to the Study Area reveals the existing course data and saved preferences. Developer-side hints remain unchanged.
- Verified direct entry, navigation, refresh, Study Area re-entry, and developer/student switching at 1440px and 390px; all 26 automated tests and JavaScript/asset checks passed.

- Updated to `1.1.58`: standardized workspace page headers on the Study Area's compact size (54px height, 22px title, shared spacing), including Community, Classmates, Schedule, and Tools. Reduced the back button and retained page guidance as title tooltips and accessible descriptions; removed conflicting mobile Classmates header sizing.

- Updated to `1.1.57`: moved Email Assistant from the sidebar into Tools alongside Docs, Sheets, and Slides; retained email drafting and copying, remembered the selected tool, and redirected legacy email links to the new location. Aligned the wrapping tool selector with the workspace content.
- Preserved email inputs and generated replies when switching tools or copying a reply. Verified 1440px and 390px layouts, drafting/copying with an isolated AI response, tool switching, refresh selection, and legacy redirects; JavaScript and asset checks passed.

- Released `1.1.56` after live AI upload testing found a PDF parser failure caused by pooled Buffer offsets. Copied PDF bytes into an independent zero-offset array for both document uploads and chat attachments, and added repeated HTTP upload regression coverage.
- Verified actual AI extraction using generated PDF, DOCX, XLSX, and CSV samples: exact DDL / LEC / TUT timestamps, a missing-time warning, no reminder creation before confirmation, and three confirmed reminders with countdowns retained after page reload in the local preview account.

- Released `1.1.55` with a full-width Schedule layout, compact file selection and import steps, a collapsible manual form, and a primary reminder list with a clear empty state and completed-items disclosure.
- Added responsive review cards and form spacing based on available content width; preserved manual drafts and disclosure state through page updates and verified desktop, narrow-panel, and mobile layouts alongside the existing import workflow.

- Added Schedule file imports for PDF, Word, PowerPoint, Excel, and text formats, with an authenticated AI extraction endpoint scoped to the selected file.
- Added editable DDL / LEC / TUT review drafts with source evidence, ambiguity warnings, selection, and cancellation. Reminders are created only after confirmation; incomplete dates/times require correction, duplicates are skipped, and remaining drafts survive partial save failures.
- Added manual reminder types and continuously refreshed countdowns, UTC persistence, browser timezone guidance, complete document extraction with an explicit long-document limit, and Excel cell/shared-string reconstruction.
- Released `1.1.54`; verified PDF/Office/text API extraction with isolated AI transport, confirmation and persistence in desktop/mobile browsers, duplicate handling, and input validation. Real AI extraction quality still depends on the configured service and source document.

- Added seven current-platform Study Area workflows based on the original presets: preview, guided learning, review, assignment help, mock exams, cheatsheet creation, and exam cramming, without restoring legacy UI or scripts.
- Added four full-question shortcuts per mode and shared course/deadline shortcuts in the compact composer; mode changes preserve the draft, attachments, and reading position.
- Remembered the selected mode per signed-in account and course in the local browser, and passed the selected workflow to backend AI instructions while preserving explicit requests and learning preferences.
- Bumped StudyBridge Cloud to `1.1.53` and refreshed entry asset versions. Existing fixed-bar spacing and newest-message scrolling remain unchanged.
- Added shared browser/server configuration checks and isolated AI transport tests covering all seven workflows, learning preferences, course evidence, chat persistence, and both AI request formats without contacting external AI services. Verified desktop/mobile mode shortcuts, selection memory, preserved drafts/attachments, and a 101px composer locally.

## 2026-10-10

- Released StudyBridge Cloud `1.1.52` with full-window classmate conversations, responsive message layout, and back navigation preserving drafts and reading position.
- Added real-time direct-message updates with authenticated server events and automatic reconciliation, persistent unread counts, and latest-conversation ordering.
- Added peer avatars and names to incoming messages, with clickable public profiles showing school, major, and SB ID; messages received while viewing a profile remain unread.
- Corrected legacy classmate request endpoints and response handling, and added local and DynamoDB read-receipt and messaging integration coverage. Local test accounts and data are excluded from deployment.
- Enforced single-use invitations for new and existing codes, removed the usage-count setting, and made invitation redemption and account creation atomic for email and Google registration in local and DynamoDB storage.
- Added confirmed invitation deletion to the creator console with admin-only API access, local and DynamoDB persistence, and preservation of existing users and password reset requests.
- Displayed ordinary-task and complex-task model configuration separately in the creator console, clarified that AI connectivity checks probe only the ordinary-task model, and updated the health request for GPT-6 compatibility.
- Aligned local AI model configuration and documented setup with GPT-6 Luna and GPT-6.1 Sol.
- Reorganized creator-console invitations and users into responsive full-width lists, labeled invitation fields, separated row actions and user statistics, and wrapped long account details without overlap.
- Corrected creator-console AI status details and distinguished an unconfigured AI service.
- Released StudyBridge Cloud `1.1.51` with the reviewed Study Area scrolling and compact fixed-bar improvements; updated the entry script version to refresh browser caches.
- Reduced the Study Area composer height with a compact input row and quick prompts, moved upload guidance to the attachment tooltip, and added breathing room to deadline notifications.
- Dismissed signed-in notification toasts without rebuilding the page, preserving draft questions and focus while typing.
- Compacted the fixed Study Area course header and deadline banner, and kept quick prompts on one horizontally scrollable row to leave more height for conversations.
- Kept the Study Area deadline banner and composer visible while chat history scrolls independently.
- Opened, reopened, refreshed, and switched course conversations at the newest message.
- Scrolled to new requests and completed AI replies, including when sending from an older history position.
- Preserved the reading position when attachments or other unchanged chat UI are rendered; verified desktop and mobile layouts.
- Recorded the project owner's preference to update related source, documentation, and changelog and sync completed changes to GitHub automatically.
- Bumped StudyBridge Cloud to `1.1.50` and reconciled local source with the existing Git history.
- Excluded private database backups, caches, and local verification copies from commits.
- Updated ZIP and email dependencies to versions with no reported npm audit vulnerabilities.
- Made local database saves atomic, preserved corrupt files, and recovered the write queue after rejected operations.
- Blocked static paths outside the public directory and returned proper errors for malformed requests.
- Corrected creator console database status, auto-sync status, and invitation usage fields.
- Fixed mobile spreadsheet and creator-console overflow and kept the chat composer from covering content.
- Added syntax and integration checks before deployment and locked dependency installation.
- Archived historical one-time workflows, including invalid definitions, to prevent source rewriting after pushes.

## 2026-10-07

### Added

- Bumped StudyBridge Cloud to `1.0.24`.
- Made the older student router delegate sidebar clicks to the stable router so Community, Classmates, Email Helper, Schedule, Study Area, and Profile no longer get intercepted into a blank workspace.
- Bumped the sidebar routing script URLs to force browsers and the AWS server to load the corrected navigation bundle.
- Bumped StudyBridge Cloud to `1.0.23`.
- Fixed the student sidebar router so Profile, Community, Classmates, Email Helper, Schedule, and Study Area open their target workspace immediately instead of leaving the right panel blank.
- Restored the shared `studybridgeDirectOpenPage` navigation hook used by the later stability scripts.
- Bumped StudyBridge Cloud to `1.0.22`.
- Disabled the legacy sidebar router and old student navigation hardening scripts that were still loaded by the live page and could blank the right workspace when opening Community, Classmates, Email Helper, Schedule, or Profile.
- Added a safe no-op `nav-dashboard-stability.js` so the live page no longer receives HTML for a missing JavaScript file.
- Bumped StudyBridge Cloud to `1.0.21`.
- Added an early final student router so Profile, Community, Classmates, Email Helper, Schedule, and Study Area open from the sidebar before older patch scripts can hide the workspace.
- Reduced old sidebar router loading from the compact patch bundle to prevent blank right-side pages after navigation.
- Bumped StudyBridge Cloud to `1.0.16`.
- Added a final student page shell router so Profile, Community, Classmates, Email Helper, Schedule, and Study Area cannot be hidden by older navigation patches.
- Added a fallback Profile page with account-saved profile editing so the profile entrance still works even if older profile UI scripts fail.
- Bumped StudyBridge Cloud to `1.0.15`.
- Restored the developer console entrance after the student navigation hardening added in the `1.0.13` line.
- Added a developer access guard so student page restore/navigation loops cannot hide the admin panel.
- Bumped StudyBridge Cloud to `1.0.14`.
- Added server-side local database backup checks and automatic JSON backups for the local file database.
- Added developer system-status cards confirming account-based data persistence and latest backup time.
- Bumped StudyBridge Cloud to `1.0.13`.
- Fixed secondary student pages so Community, Classmates, Email Helper, Schedule, and Profile render inside the shared workspace shell instead of being hidden with the Study Area container.
- Bumped StudyBridge Cloud to `1.0.12`.
- Fixed the student page shell so Study Area no longer stays forcibly visible over Profile, Community, Classmates, Email Helper, or Schedule.
- Added a stronger active-page guard so older layout patches cannot visually cover secondary pages with Study Area.
- Bumped StudyBridge Cloud to `1.0.11`.
- Added a final navigation stability layer so Community, Classmates, Email Helper, and Schedule open directly from Study Area.
- Added repeated cleanup for duplicate Schedule dashboard cards so the "Next Due" reminder only appears once.
- Bumped StudyBridge Cloud to `1.0.10`.
- Hardened student feature navigation so Community, Classmates, Email Helper, and Schedule cannot be pulled back to Study Area by older patch loops.
- Prevented repeated Schedule dashboard cards when the planner scripts are loaded through multiple patch bundles.
- Bumped StudyBridge Cloud to `1.0.9`.
- Added a direct sidebar router so Community, Classmates, Email Helper, and Schedule open from Study Area without being blocked by older page patches.
- Bumped StudyBridge Cloud to `1.0.8`.
- Updated the public entry scripts so the live site loads the latest student navigation fix instead of cached older helpers.
- Bumped StudyBridge Cloud to `1.0.7`.
- Stabilized the student sidebar navigation so Community, Classmates, Email Helper, Schedule, and Study Area open directly without flicker or needing another page first.
- Bumped StudyBridge Cloud to `1.0.6`.
- Reworked the Study Area into a native viewport shell so the chat history scrolls through the browser's own scroll container instead of intercepted wheel events.
- Bumped StudyBridge Cloud to `1.0.5`.
- Added ChatGPT-style progressive assistant reply typing in the Study Area.
- Bumped StudyBridge Cloud to `1.0.4`.
- Added Study Area attachments: upload button, screenshot paste, drag-and-drop, image vision input, PDF/text extraction, and file metadata support.

## 2026-10-07

### Fixed

- Bumped StudyBridge Cloud to `1.0.3`.
- Made the student sidebar navigation open Study Area, Community, Classmates, Email Helper, and Schedule directly from any student page without needing to click Email Helper first.

## 2026-10-07

### Fixed

- Bumped StudyBridge Cloud to `1.0.2`.
- Restored vertical scrolling in the developer console without changing the student learning area layout.

## 2026-10-07

### Changed

- Bumped StudyBridge Cloud to `1.0.1`.
- Adopted the rule that each shipped update should bump the app version so the developer system status can confirm the deployed build.

## 2026-05-08

### Added

- Added a local server start command so StudyBridge can be opened at `http://127.0.0.1:5173`.
- Documented that the local server uses the same static app files as the direct `index.html` version.
- Added a macOS `start.command` launcher so the app can run locally without npm.
- Changed study-mode quick prompts into a slide-out drawer so mode-specific shortcuts are easier to notice.
- Kept the quick prompt drawer open after selecting a shortcut until the user manually closes it.
- Added per-course Past Chats keyword search across titles, messages, and image attachment names.
- Added an assignment assistance study mode focused on prompts, rubrics, task breakdown, and draft checking.
- Added quick prompt drawer controls to clear only the current typed text and reopen shortcuts after closing.
- Reduced the quick prompt drawer height for a slimmer toolbar-style layout.
- Replaced composer action glyphs with cleaner SVG icons for trash, image upload, and send controls.

## 2026-05-07

### Added

- Added Semester Courses so each course has its own Course Pack, Past Chats, and study workflow section.
- Added a welcome cover page that appears on each app open before entering the workspace.
- Added Semester Course deletion with cleanup for that course's Course Pack and Past Chats.
- Added customizable Learning Style controls for bilingual teaching preferences.
- Added fast and thoughtful AI answer modes, including visible thinking time and expandable high-level thinking directions.
- Added browser-local preference memory that adapts to English-answer, Chinese-explanation, problem-solving, and cheatsheet usage signals.
- Added image attachments in the chat composer with local preview and saved conversation history.
- Added drag-and-drop plus paste support for screenshot/image attachments in the chat composer.
- Added local Course Pack persistence for extracted text from uploaded and pasted course materials.
- Added local conversation history with session switching and browser-local memory.
- Added answer generation that can reference recent past conversations.
- Added cheatsheet support for compact exam-facing study sheets.
- Added urgent exam review mode focused on minimum knowledge, question patterns, and how to solve problems quickly.
- Added browser-local PDF text extraction with PDF.js for readable PDFs.
- Added fallback guidance for scanned PDFs that do not contain selectable text.

### Changed

- Reframed the app away from assignment completion and toward full-course learning support.
- Replaced the previous mode set with preview, guided study, review, mock exam generation, course overview, and deadline summary.
- Updated prompts and default goal to focus on understanding the course, keeping pace, preparing for exams, and planning deadlines.
- Refined the visual design with a richer workspace sidebar, chat history list, and stronger study-mode controls.
- Updated coaching responses to explain concepts in Chinese while preserving English exam terms and English answer formats.
- Changed the welcome cover behavior so it appears once per day after the user clicks start, instead of on every refresh.

### Added

- Added mock question generation for standalone questions and full midterm/final-style practice exams.
- Added deadline summary behavior for syllabus schedules, exam dates, due dates, and preparation checkpoints.
- Added course overview responses that introduce what the course is like and how to study it.

## 2026-05-04

### Changed

- Repositioned the product for international students in North American schools.
- Replaced the Chinese classroom teacher persona with an academic coach style.
- Updated the interface language around syllabus, rubric, assignment, office hours, quiz prep, and academic writing.
- Adjusted the visual style to feel more like a modern campus productivity tool.

### Added

- Added Course Pack upload and paste workflow.
- Added the first study mode set for course support workflows.
- Added course material type detection for syllabus, rubric, assignment, and lecture notes.
- Added quick prompts for common North American college study workflows.
