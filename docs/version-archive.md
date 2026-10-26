# StudyBridge Version Archive

This file records stable StudyBridge versions so a broken update can be rolled back safely.

## Policy

- Every production update should bump `package.json` version.
- Every production update should add one entry below with the version, date, purpose, and important GitHub commit IDs.
- If a release breaks the live app, restore the files from the previous stable commit or re-run the previous deployment.

## Stable Versions

### 1.1.88 - 2026-10-26

Purpose:
- Compact course-material and learning-preference controls (`b6ad697`), label the instruction field 自定义要求 (`5b21033`), and send chat with Enter (`9c1d643`).
- Preserve Shift+Enter newlines, IME confirmation, empty-message guards, uploads, preference autosave and Settings synchronization.

Validation:
- Source/entry asset checks and isolated-account browser checks passed at 1440/1100/390/320px, including real note/file saves, preferences/reload, Enter sending and IME safeguards.
- Run the full tests and production high-severity audit gate before the main push, then verify GitHub deployment, runtime health and online assets.
- One existing moderate Nodemailer advisory remains; no dependency changes are part of this release.

Rollback target:
- `b8e34fe` (previous production version `1.1.87`).

### 1.1.86 - 2026-10-26

Purpose:
- Release invitation copy compatibility for HTTP pages and denied/unavailable modern clipboard access (`9308e89`). Verify copy acceptance, restore focus/selection and show honest success/failure feedback without clearing admin drafts or scroll position.
- Reuse the helper for reply copying. Exclude the unrelated, unfinished `1.1.85` appearance changes.

Validation:
- All 132 automated tests and 137-file source/asset checks passed again on the prepared release. Production dependency auditing passes the high-risk deployment gate; one existing moderate Nodemailer advisory remains outside this clipboard-only change.
- Actual disposable invitation copy/paste and exact clipboard checks passed on a non-loopback HTTP origin, for separate invitation buttons and desktop/mobile layouts.
- Recheck the release and verify GitHub check/deploy results and online copying after the authorized main push. Preserve production accounts, invitation records and credentials.

Rollback target:
- `27f1535` (previous production version `1.1.84`).

### 1.1.84 - 2026-10-20

Purpose:
- Release complete uploaded problem-set coverage and native PDF inputs (`eeb84ef`). Complete all requested questions/subparts before optional comprehension checks, preserve explicit limited-scope requests, prioritize current attachments and use the complex model for PDF tutoring.
- Retain original PDFs privately so graphs, tables and formulas remain available to the model, including later requests and streaming fallback. Existing legacy PDFs must be re-uploaded to retain their originals.

Validation:
- All 126 automated tests, 135-file source/asset checks and the zero-vulnerability production audit passed. A real streamed request using the reported AP Calculus PDF covered all 24 parts, with graph-based question 4 checked against the original. Desktop/mobile rendering passed. GitHub's production workflow and public runtime/assets are verified after the authorized main push.

Rollback target:
- `74fcb6a` (previous production version `1.1.83`).

### 1.1.83 - 2026-10-20

Purpose:
- Release the manual SB Docs, Slides and Sheets workspaces (`41db172`) with direct AI revisions to existing Docs (`20cff47`) and Slides/Sheets content (`a91d419`). Include private versioned storage, browser recovery, native Office import/export and the separate complete-file AI generator.
- Update pinned markdown-it and its self-hosted browser bundle to `15.0.3`, removing the vulnerable `15.0.2` asset and resolving the release-blocking dependency audit.

Validation:
- After the dependency upgrade, all 120 automated tests, 132-file source/asset checks, a zero-vulnerability production audit, desktop/mobile browser editing/revision checks and native downloads passed. Real-provider revisions passed on the feature branch. GitHub's production check/deploy workflow and public runtime/assets are verified after the authorized main push.

Rollback target:
- `204b67c` (previous production version `1.1.79`).

### 1.1.78 - 2026-10-16

Purpose:
- Combine mathematical typesetting and historical root-call rendering (`e023e4c`) with method-first study explanations and intermediate calculations.
- Preserve Learning Style languages, teach each part before its final answer, and route short image tutoring requests to Sol. Honor explicit brevity, hints, quizzes and output/time constraints.

