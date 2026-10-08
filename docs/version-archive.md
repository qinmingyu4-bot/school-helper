# StudyBridge Version Archive

This file records stable StudyBridge versions so a broken update can be rolled back safely.

## Policy

- Every production update should bump `package.json` version.
- Every production update should add one entry below with the version, date, purpose, and important GitHub commit IDs.
- If a release breaks the live app, restore the files from the previous stable commit or re-run the previous deployment.

## Stable Versions

### 1.0.97 - 2026-10-08

Purpose:
- Stop the login page from loading workspace-only hotfix scripts before the user is logged in.
- Update the homepage script versions from the stale `1.0.83` entry to `1.0.97` so browsers stop using old navigation code.
- Move `studybridge-direct-pages.js` behind the logged-in workspace gate so it starts only after `#appShell` is visible.
- Reduce the chance of login-page browser freezes and stale cached navigation behavior.

GitHub commits:
- `7bcfeaf824c5216c25abaf91352990efa699c3b4` - guard workspace hotfix loading until login.
- `f5329d29dfac5713405fa2b5bf32b04b29a150d3` - load stable StudyBridge entry scripts.
- `af387ea033eb9185349c3bef28753f675ce5d9ef` - bump package version to 1.0.97.

Rollback target:
- If `1.0.97` fails, restore to `1.0.96` and then re-apply only the entry-script version bump after confirming the login page is stable.

Live checks to use:
- `http://3.98.63.195:3000/` should load `/app.js?v=20261008-1.0.97` and `/google-auth-patch.js?v=20261008-1.0.97` only.
- `http://3.98.63.195:3000/google-auth-patch.js` should show `20261008-google-auth-loader-1.0.97`.

### 1.0.96 - 2026-10-08

Purpose:
- Stop the browser freeze caused by two sidebar navigation scripts repeatedly removing and recreating each other.
- Make `public/main-nav-stabilizer.js` the stable visible owner of the six student navigation entries.
- Preserve existing feature-page routing while hiding duplicate legacy navigation blocks.
- Keep sidebar scrolling responsive by removing the aggressive sidebar mutation watcher.

GitHub commits:
- `dd3c0d2e458689bdbdec68deabf83b3d439fc47f` - replace the sidebar navigation stabilizer with a non-looping version.
- `b50cb7f1e332ae3efe7adac9cf069f1daca947ee` - bump package version to 1.0.96.

Rollback target:
- If `1.0.96` fails, restore the repository to `1.0.95` or the last commit before `dd3c0d2e458689bdbdec68deabf83b3d439fc47f`, then let the AWS auto-sync pull it.

Live checks to use:
- `http://3.98.63.195:3000/main-nav-stabilizer.js` should show `20261008-main-nav-stabilizer-1.0.96`.
- `http://3.98.63.195:3000/google-auth-patch.js` should load `main-nav-stabilizer.js?v=20261008-1.0.96`.

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
