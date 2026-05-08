# Changelog

## 2026-05-08

### Added

- Added a local server start command so StudyBridge can be opened at `http://127.0.0.1:5173`.
- Documented that the local server uses the same static app files as the direct `index.html` version.
- Added a macOS `start.command` launcher so the app can run locally without npm.

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
- Added README documentation for the new positioning.
