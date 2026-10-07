# Changelog

## 2026-10-07

### Fixed

- Bumped StudyBridge Cloud to `1.0.22`.
- Disabled the legacy sidebar router and old student navigation hardening scripts that were still loaded by the live page and could blank the right workspace when opening Community, Classmates, Email Helper, Schedule, or Profile.
- Kept the final inline student router as the only active student-page switcher so the left sidebar features are no longer fighting each other.

## 2026-10-07

### Fixed

- Bumped StudyBridge Cloud to `1.0.21`.
- Added an early inline student router inside the compact browser patch so Community, Classmates, Email Helper, Schedule, Profile, and Study Area clicks are handled before older navigation helpers can hide the workspace.
- Removed the older direct sidebar routers from the compact patch load path to reduce blank right-panel conflicts.

## 2026-10-07

### Fixed

- Bumped StudyBridge Cloud to `1.0.20`.
- Fixed the student navigation rescue layer so it no longer hides the whole Study Area container when opening Profile, Community, Classmates, Email Helper, or Schedule.
- Kept the right-side workspace shell visible and only hides the Study Area chat chrome, so secondary student pages can render instead of leaving a blank panel.

## 2026-10-07

### Added

- Bumped StudyBridge Cloud to `1.0.19`.
- Added a final student navigation rescue layer so Profile, Community, Classmates, Email Helper, and Schedule are shown as workspace-level pages instead of being pushed below the Study Area.
- Preserved the existing feature pages while preventing older navigation helpers from swallowing sidebar clicks or leaving a blank right panel.

## 2026-10-07

### Added

- Bumped StudyBridge Cloud to `1.0.18`.
- Replaced the aggressive student page route lock with a lightweight click-based router to prevent browser out-of-memory crashes.
- Reduced developer mode observer work so developer/student switching no longer loops over hidden/class changes.
- Bumped StudyBridge Cloud to `1.0.17`.
- Moved the student page router to the final browser patch load so Community, Classmates, Email Helper, Schedule, Profile, and Study Area are not overridden by older navigation scripts.
- Stopped the developer access helper from loading the student router early, preserving the developer/student boundary while avoiding blank student pages.
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