Validation:
- Automated checks exercise all seven actual model prompts, Learning Style combinations, streaming, retained image tutoring routes, formula rendering and untrusted input. Deployment and real-browser answer verification follow the main push.
- All 102 tests, 115-file source/asset checks and dependency audit passed before the release push.

Rollback target:
- `fabeba9` (previous production version `1.1.77`).

### 1.1.76 - 2026-10-15

Purpose:
- Apply Learning Style to course Cheatsheet PDFs and revisions, with preference-save synchronization and explicit request precedence.
- Read retained course images as real visual inputs and preserve workspace source files, selected image names, prior requests and the last artifact for continuing revisions.
- Re-fetch current course context, inherit print settings, maintain course/account isolation, and keep source copies private across restart and version deletion.

Validation:
- Automated checks cover provider HTTP inputs, repeated revisions, changed styles, retained images/source bytes, restart and permissions. Live model/file/browser checks are recorded separately during rollout.
- All 94 automated tests, 111-file source/asset checks and a zero-vulnerability dependency audit passed. Real Sol generated a bilingual retained-image PDF and an English-only revision with the requested H=60 example; both one-page files passed print checks and independent rendering/inspection. AWS/browser verification follows deployment.

Rollback target:
- `d3c2202` (previous production version `1.1.75`).

### 1.1.75 - 2026-10-15

Purpose:
- Release detailed, concept-based academic explanations and Sol routing for short image-solving questions and follow-ups (`7f29be1`).
- Retain private question-image previews in user messages across refresh/login, with enlargement and legacy attachment backfill (`31ee951`).
- Honor independent English-answer/Chinese-explanation preferences, with accurate auto-save state and send-time synchronization (`21825d6`).
- Accept Ctrl+V screenshots with pending thumbnails while preserving ordinary/mixed text paste (`263efba`).

Validation:
- All 91 automated tests and 109-file checks passed on the feature branch.
- Local browser checks covered real image clipboard data, persisted image history, checkbox auto-save and actual English/Chinese model replies.
- Repeated release checks passed: all 91 tests, 109-file source/asset checks and zero-vulnerability dependency audit. Deployed assets, real answers, saved preferences, images and Ctrl+V are verified on AWS after rollout.

Rollback target:
- `084340b` (previous production version `1.1.74`).

### 1.1.74 - 2026-10-13

Purpose:
- Release course Cheatsheet PDF creation, content/layout revisions, private previews/downloads and native PDF-viewer printing.
- Include General Chat (`49cd5ba`, 1.1.72) and real document/image tools (`400abbc`, 1.1.73). Video remains disabled.
- Add bounded print controls, page/font/margin validation and one automatic layout repair.

Validation:
- All 78 tests, 105-file source/asset checks and zero-vulnerability dependency audit passed.
- Desktop/mobile course guidance, uploads, revisions, reload and print-link checks passed at four viewport widths.
- Production rollout/health and assets are checked separately after the authorized main push.

Rollback target:
- `ceaa4ba` (previous production version `1.1.71`).

### 1.1.71 - 2026-10-13

Purpose:
- Fix web search bypassing task model routing; ordinary questions use Luna and complex tasks use Sol deterministically.
- Preserve the selected model through retries and fallback; avoid escalation solely because saved course data or old replies are long.
- Add admin diagnostics for runtime routing and the last completed model/API request without recording question contents.

Validation:
- Confirmed pre-release AWS configuration: `gpt-6-luna`, `gpt-6.1-sol`, legacy 15% complex routing, and healthy Luna connectivity.
- All 59 tests and 94-file source checks passed before the user-authorized production deployment.
- Post-deployment runtime checks are performed separately after the main push.

Rollback target:
- `3376b97` (previous production version `1.1.70`).

### 1.1.70 - 2026-10-13

Purpose:
- Release complete saved course-text retrieval and durable chat attachments across all seven learning modes.
- Preserve full newly extracted text, retrieve relevant passages for larger collections, and keep saved attachment text/images available for follow-up questions and restarts.
- Release feature commit `f4f3b53`; preserve existing account/course isolation and production data.

Validation:
- All 54 automated tests, 92-file source checks, and targeted late-source retrieval checks passed before release preparation.
- Production deployment and public service checks are verified separately after the main push.
- Historical discarded text and filename-only chat attachments require re-upload; OCR is not included.

