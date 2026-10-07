# Changelog

## 2026-10-07

### Added

- Bumped StudyBridge Cloud to `1.0.16`.
- Added a stable student page shell router so Profile, Community, Classmates, Email Helper, Schedule, and Study Area cannot be hidden by older navigation patches.
- Kept developer access loading the new student router automatically while preserving the developer/student boundary.
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
