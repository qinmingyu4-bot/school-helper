# StudyBridge Version Archive

This file records stable StudyBridge versions so a broken update can be rolled back safely.

## Policy

- Every production update should bump `package.json` version.
- Every production update should add one entry below with the version, date, purpose, and important GitHub commit IDs.
- If a release breaks the live app, restore the files from the previous stable commit or re-run the previous deployment.

## Stable Versions

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