Rollback target:
- `b4f25ad` (previous production version `1.1.69`).


### 1.1.69 - 2026-10-12

Purpose:
- Repair scrolling in the newly released creator console with a desktop-only, independently scrollable content region.
- Retain admin scroll position during same-page renders while preserving mobile page scrolling and existing student chat containers.

Validation:
- Verified wheel scrolling into the user list, same-page position retention, mobile page scrolling, and student/admin mode transitions with isolated preview data.
- Existing user activity and invitation behavior remain unchanged.

Rollback target:
- `3264260` (previous production version `1.1.68`).

### 1.1.68 - 2026-10-12

Purpose:
- Add admin-only recent online times with relative labels and exact-time tooltips.
- Persist server-timed activity separately from profiles; throttle writes and stop heartbeats for hidden or five-minute-idle tabs.
- Preserve legacy accounts without inventing historical activity, and refresh labels without clearing form drafts.
- Release activity commit `9f0635e` (ported from tested `db2f239`) on the stable production base. Do not include the unreleased `1.1.67` Tools redesign.

Validation:
- All 47 automated tests and JavaScript/entry-asset checks.
- Isolated desktop/mobile preview, live label refresh, and retained invitation drafts.
- Existing production databases and credentials are excluded from the release.

Rollback target:
- `0e628ad` (previous production version `1.1.66`).

### 1.1.66 - 2026-10-11

Purpose:
- Release the tested Study Area sidebar visibility, reply boundaries, and self-hosted fonts.
- Preserve sidebar positions when switching courses and stream AI replies with animated status indicators and cancellation.
- Render safe Markdown headings, lists, quotations, code, tables, and source links with clearer spacing.
- Use smaller 15px desktop and 14px mobile AI reply text with proportionate headings.

Feature commits:
- `abdb261`: scope study sidebar controls to the Study Area.
- `1e01b10`, `6cd86db`: conversation layout and visible AI boundaries.
- `52bcb0b`: bundled product fonts.
- `f9d86bd`: sidebar scroll preservation.
- `434e893`: streamed replies and activity states.
- `2af1a1e`, `f76e20d`: Markdown rendering and smaller reply fonts.

Validation:
- All 42 automated tests, JavaScript/entry-asset checks, and zero-vulnerability dependency audit.
- Desktop/mobile typography, streaming/cancellation, learning-mode, draft, and scroll checks.
- Production deployment uses the existing main-branch workflow; private local data is excluded.

Rollback target:
- `1bb3322` (previous production version `1.1.58`).

### 1.1.51 - 2026-10-10

Purpose:
- Keep deadline notifications and the composer visible while history scrolls.
- Open conversations at the latest message and scroll to new requests and AI replies.
- Compact the course header and composer while retaining readable deadline notifications.
- Preserve draft questions when notification toasts disappear.
- Refresh cached entry scripts with `/app.js?v=1.1.51`.

Feature commits:
- `a5160bb`: chat scrolling and GitHub synchronization policy.
- `c3f45b3`: compact course header and fixed bars.
- `fe1a5b2`: compact composer, deadline spacing, and draft preservation.

Validation:
- Syntax and entry-asset checks, server integration tests, dependency audit,
  and desktop/mobile chat scrolling checks before deployment.

Rollback target:
- `187ad91` (previous production version `1.1.50`).

### 1.1.13 - 2026-10-08

Purpose:
- Emergency recovery after the live app became unresponsive and several sidebar feature pages stopped rendering.
- Replace the front-end entry with a single compact router for Study, Profile, Community, Classmates, Email Assistant, Schedule, Tools, and Developer pages.
- Remove competing patch-script assumptions from the live entry path and restore normal browser scrolling.
- Cache-bust `index.html` to load `/app.js?v=1.1.13`.

Files:
- `public/app.js`
- `public/index.html`
- `package.json`
- `docs/version-archive.md`

Rollback target:
- If `1.1.13` fails, restore `1.1.11` only long enough to inspect the previous router conflict, then keep one page router active.

### 1.1.11 - 2026-10-08

Purpose:
- Emergency recovery after the live page became unresponsive and sidebar navigation stopped opening pages.
- Replace the front-end app entry with a single stable router for Profile, Study, Community, Classmates, Email Assistant, Schedule, Tools, and Developer views.
- Remove the old viewport scroll locks from the app shell and workspace so the browser can scroll normally again.
- Cache-bust `index.html` to load `/app.js?v=1.1.11`.

Files:
- `public/app.js`
- `public/index.html`
- `public/style.css`
- `package.json`
- `docs/version-archive.md`

Rollback target:
- If `1.1.11` fails, restore `1.1.7` and keep only one front-end router active before adding new features.

### 1.1.7 - 2026-10-08

Purpose:
- Disable the damaged `stable-pages-router.js` and replace it with a safe no-op recovery marker.
- Add `rescue-router.js` as the single final controller for Profile, Community, Classmates, Email Assistant, Schedule, Study, Tools, and Developer page switching.
- Remove old viewport locks so the workspace and study chat can scroll instead of freezing the browser.
- Hide the developer switch from non-admin users while keeping admin/co-admin access to the developer console.
- Cache-bust all frontend entry scripts so browsers fetch this recovery build instead of stale broken code.

Files:
- `public/index.html`
- `public/stable-pages-router.js`
- `public/rescue-router.js`
- `public/google-auth-patch.js`
- `package.json`
- `docs/version-archive.md`

Rollback target:
- If `1.1.7` fails, restore `1.1.5` first, then keep only one router script active before adding new page features.

### 1.1.5 - 2026-10-08

Purpose:
- Rebuild the frozen app entry shell with valid Chinese text and complete HTML tags.
- Replace the Google auth loader with a clean loader that only adds the Google button and then loads the stable page router.
- Prepare `stable-pages-router.js` as the single owner for Profile, Study, Tools, Community, Classmates, Email Assistant, Schedule, and Developer page switching.
- Keep this as the recovery point before further feature work.

Files:
- `public/index.html`
- `public/google-auth-patch.js`
- `public/stable-pages-router.js`
- `package.json`
- `docs/version-archive.md`

Rollback target:
- If `1.1.5` fails, restore `1.1.4` files first, then check whether `public/stable-pages-router.js` exists on the server before changing page logic again.

### 1.1.3 - 2026-10-08

Purpose:
- Rebuild the main `index.html` shell after corrupted Chinese text broke multiple HTML tags and caused the workspace to freeze or render blank pages.
- Restore clean login/register fields, profile fields, study composer, quick prompts, course materials, and developer-panel anchor elements while keeping the original IDs/classes used by the existing app.
- Rebuild the Google auth loader with valid Chinese text and a fresh router cache-bust so the browser no longer loads stale or malformed workspace scripts.

Files:
- `public/index.html`
- `public/google-auth-patch.js`
- `package.json`
- `docs/version-archive.md`

Rollback target:
- If `1.1.3` fails, roll back to `1.1.2`, then inspect `public/index.html` first for malformed tags before changing router logic again.

### 1.1.2 - 2026-10-08

Purpose:
- Repair frozen navigation by making the stable page router install its click handlers only once.
- Allow every sidebar click to redraw its page, even when the app thinks that route is already active.
- Prevent stale page-opening requests from blocking newer clicks or rendering into duplicate hidden containers.
- Keep the workspace visible while switching between Study, Tools, Community, Classmates, Email, Schedule, Profile, and Developer pages.

Files:
- `public/stable-pages-router.js`
- `public/google-auth-patch.js`
- `public/index.html`
- `package.json`

Rollback target:
- If `1.1.2` fails, roll back to `1.1.1`, then keep only one router script active before reapplying navigation fixes.

### 1.1.1 - 2026-10-08

Purpose:
- Fix the stable page router boot sequence so it waits for the async workspace check before deciding it has started.
- Stop the Google/auth loader observer after the workspace router has loaded, reducing repeated DOM scanning.
- Cache-bust the frontend scripts so browsers fetch the repaired router instead of stale broken code.

Files:
- `public/stable-pages-router.js`
- `public/google-auth-patch.js`
- `public/index.html`
- `package.json`

Rollback target:
- If `1.1.1` fails, roll back to `1.1.0`, then inspect router boot timing before re-enabling old page patches.

### 1.1.0 - 2026-10-08

Purpose:
- Recover the frozen workspace by replacing competing student navigation and scroll patches with one stable page router.
- Stop the old direct-page, study-scroll, and role-boundary scripts from running MutationObserver/scroll logic against the same DOM.
- Restore a single route owner for Study, Tools, Community, Classmates, Email Assistant, Schedule, Profile, and Developer pages.
- Keep the page scroll native so Chrome can scroll normally instead of being trapped by JavaScript.

Files:
- `public/stable-pages-router.js`
- `public/google-auth-patch.js`
- `public/studybridge-direct-pages.js`
- `public/study-scroll-bridge.js`
- `public/role-boundary-strict.js`
- `public/index.html`
- `package.json`

Rollback target:
- If `1.1.0` fails, roll back to `1.0.99` only as a temporary emergency restore, then re-enable one navigation owner at a time.

### 1.0.99 - 2026-10-08

Purpose:
- Stop legacy layout, bottom-chat, dashboard, and sidebar stabilizer scripts from fighting the current page router.
- Make Google/login loader wait until the workspace is visible before loading the single direct page router.
- Remove duplicate direct-router loading from `index.html` so the left feature cards do not appear twice or freeze the browser.

Files:
- `public/google-auth-patch.js`
- `public/main-nav-stabilizer.js`
- `public/layout-fix.js`
- `public/nav-dashboard-stability.js`
- `public/study-chat-bottom-fix.js`
- `public/index.html`
- `package.json`

Rollback target:
- If `1.0.99` fails, roll back to `1.0.96`, then only re-enable one navigation script at a time.

### 1.0.96 - 2026-10-08

Purpose:
- Fix the browser freeze caused by two navigation scripts rebuilding the sidebar at the same time.
- Make the left feature navigation idempotent: it renders once, updates only when the version changes, and no longer watches every sidebar mutation.
- Keep `studybridge-direct-pages.js` as the page renderer only when the main navigation exists, so it no longer creates a duplicate navigation bar.

Files:
- `public/main-nav-stabilizer.js`
- `public/studybridge-direct-pages.js`
- `public/google-auth-patch.js`
- `public/index.html`
- `package.json`

Rollback target:
- If `1.0.96` fails, roll back to `1.0.95`, but keep in mind `1.0.95` can trigger the sidebar navigation loop under some browser states.

### 1.0.95 - 2026-10-08

Purpose:
- Stabilize the left sidebar navigation after route conflicts caused blank pages and broken feature areas.
- Disable the old `six-zone-router-equalizer` loader path.
- Add `public/main-nav-stabilizer.js` as the final owner of the six student navigation entries.

GitHub commits:
- `fadcb3ebf277851ca1544f5804166a816de7bbfb` - add stable main navigation controller.
- `8795f1e2eb93beb8b2eff73e0b2edf8097f6a017` - load stable navigation and stop loading the old six-zone router.
- `7ea34bca5ab3bd8d865fa58ff84f8f25355dfeac` - bump package version to 1.0.95.

Rollback target:
- If `1.0.95` fails, restore the repository to the last known working commit before these three commits, then let the AWS auto-sync pull it.

Live checks used:
- `http://3.98.63.195:3000/main-nav-stabilizer.js` returns the `1.0.95` script.
- `http://3.98.63.195:3000/google-auth-patch.js` includes `main-nav-stabilizer` and no longer includes `six-zone-router-equalizer`.
# StudyBridge Version Archive

### 1.1.4 - 2026-10-08

Purpose:
- Repair the frozen login/workspace page caused by a corrupted `public/index.html` shell.
- Replace broken mojibake text, malformed attributes, and damaged closing tags that made the browser parse the app incorrectly.
- Bump the frontend cache keys so Chrome reloads the repaired entry page, Google auth loader, and stable page router.

Files:
- `public/index.html`
- `public/google-auth-patch.js`
- `public/stable-pages-router.js`
- `package.json`

Validation:
- `node --check` passed for `server.js`, `public/app.js`, `public/google-auth-patch.js`, and `public/stable-pages-router.js`.
- Local server returned HTTP 200 and confirmed the repaired page includes `authForm`, Chinese login text, and version `1.1.4`.

Rollback target:
- If `1.1.4` fails after deployment, roll back to the last working version before the broken `index.html` shell was introduced, then reapply only the clean cache-bust and router changes.
