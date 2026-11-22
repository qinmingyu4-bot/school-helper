# StudyBridge Version Archive

## 1.20.0 — 2026-11-22

- MINOR from main 1.19.0 (`765393483185b9a7add9798c3268a98ad96731a6`): save Study chat summaries as editable SB Docs files with DOCX export and print/PDF.
- Reuse existing private Office storage, export, and AI allowance accounting. No schema migration or new credentials. Source: `c9fdf55`.
- Verify conversation ownership, duplicate requests, reopening and exporting saved documents, GitHub Actions and live service health.

## 1.19.0 — 2026-11-22

- MINOR from AWS 1.18.0 (`9063624ebe5f887e027d3acc4d4a0d29049f8368`): add today's official AI spend and recent daily amounts directly above the creator console's existing reconciliation controls.
- Reuse the creator-only OpenAI cost report, with USD amounts and UTC reporting days. The release requires no dependency, schema or configuration changes. Source: `8fa8071`.
- Validate available, zero and missing amounts, bilingual rendering and independent range controls. Verify release policy, CI and AWS service health. Rollback code target: `9063624ebe5f887e027d3acc4d4a0d29049f8368`.

## 1.18.0 — 2026-11-22

- MINOR from AWS 1.17.0 (`f53240f596d27be2076a12aa2d71bb69ad7733a1`): add a blank A4 classroom-note source and an entry point in the Study course header.
- Reuse existing course ownership, annotation records, autosave and PDF export. No dependency or database migration. Source: `8469546`.
- Verify course isolation, blank-note save and reopen, PDF annotation regression, release policy and live service health. Rollback code target: `f53240f596d27be2076a12aa2d71bb69ad7733a1`.

## 1.17.0 — 2026-11-22

- MINOR from verified AWS 1.16.0 (`dccf21075da0e66363c77f96a98a0395ce691133`): add a dedicated Co-admin workspace for issuing and copying personal single-use Plus invitations, and remove the Co-admin weekly AI allowance cap while retaining cost reporting.
- Restrict the full developer console and its APIs to the creator email allowlist. Existing invitation-based admin accounts resolve to Co-admin at runtime without a data migration or dependency change. Source: `e3d9164`.
- Verify creator access, Co-admin isolation, single-use redemption, existing roles, allowance accounting, release policy, and live service health. Rollback code target: `dccf21075da0e66363c77f96a98a0395ce691133`.

## 1.16.0 — 2026-11-21

- MINOR from AWS 1.15.3 (`1f8968f871a8935a5c8fcb30fee23214701aaa6d`): add authenticated Office link collaboration with owner-controlled revocation and new editing tools for Docs, Sheets and Slides.
- Preserve private files and the existing library. The release uses the existing persistence layer and requires no bulk migration or new credentials.
- The owner authorized AWS deployment. Verify release classification, regression and two-account browser tests, exact deployed assets and service health.
- Rollback code target: `1f8968f871a8935a5c8fcb30fee23214701aaa6d`. Retain private configuration and user data.

## 1.15.3 — 2026-11-21

- PATCH from production main 1.15.2 (`8703228ab39001f8b5c4a860dcb8680e7cd571db`) to replace GPT-6.1 Sol on existing Sol routes with GPT-6.2 Sol.
- Preserve the existing task split, Standard-rate allowance accounting, and user data. No dependency or database migration.
- Owner authorized AWS deployment. Verify release policy, model routing, accounting, full regressions, and deployed service health. The optional live A/B evaluator uses synthetic samples and requires a test API key.
- Rollback code target: `8703228ab39001f8b5c4a860dcb8680e7cd571db`; retain private configuration and user data.

## 1.15.2 — 2026-11-21

- PATCH from verified AWS 1.15.1 (`597978125a075c569fc2899e65fd1a348c289a25`): expose the existing image deletion action within each history entry, using restrained rounded buttons and the shared application dialog.
- Preserve generation, owner authorization, file cleanup and cost records. Guard duplicate clicks, stale refreshes and account changes. No dependency or database change.
- Owner authorized direct AWS deployment. Validate deletion/cancel/error flows, browser appearance, regressions, release policy, deployed assets and health. Rollback code target is the previous commit; preserve private user data.

## 1.15.1 — 2026-11-21

- PATCH from verified AWS 1.15.0 (`f1a56e615bd0de335b4581fe6b534555defe7788`): fix automatic mailbox analysis implicitly enabled by binding and unnecessarily expensive mail routing.
- New and legacy connections require a separate explicit opt-in; retained data and reminders remain intact. Luna handles routine mail tasks. Consent changes retain leases, queue progress and failure backoff.
- No dependency or destructive database migration. Validate local/DynamoDB lifecycle, HTTP/model routing, complete regression suite, release policy, browser settings and deployed version/health.
- Rollback target: `f1a56e615bd0de335b4581fe6b534555defe7788`; retain all private data. Rolling back also restores the former implicit-analysis behavior, so pause the mailbox worker in private configuration first if rollback is necessary.

## 1.15.0 — 2026-11-21

- MINOR from verified AWS 1.14.2 (`96f9d42e3eb36929049df1980d98f703a8473b00`): add default Office file libraries combining native and AI-generated work, first-card blank creation, search/source filters and lazy thumbnails.
- Preserve editing, explicit saves, recovery drafts and account isolation. Fix stale cloud content on reopen and serialize pending library transitions to protect new edits from late responses.
- The owner authorized AWS deployment after regression checks on 2026-11-21. Verify full tests, real browser workflows, release policy, exact deployed assets and service health. No new dependencies or database migration.
- Rollback code target: `96f9d42e3eb36929049df1980d98f703a8473b00`; retain all private configuration and user files.

## 1.14.2 — 2026-11-21

- PATCH from AWS 1.14.1 (`0c0bd96beb901224278ab0d5e6bce90785c0792d`). Fix existing cost reporting, attribution and avoidable background calls.
- Official totals remain separate from locally priced feature amounts. Historical days, the installation day and subsequent differences are independent and preserve signed values; provider daily buckets cannot split the installation day by hour.
- Existing paid API routes keep durable tracking; unknown generation routes fail before dispatch. Mailbox results now retain content-free deduplication markers for irrelevant mail too. Opening admin does not call a model; explicit diagnostic checks still work.
- Preserve all ledger/history/private configuration and automatic reminders. Validate accounting, UI, mailbox local/Dynamo restart behavior, source assets, full regressions and release policy.

## 1.14.1 — 2026-11-20

- PATCH from verified AWS production 1.14.0 (`14a317a55b30560527947baf478f9f070e9ae4b7`): reduce startup waits in existing Docs, Sheets and Slides with low-priority public preloading, overlapping requests, short-lived account-scoped metadata reuse and immutable editor caching.
- Preserve draft priority, version conflict checks, successful-save invalidation, account isolation and data-saver behavior. No new features, dependencies, private data migration or quota changes.
- The owner authorized deployment on 2026-11-20. Validate full regressions, source/assets and release policy, then verify deployment status, exact assets, immutable caching and service health.
- Rollback code target: `14a317a55b30560527947baf478f9f070e9ae4b7`; retain all user data.

## 1.14.0 — 2026-11-20

- MINOR from verified AWS production 1.13.0 (`f59ccfb2e2c204b876061554be1d89e6fafbbfa1`): add durable platform/account gross-spend controls, developer-only failure attribution and persistent official cost history.
- Make calendar discovery demand-driven during timetable import/explicit term matching, share verified scope archives, and retain automatic reminders without AI. Fix interrupted/error usage accounting and remove blind paid fallbacks.
- Measure audio duration and estimate image settings/reference inputs before dispatch. Keep personal failure refunds separate from provider expenses. Official consumption, local estimates, unknowns and cash funding remain distinct.
- The owner authorized AWS deployment in this chat on 2026-11-20. Preserve private credentials, user data and all cost records. No destructive migration or student technical popup.
- Validate source/assets, full regressions, release policy and dependency audit, then verify AWS version/health and authenticated cost reports. Rollback code target: `f59ccfb2e2c204b876061554be1d89e6fafbbfa1`; retain new ledger/guard/archive data.


## 1.13.0 — 2026-11-20

- MINOR from verified AWS production 1.12.9 (`69ecb54a9eb8b8534e78a5e4c85188621fca1171`): add independent durable user/platform AI cost accounting, six total-cost periods and optional official reconciliation.
- Preserve automatic calendar updates and push reminders while caching official sources, routing validated simple extraction to Luna, keeping complex verification on Sol, and saving retry state across restarts. Reuse relevant material evidence without downgrading learning answers.
- Skip unchanged Google/SMTP/payment configuration restarts, regardless of line order. Preserve the production refund and concurrent chat-loading fixes. Added cost/refresh records are retained; no user-data migration or credential change.
- Validate merged regressions, source/assets, release policy and deployed version/health/accounting. Rollback code target: `69ecb54a9eb8b8534e78a5e4c85188621fca1171`; retain all user data and new ledger records.

## 1.12.9 — 2026-11-20

- PATCH from verified production 1.12.8 (`89b1af32f060641348053e7831c41005c4dc794c`): reduce existing course-chat loading latency by starting conversation discovery, saved history and background-task state together instead of three serial reads.
- Reuse the prefetched task snapshot without a duplicate request; resolve deleted saved conversations against the directory before displaying history. Retain account/course guards, cache restoration, retry behavior and independent material/calendar loading.
- Validate parallel request starts, deleted-chat fallback, stale responses and task polling. At a controlled 150 ms per-request delay, three complete-load runs improved from 455–456 ms to 151 ms; this is a simulated latency benchmark, not a production timing guarantee. No new features, dependencies or data migration.
- Rollback code target: `89b1af32f060641348053e7831c41005c4dc794c`; retain user data.

## 1.12.8 — 2026-11-20

- PATCH from verified production 1.12.7 (`2d490fda72651809c8a79d398631add28bb53c45`): fix interrupted-request allowance accounting and refund linked failed creative jobs exactly once.
- Retain latest course navigation and composer behavior. Only traceable charges are refunded; legacy aggregated charges remain for review. No blanket compensation, account reset or price/model changes.
- Add lazy per-job accounting metadata for new creative work; preserve existing ledger data and deployment backups. Validate full regressions, release policy and exact deployed assets.
- Rollback code target: `2d490fda72651809c8a79d398631add28bb53c45`; keep current user data. Older code retains the new metadata but does not provide the refund guarantees.

## 1.12.7 — 2026-11-20

- PATCH from verified production 1.12.6 (`958a9a3fde1d5750be985cc1c5c161f38c9a734c`): complete existing course navigation fixes by keeping loaded empty chats stable, closing mobile course navigation immediately and avoiding a redundant directory fetch for known courses.
- Load materials and calendar independently of chat history, patch only their display regions, and retry material failures without interrupting chat. Preserve the composer node, focus and selection when the same chat renders.
- Validate navigation/error/slow-resource regressions, real browser input with 15-second auxiliary delays, source/assets and release policy. No new features, dependencies or data migration. Rollback code target: `958a9a3fde1d5750be985cc1c5c161f38c9a734c`; retain all user data.

## 1.12.6 — 2026-11-20

- PATCH from production 1.12.5 (`3dc6e8b697f9278dbef97960f46d17633188e764`): repair existing controls across pages. Prevent repeated clicks selecting button/disclosure labels, remove pointer-only focus rings after Office dropdown dismissal, and align single-select arrows with consistent inset and text spacing.
- Preserve selectable body/editor text, keyboard focus, native listboxes, account palettes and dark mode. No new features, dependencies, configuration changes or data migration.
- Validate Chrome/WebKit interactions and responsive themes, source/assets and release policy; verify deployment health and exact public assets. Rollback code target: `3dc6e8b697f9278dbef97960f46d17633188e764`; retain user data.

## 1.12.5 — 2026-11-20

- PATCH from verified production 1.12.4 (`628321680af4b5b9677ecda0b80bfe405e9f50f2`): repair existing sign-out and post-login notification workflows and strengthen existing health diagnostics.
- Preserve current default-chat/history loading, account data and private configuration. No new product features, dependencies or migrations.
- Validate merged full regressions, readiness faults, source/assets and release policy; verify exact deployed assets and HTTP health after the authorized AWS deployment.
- Rollback code target: `628321680af4b5b9677ecda0b80bfe405e9f50f2`; retain all user data.

## 1.12.4 — 2026-11-20

- PATCH from verified production 1.12.3 (`415e033cb7da52f20d6f5bdceb4a4ba4ff576ab0`): show the implicit default chat immediately for unvisited courses and refresh the folder before history and schedule finish loading.
- Preserve recent per-account/per-conversation history while switching courses; show explicit loading and retry states instead of a false empty welcome. Deduplicate empty-course conversation creation and retain deletion semantics.
- Validate new-course browser clicks, slow/failed navigation regressions, history isolation, source/assets and release policy. No new features, dependencies or data migration. Rollback code target: `415e033cb7da52f20d6f5bdceb4a4ba4ff576ab0`; retain user data.

## 1.12.3 — 2026-11-20

- PATCH from verified production 1.12.2 (`a2fe6e8938d401a3466ca71bb044182af9713ed1`): refine existing notes spacing, readable control labels, dropdown arrow insets, rounded fields/menus and repeated-click dismissal.
- Use one shared dropdown layer across Office tools, replacing the Docs-only adapter while preserving its toggle behavior. Preserve the production chat-history fix.
- Validate source/assets, full regression suite, release policy and local browser interaction. Verify AWS health, version and exact public assets after deployment. No dependencies, production configuration or data migration.
- Rollback code target: `a2fe6e8938d401a3466ca71bb044182af9713ed1`; retain all user/course/annotation data.

## 1.12.2 — 2026-11-20

- PATCH from verified production 1.12.1 (`974bd6585763fc9684c55beff98369889183be77`): preserve active chat history and drafts when reselecting its course or conversation; resolve stale saved conversation IDs consistently.
- Validate navigation, history isolation and retry regressions, source/assets and release policy. No new features, dependencies or data migration.
- Rollback code target: `974bd6585763fc9684c55beff98369889183be77`; retain all user data.

## 1.12.1 — 2026-11-20

- PATCH from verified production 1.12.0 (`acbdf7cd0db4b7fbcfb030f8c73bdae3e2ff3391`): fix existing document dropdowns so a second click on the same trigger closes the options. No new features, dependencies or data migration.
- Preserve toolbar appearance, editor settings and selection, keyboard navigation, outside-click dismissal and account themes.
- Validate Chrome/WebKit mouse and touch interactions, source/assets and release policy. Rollback code target: `acbdf7cd0db4b7fbcfb030f8c73bdae3e2ff3391`; retain user data.

## 1.12.0 — 2026-11-20

- MINOR from verified production 1.11.1 (`ad02d44660bfd37a1bf152337b03fffb5b3a8127`): add course creation directly in the notes workspace. Keep the current page open, save annotations first, share the course with Study and select the newly created course for upload.
- Preserve current course/material on cancellation and block creation when saving fails. Cover empty course lists, keyboard access, stale responses and bilingual labels.
- Validate source/assets, release policy and regression checks; verify deployment health and exact public assets. No dependencies, production configuration or database migration.
- Rollback code target: `ad02d44660bfd37a1bf152337b03fffb5b3a8127`; retain all account/course data.

## 1.11.1 — 2026-11-20

- PATCH from production 1.11.0 (`54500e85fe67fe187cee7be80adf4d7047e51a98`): repair false login redirects on transient session-check failures. No new features, dependencies or data migration.
- Validate source/assets, release policy and authentication/navigation regressions; verify deployment health and exact public assets.
- Rollback code target: `54500e85fe67fe187cee7be80adf4d7047e51a98`; retain account data.

## 1.11.0 — 2026-11-20

- MINOR from production 1.10.0: add platform-funded product help in Study using fixed `gpt-6-luna`.
- Open a compact AI button into a right-side help panel; preserve Chinese/English, account themes, mobile layout and Study drafts.
- Route learning requests back to Study; return only reviewed product guidance with bounded requests and per-account rate limits.
- Explicitly bypass personal AI allowance metering for product help only, including accounts with exhausted allowances.
- No data migration; preserve existing production features and private configuration.




## 1.10.0 — 2026-11-20

- MINOR from verified production 1.9.5, `2c56b6516c21b981424698a00480065ca5eedc2f`.
- Add movable/resizable sticky notes with text, attached ink, independent copies and custom backgrounds; export complete annotated PDFs.
- Improve tool cursors, continuous erasing, undo and panning; repair course-folder expansion and stale async responses.
- Preserve 1.9.3 account appearance and 1.9.4 landscape tablet layouts. Preserve the 1.9.5 Grades opening fix. No database migration or production configuration change.
- Validate release policy, source/assets, full regressions and dependency audit; verify deployment health and exact production assets.
- Rollback code target: `2c56b6516c21b981424698a00480065ca5eedc2f`. Retain all stored notes and private backups; older clients cannot render the new sticky-note objects, so avoid editing those pages until the compatible release is restored.

## 1.9.5 — 2026-11-20

- PATCH from verified production 1.9.4 (`632232068cfd6aa3575a4332f3713eb49a96eed9`): remove blank feedback and redundant work when opening Grades. No new features or database migration.
- Preserve server-fresh grade records, calculation behavior and tablet layout fixes.
- Validate source/assets, release policy, regression tests and slow-response browser behavior; verify deployed version, health and exact assets.
- Rollback code target: `632232068cfd6aa3575a4332f3713eb49a96eed9`; retain account data.

## 1.9.4 — 2026-11-20

- PATCH from production 1.9.3: repair existing tablet responsive layouts; no new features or data migration.
- Prioritize landscape with a compact sidebar, readable workspaces and larger touch targets.
- Use full-page navigation up to 900 px and preserve the active page and drafts across rotation/split view.
- Preserve latest production workflows, account appearance and bilingual UI.
- Rollback code target: `f2e4da17ddb0fea3185676e1c5c6bad8ae63aeb8`; retain user data and private configuration.

This file records stable StudyBridge versions so a broken update can be rolled back safely.

## 1.9.3 — 2026-11-20

- PATCH from production 1.9.2 (`0a6ce3709f29a98eaa935f54821067c205e1e38d`): repair existing palette and dark-mode styling in course notes and Grades.
- Preserve PDF content colors and the latest embedded Grades architecture. No new features, dependencies, configuration or database migration.
- Validate release policy, source/assets, automated tests and browser theme combinations. Verify deployed version and exact changed assets.
- Rollback code target: `0a6ce3709f29a98eaa935f54821067c205e1e38d`; retain user data.

## 1.9.2 — 2026-11-19

- PATCH from production 1.9.1, `5b7fd8fe864cc60ef6b157e20b06cdf92228fe7e`.
- Refine the existing guest workflow's first-question entry, example acceptance,
  composer spacing and language-selector alignment.
- Validate source/assets, release policy, regressions and responsive bilingual
  interactions. Verify live assets, service health and the guest workflow.
- Rollback code target: `5b7fd8fe864cc60ef6b157e20b06cdf92228fe7e`.
  No database migration or production configuration changes are required.

## 1.9.1 — 2026-11-19

- PATCH from verified production 1.9.0 (`b809643834d0201c797a2d87e4b0daf241cb8fe0`): fixes and presentation improvements to existing tools.
- Restore Course notes navigation and switch editors within the Tools workspace. Apply the themed PDF upload button and the approved compact Docs/Sheets layout with collapsible AI assistance.
- Validate release policy, entry assets, full automated tests and responsive editor navigation. Check production health, version and exact deployed assets after release.
- No data migration or dependency change. Rollback code target: `b809643834d0201c797a2d87e4b0daf241cb8fe0`; retain account data and private backups.

## 1.9.0 — 2026-11-16

- MINOR from verified production 1.8.0 (`1a2183375d2e4bf7fd92f563696cbdcf083e1c08`): introduce course PDF notes and automatic course-code filing.
- Put notes first in Tools with quiet icon controls for pen, highlight, text, eraser and undo/redo; support desktop, phone and tablet with localized labels and account themes.
- Preserve per-page cloud saves, local draft recovery, existing grades, course archives and account data. No data migration; rollback code target is `1a2183375d2e4bf7fd92f563696cbdcf083e1c08`.

## 1.8.0 — 2026-11-16

- MINOR from production 1.7.2, `bccee3f6137a926ebd79c478c36835f41c0e0dd3`.
- Add a public guest Study workspace with guided course creation, bundled TXT
  upload, prepared question and answer, and clickable citations. Provide the
  prebuilt microeconomics lesson separately with a three-question practice flow.
- Store guest courses and progress in the current browser. No data migration,
  setup changes, or external processing is required for the guest flow.
- Validate release policy, app and public asset compatibility, the automated
  suite, and the interactive flow on desktop, tablet and phone widths.
- Rollback code target: `bccee3f6137a926ebd79c478c36835f41c0e0dd3`.
  Use the existing private backup and release health checks; retain account data.

## 1.7.2 — 2026-11-16

- PATCH from production 1.7.1, `b3ad0b417970311f5b00028757ea099f3e888c5f`.
- Refine existing Tools, Classmates and Community surfaces without introducing new capabilities or changing data/interaction logic.
- Source: `7504bb9`; carry only the approved stylesheet and entry link onto latest main.
- Validate source/assets, release policy, regressions and bilingual desktop/mobile layouts; verify production health and exact assets.
- Rollback code target: `b3ad0b417970311f5b00028757ea099f3e888c5f`. Preserve account data and backups; no migration required.

## 1.7.1 — 2026-11-16

- PATCH from verified production 1.7.0, `2d9a5d07ce32fd48a6087020c82d8fb06b0189a6`.
- Display two decimal places in the existing grade forecast controls and give
  numeric fields room on small screens. Keep independent 0–100 scales, linked
  calculations and the latest drop-lowest rules and unreachable-target behavior.
- Source fix: `4d5b6f88d05a4fb76567e19651a02b18bd8aeb47`.
- Validate source/assets, release policy, grade controls and drop-lowest regression,
  the full test suite, and bilingual mobile/desktop layouts. Verify production
  health, version, exact grade assets and authenticated grade endpoint afterward.
- Rollback code target: `2d9a5d07ce32fd48a6087020c82d8fb06b0189a6`. Preserve account
  data and backups. No migration is required.

## 1.7.0 — 2026-11-16

- MINOR from verified production 1.6.0, `5e1c0178f6f6dff8562bbf09a56f6d253b92a31d`.
- Add category-level lowest-score exclusion via syllabus or manual settings.
  Preserve original scores and recompute the kept group during grade entry and
  goal forecasts. Check ambiguous or conditional rules before applying them.
- Source commits: `08889e107fc1673a22cd70449045b450f1c9ee32` and
  `e19a101ef70ea343ab01374798f87213e82123fb`.
- Validate grading, recognition and storage regression tests, a readable PDF with
  simulated AI output, and manual setup at desktop and mobile widths. Check
  production health, exact asset contents and the protected grade endpoint.
- Rollback code target: `5e1c0178f6f6dff8562bbf09a56f6d253b92a31d`. The optional rule fields require no
  data migration. Preserve account data and private backups during rollback.

## 1.6.0 — 2026-11-16

- MINOR from verified production 1.5.1, `448e5edb659cd862d1cadeb0df5e2cd7a2d3061f`.
- Add inline per-user usage summaries and fix date-range controls. Add a problem
  reporting inbox with grouped server failures, user reports, and operator email
  delivered by the existing mail service.
- Source commits: `dbe89f53f0df5b525ce6fb8ed7e9823777fda69c` and
  `0e04f2dc737abf37b55487afdd005a3aa3cd5107`.
- Validate release policy, full regression suite, bilingual desktop/mobile
  workflow, and email using a local SMTP fixture. Verify production health,
  exact assets and authentication requirements after deployment.
- Rollback code target: `448e5edb659cd862d1cadeb0df5e2cd7a2d3061f`. Preserve current account
  data and private backups. The production local database requires no migration.

## 1.5.1 — 2026-11-16

- Classification: PATCH from production 1.5.0 (`d5d9548`): refine the existing
  public homepage presentation and fix grade-demo interaction; no new product
  capability, major product redesign or data migration.
- Publish the approved asymmetric hero, neutral light-gray feature panels,
  centered closing section and black product-style actions, with bilingual
  responsive layouts. Keep the product walkthrough empty for later follow-up.
- Give both grade sliders a 0–100 scale, preserve bidirectional calculation and
  attainable bounds, and show two decimals without clipping on mobile.
- Carry only homepage changes onto current main; preserve current account,
  learning, scheduling, analytics, mail and release-policy implementations.
- Approved preview source: `3f3e01d5f43d4b7fe22c554f367862ecb9c4d0c8`.
- Validate release policy, source/assets, regression suite and desktop/mobile
  homepage rendering; verify the live version, assets and health after deployment.
- Rollback code target: `d5d95485a5c22d9a630e659ec5aabe7ebece11c8`.
  Preserve all current account data and private backups. No migration is needed.

## 1.5.0 — 2026-11-14

- MINOR from verified production 1.4.3, `71b9a4524389ff77bca7e82ba76f9e573466833c`. Add a developer usage overview and individual account usage summaries.
- Source feature: `75610f722fb627f58c836611876af548df8b3d34`. Reuse the existing AI allowance ledger for estimated cost and keep student content outside the analytics records.
- Validate release policy, source and assets, regression tests and bilingual desktop/mobile rendering. After deployment, check the live version, service health and admin authorization.
- Rollback code target: `71b9a4524389ff77bca7e82ba76f9e573466833c`. Preserve current account data and private backups. The production local database requires no migration.

## 1.4.3 — 2026-11-14

- PATCH from verified production 1.4.2, `0dcaf6150a3adaba6137de4297f1bad5c4897fd0`. Clarify the next-item calendar shortcut in Chinese and English.
- Source change: `4b924b083245c852043f025784fa3514d014fa6d`.
- Validate source and release policy, the regression suite, bilingual date selection and the live app bundle.
- Rollback code target: `0dcaf6150a3adaba6137de4297f1bad5c4897fd0`. Preserve current account data and private backups.

## 1.4.2 — 2026-11-14

- PATCH from production 1.4.1, `62e85553dc9edd8b339c97fa141abcbd5fb2e233`. Restore the month calendar and upcoming agenda as the default Schedule view.
- Source change: `3e5d80b44d099f7db82541152f20ff5b22a1f494`. Open Today's checklist with a button next to reminder settings and return to the selected date.
- Validate desktop and phone navigation, upcoming events, checklist data and the return action against isolated data. Check the served production assets and health after deployment.
- Rollback code target: `62e85553dc9edd8b339c97fa141abcbd5fb2e233`. No data migration.

## 1.4.1 — 2026-11-14

- PATCH from production 1.4.0, `336e104dab922c8e1dcb2360b2a2ef8ba31c3a38`. Correct the scroll jump when selecting a date or opening the day of the next scheduled item.
- Source change: `318b66e58e867c0a9ca554073f50c44163fbbb54`. Update the month calendar and selected day in place and retain keyboard focus.
- Validate with the release policy, source/assets checks, the regression suite and Chrome/WebKit at desktop and phone widths. Verify the deployed version and both affected assets after the workflow.
- Rollback code target: `336e104dab922c8e1dcb2360b2a2ef8ba31c3a38`. Preserve current account data and private backups.

## 1.4.0 — 2026-11-14

- MINOR from 1.3.2, `97e2a50f0ed5c9417a0aedd349d016f6137220e0`. Add the course-connected daily checklist, with quantity goals and shared schedule progress.
- Integrate the original checklist (`aae4001`) and collapsed Study onboarding (`e8876c2`) into the current production code.
- Validate schedule and account isolation, review links, timed reminders, and desktop/mobile workflows with test data. The deployment verifies backup integrity, versioned assets and health.
- Rollback code target: `97e2a50f0ed5c9417a0aedd349d016f6137220e0`. Checklist fields use existing schedule documents and need no migration.

## 1.3.1 — 2026-11-14

- PATCH from production 1.3.0, `35bbf1331369208c945a2cabe0d5f1049fdd6a57`. Refine the existing study onboarding layout and repair its course materials shortcut.
- Source change: `7cf85c22c1abc9455a98a31ad70deeaeaf917471`. Unify the reminder and conversation background and show real course/material progress with green checks.
- Validate the release policy, source and assets, and the full regression suite. Browser checks cover desktop and mobile, both languages, dark mode, and navigation to course materials, practice, and the calendar using isolated data.
- Rollback code target: `35bbf1331369208c945a2cabe0d5f1049fdd6a57`. Preserve current account data and private backups.

## 1.3.0 — 2026-11-13

- MINOR feature release from production 1.2.32, `3f4520b38dfbaf0e8729529026cbbdca650a11fb`.
- Adds first-study guidance, mistake/exam-aware review scheduling, confirmed email reschedules/cancellations and device draft recovery. Keeps the latest native grades, password reset, archiving and usage accounting.
- Validate with source/assets checks, the full Node regression suite, release-policy tests, dependency audit and desktop/mobile browser checks. Live acceptance checks the deployment commit, frontend version and health after the workflow finishes.
- Rollback code target: `3f4520b38dfbaf0e8729529026cbbdca650a11fb`; preserve current user data and private deployment backups. No data migration or new environment variables.

## Version numbering policy

Future production releases use `MAJOR.MINOR.PATCH` according to the owner's
2026-10-28 instruction. Keep all already published release numbers unchanged, including `1.2.31`.
Historical PATCH values were also used as release counters; do not repeat that
practice for future releases. Always verify the latest production baseline.

| Change scope | Increment | Example from 1.2.31 |
| --- | --- | --- |
| Bug fixes and small optimizations, including small layout or performance improvements | PATCH (last number) | `1.2.32` |
| Important new functionality | MINOR (middle number), reset PATCH to zero | `1.3.0` |
| Major product redesign or major architectural change | MAJOR (first number), reset MINOR and PATCH to zero | `2.0.0` |

Choose the highest applicable level when a release combines several types of
changes. Version numbers describe release scope, not the total number of
releases or commits. Drafts, unreleased work and documentation-only updates do
not require a product version bump or deployment.

## Release checklist

- Compare the complete release scope with the previous production version and
  choose PATCH, MINOR or MAJOR using the table above. Record the classification
  and reason in `CHANGELOG.md` and the stable-version entry below.
- Before each production update, synchronize `package.json`, both root versions
  in `package-lock.json`, the frontend version in `public/app.js`, and affected
  frontend asset cache keys in `public/index.html`, `public/landing.html` and
  any affected lazy loaders. Rebuild content-addressed assets through the existing
  release process where applicable. Preserve historical archive
  entries and unrelated cache identifiers.
- Run the existing source/assets/version checks, relevant regression tests and
  deployment checks. Check the chosen version against the previous production
  version explicitly; matching version strings alone does not validate scope.
- Record the version, date, purpose, validation, important GitHub commit IDs and
  previous stable rollback target in the stable-version entry below.
- If a release breaks the live app, restore the files from the previous stable
  commit or re-run the previous deployment while retaining current user data.
- Follow the existing deployment authorization and private backup requirements;
  a version bump does not itself authorize deployment.

## Version-policy audit — 2026-11-12

- The original policy commit `dae7ddc` is on `codex/version-policy` but is not
  an ancestor of main `2c361de` (`1.2.31`). Main still had the old generic
  “bump every production update” policy; the intended scope rules were never
  integrated there. This audit restores them without renumbering past releases.
- Important features were shipped as PATCH increments, for example Grades in
  `1.2.25`, course archiving in `1.2.29`, and grading-rule extraction from saved
  course materials in `1.2.30`. These scopes call for MINOR under the agreed rule.
  Fixes and small optimizations can legitimately continue with PATCH increments.
- From `1.2.31`, the next important feature release is `1.3.0`; a fixes-only
  release is `1.2.32`; a major redesign/architecture release is `2.0.0`.
  These are conditional examples, not approval or a reservation of a release.
- Review the whole difference from the latest production commit, including
  previously unreleased features bundled with a fix. Use the highest applicable
  level once per release, not once per feature or commit.
- `npm run check` currently verifies package/lockfile agreement, not whether
  a feature deserves MINOR or whether the frontend version matches. A passing
  check does not replace the scope review or frontend/cache verification.
- The stable-version entries below are incomplete (the newest recorded entry
  before this audit is `1.2.19`). For later historical scopes consult
  `CHANGELOG.md`, `docs/aws-deploy.md` and Git history; do not interpret the top
  archive entry as the current production version or fabricate deployment checks.
- Before the next authorized release, ensure this policy is integrated into its
  source branch, and add a complete archive entry with classification, reason,
  source commits, validation and rollback target. Documentation/governance-only pushes skip AWS through the enforced gate below.

### Required release decision record

Record these fields in the release changelog and archive entry before deployment:

- Previous production version and exact commit (verify against the deployment).
- Complete release scope, including features brought in by merges.
- Classification: PATCH / MINOR / MAJOR, with a concrete reason.
- Target version and synchronized package/frontend/cache references.
- Validation results and previous stable code rollback target.

## Enforced deployment gate

The `release-policy` job in `.github/workflows/deploy.yml` runs before installation
or access to deployment secrets. It requires `release-plan.json` for application
releases, including manual dispatch. The file is intentionally absent until a
release is prepared; missing or invalid records stop deployment.

Example for the next important feature release (replace the example commit with
its verified full production SHA):

```json
{
  "previousCommit": "2c361deac25cff982f1b1493b73af69855343bea",
  "previousVersion": "1.2.31",
  "version": "1.3.0",
  "level": "minor",
  "reason": "Add a new user-facing course workflow",
  "features": ["Describe the actual new workflow"]
}
```

The gate verifies ancestry, baseline version against previous main on push,
exact numeric increment, explicit feature classification, package/lock/frontend
agreement and the presence of the target version in release documentation.
Features require MINOR or MAJOR. Fix-only releases use an empty feature list.
The record is a human scope decision: automation cannot infer product importance
or verify that an omitted feature was truthfully disclosed. Review the complete
release diff and affected asset cache keys as required above. Verify the actual
production commit before filling the record; main alone is not deployment proof.

Pushes changing only Markdown under `docs/`, root AGENTS/README/CHANGELOG, or the
explicitly listed policy script/test/check/deploy workflows skip application
checks and AWS deployment. Mixed changes containing application code must pass
the release gate. This limited exception permits policy maintenance on main
without publishing the product. Manual dispatch never uses the docs-only skip.
Branch/PR checks run the policy regression tests; the main deployment gate is
mandatory before either automatic or manual deployment through this workflow.
An existing published commit can be manually redeployed only if it has a valid
release record; older releases without this gate retain their historical workflow.

## Stable Versions

### 1.3.2 - 2026-11-14

- Classification: **PATCH**. Clarify saving and confirmation in the existing grade planner.
- Production baseline and code rollback target: **1.3.1**, `a37299f30a1044507fd2ba567830c6b5d3554b87`.
- Source fix: `12ae1d3a96e9ec92672d0277814ab1f15b5b208a`. Show save progress and success, collapse special grading notes after confirmation, and keep those notes accessible for editing.
- Local verification: 45 grade-related tests passed and a simulated browser flow confirmed that saving closes the dialog and preserves grades and special rules.
- Synchronize package, lockfile, application version and affected grade assets. No data migration or configuration change.

### 1.2.32 - 2026-11-13

- Classification: **PATCH**. Correct the existing syllabus default-save behavior,
  rather than introduce a new module or important product capability.
- Verified production baseline and code rollback target: **1.2.31**,
  `2c361deac25cff982f1b1493b73af69855343bea`. The live app asset matches this
  baseline; the later `fa138e2` main change is release-policy governance only.
- Source fix: `582c0f1fa45d682e8c8f055a5620ca289bec739b`. Clear re-extractions
  can fill missing rules without another confirmation. Preserve recorded grades,
  IDs, known settings and manual links; stop only for uncertain readings,
  conflicting settings or unsupported special rules. Whole-table citations,
  long passages and clear visual readings no longer force review solely by format.
- Validation: 38 grade-related tests passed, with a local simulated-recognition
  browser check confirming automatic saving and retention of an existing 18/20
  score. The full local suite passed 675 tests with one Linux-only check skipped;
  all 12 release-policy tests and source/assets/version checks passed.
- Package, lockfile, frontend and entry cache versions are synchronized to 1.2.32.
  No data migration or new production configuration. Retain current user data
  during any code rollback; use the standard private backup and health checks.

### 1.2.19 - 2026-11-06

Purpose:
- Publish the owner-authorized page-load optimization from `e68dc5c` on `7a6f0b1` (1.2.18), preserving timetable review, reminder alignment, login protection and all audit fixes.
- Content-addressed JS/CSS bundles, immutable public caching, Brotli/gzip static compression, concurrent startup requests and HTTP/2 on the existing TLS hosts. No private-data migration or AI behavior change.

Validation:
- The original performance branch passed 600 Linux regressions, including actual Nginx HTTP/2 negotiation, compression and incremental streaming; merged release checks run again before publishing.
- Retain the existing verified private backup, unchanged-data/configuration checks and code rollback. Compare the same authenticated schedule page before/after on the existing VPN route, with three ordinary refreshes to visible saved data.

Rollback target:
- `7a6f0b1` (1.2.18). Restore code only, retaining current private data and configuration. The Nginx installer separately backs up and restores its two managed virtual-host files on failure.

### 1.2.18 - 2026-11-06

Purpose:
- Publish the owner-authorized reminder-button alignment (`ac51ebf`) and summary-first timetable review (`19a7d5f`) together on the latest `45aaadc` (1.2.17), preserving its login protection, security and dependency fixes.
- Keep individual editors and shared term details collapsed until needed, retaining selections, edits, duplicate checks, missing-information guidance and save retries. Refresh package/frontend/cache versions to 1.2.18.

Validation:
- Chrome/WebKit checks cover desktop/mobile, Chinese/English, light/dark mode, selection, keyboard editing, targeted validation, actual isolated saves and failed-save retries with simulated extraction.
- All 615 merged regressions, 307-file source/assets/package checks and deployment-shell syntax pass; the production dependency audit reports no vulnerabilities. Require verified private backup and unchanged-data/configuration checks, then verify the exact deployed commit, health and actual frontend assets with read-only requests.

Rollback target:
- `45aaadc` (1.2.17). Restore application code only and retain current account data, schedules, private configuration and backups.

### 1.2.15 - 2026-11-06

Purpose:
- Publish the owner-approved compact allowance interface from `4b60516` on the 1.2.14 production baseline `6fbb226`.
- Show remaining percentage and reset time in collapsible account navigation and Settings, with visible refresh feedback and no dollar budgets in those panels.
- Preserve tutoring fixes, internal accounting, membership/payment configuration, video restrictions and user data. Refresh package/frontend cache versions to 1.2.15.

Validation:
- All 592 merged regressions, 302-file source/assets/package checks, deployment-shell syntax and the high-severity production dependency audit gate pass; one pre-existing moderate Nodemailer advisory remains. Test-branch browser checks cover desktop/mobile, Chinese/English, unchanged workspace geometry, retained drafts, keyboard handling and refresh feedback.
- Require the production dependency audit, verified private backup and unchanged data/configuration checks before publishing. Verify the exact deployed commit, runtime health and actual frontend assets with read-only requests.

Rollback target:
- `6fbb226` (1.2.14). Restore application code only and retain current user data, task results, allowance records and private backups.

### 1.2.14 - 2026-11-06

Purpose:
- Publish all three AI tutoring review rounds (`262c0ed`, `50291f6`, `c01d9a5`) on the latest production baseline `fe7f8a3` (1.2.13).
- Block missing-figure guesses, preserve full inventories and question dependencies, independently review answers and quizzes, and expose clear supplement/retry actions. Charge background reviews to the task owner and retain completed work when allowance is exhausted.
- Preserve existing allowances, video restrictions, calendar updates, account data and payment configuration. Refresh package/frontend cache versions to 1.2.14.

Validation:
- All 592 merged regression tests, 31 focused tutoring/allowance tests, 302-file source/assets/package checks and deployment-shell syntax pass. HTTP checks verify owner-scoped planning/answer/review accounting, missing-input recovery and persisted progress with simulated AI.
- The release workflow must pass the production dependency audit before installing, verify private backups and unchanged data/configuration, then check the runtime and actual assets. Real-model answer quality remains subject to practical acceptance.

Rollback target:
- `fe7f8a3` (1.2.13). Restore application code only and retain current user data, task results, allowance records and private backups.

### 1.2.13 - 2026-11-06

Purpose:
- Publish the owner-approved weekly allowance (`171f5b1`) and permanent video restriction (`84eae5a`) together on the latest production baseline `5ea29ce` (1.2.12).
- Standard US$0.50/week and Plus US$2.00/week, visible remaining allowance and reset time, C$19.99 / 30-day pricing, and an upgrade entry gated by existing live-payment eligibility. Preserve private configuration, accounts, data and calendar fixes.
- Remove video production and its legacy enable flag; show the fixed policy in bilingual Help & about.

Validation:
- All 553 regression tests, 296-file source/assets/package checks and deployment shell syntax pass. Chrome and WebKit verify desktop/mobile allowance and video settings in Chinese/English with isolated accounts. Schedule fixture checks pass in UTC, Shanghai and Toronto. The production dependency audit passes the high-severity gate; one pre-existing moderate Nodemailer advisory remains.
- Verify the exact AWS deployment, healthy runtime and live assets using read-only requests; retain verified private backup and unchanged-data/configuration checks.

Rollback target:
- `5ea29ce` (1.2.12). Restore application code only and retain current user data, allowance records and private backups.

### 1.2.8 - 2026-10-31

Purpose:
- Publish owner-approved payment preparation from `32f5625` and `b62ce7e`: Settings billing, monthly card test subscriptions and one-time WeChat Pay/Alipay 30-day/120-day test passes with manual renewal.
- Keep disabled/test-only billing, reject live objects/keys/events, and preserve current accounts, invitations, manual Plus status, feature access and private server configuration. AI routing sources match the `c5e27ea` baseline.

Validation:
- All 467 regression tests, 259-file source/assets/package checks, deployment script syntax and the high-severity production dependency audit gate pass. Nine moderate advisories remain in existing dependencies. Isolated Chrome verifies the final release's disabled/test-only billing and simulated hosted-payment flows.
- Use the existing verified private-backup and unchanged configuration/data gates. Verify the exact deployed revision, 1.2.8 assets, billing resources and authenticated API boundaries without creating production test accounts or payments.

Rollback target:
- `c5e27ea` (1.2.7). Restore application code only; retain current user data and private backups.

### 1.2.7 - 2026-10-30

Purpose:
- Publish owner-approved background problem-set solving and reusable course indexes from `fd09cc5`, including per-question evidence, incremental results, selective retries and persisted progress.
- Move large local material payloads to integrity-checked private files and extend backups/rollback compatibility. Keep existing accounts, course boundaries and learning preferences. Add no PDF parsing concurrency limit or upload restriction.

Validation:
- All 438 regression tests, 249-file source/assets/package checks, deployment script syntax and the high-severity production dependency audit gate pass before AWS deployment.
- Verify the exact deployment commit, private backup completion, unchanged pre-install configuration/data and live 1.2.7 frontend resources. Keep production checks read-only; actual AI latency and capacity require separate measurement.

Rollback target:
- `72739ac` (1.2.6). Stop the application and rehydrate the **current** JSON database with the new `scripts/material-compat.js` before running older code; retain private files/backups and new user data. See [AWS deployment](aws-deploy.md).

### 1.2.2 - 2026-10-29

Purpose:
- Publish the owner-approved Classmates audit fixes (`b768286`) and private original images/files (`eaf811e`), including previews/downloads, retry deduplication and chat/account isolation.
- Preserve current Google verification privacy disclosures (`3558c69`), accounts, sessions, credentials, mailbox links, learning data and appearance; refresh release/cache versions without a data migration.

Validation:
- 375 regression tests and 221-file source/assets/version checks, plus Chrome/WebKit at 320/390/1280 px in light/dark mode with loss-of-response retry and original-download verification.
- Require production dependency audit, verified private backup, unchanged configuration/data checks and automatic code rollback. Compare the existing account's 5 courses, 75 schedules and appearance using read-only pages after release.

Rollback target:
- `3558c69` (1.2.1). Restore application code only; retain current user data and private backups.

### 1.2.1 - 2026-10-28

Purpose:
- Publish owner-approved schedule fixes from `7b1389e`: retain ambiguous clocks with explicit time choices, reveal extracted reviews, improve waiting/cancellation, and contain native date/time controls on desktop/mobile Safari.
- Refresh frontend cache versions; retain the current mailbox layout, accounts, sessions, learning data, saved schedules and private provider configuration without migration.

Validation:
- 344 automated tests and 213-file source/assets/version checks; Chrome/WebKit at 320/390/430/1280 px, with complete selection/save/cancel/error-retry flows.
- Require the production dependency audit and existing verified private-backup, unchanged data/configuration and automatic rollback gates. Compare the existing account's 74 schedule entries before and after release without saving test events.

Rollback target:
- `00438d9` (1.2.0). Restore application code only; retain current user data and private backups.

### 1.1.122 - 2026-10-28

Purpose:
- Publish the owner-approved phone main menu with full-screen feature pages and back navigation, the compact Study composer on desktop/mobile, and wider, denser phone replies while retaining readable text.
- Preserve all 1.1.121 functionality, accounts, sessions, credentials, memberships, learning data, authored projects and saved appearance. No data migration or preference reset.

Validation:
- Run the complete regression suite, source/assets/version checks, deployment-script syntax checks and production dependency audit.
- Retain the verified private pre-install backup, unchanged configuration/local-data verification and automatic code rollback workflow. Compare the existing signed-in account's four visible courses, 73 agenda entries and saved appearance after deployment.
- Prior browser checks cover 32 desktop/mobile light/dark palette combinations, 320/390/430 px navigation, drafts, all seven modes, attachments, send/stop, formulas, tables and unchanged desktop reply typography.

Rollback target:
- `7697805` (1.1.121). Restore application code only; retain current user data and private backups.

### 1.1.120 - 2026-10-28

Purpose:
- Keep agenda filter controls at the same scroll position when a long list becomes a single item or empty, using a viewport-sized minimum agenda region with natural-height cards.
- Refresh frontend/cache versions while retaining saved accounts, schedules, course management and preferences.

Validation:
- Local browser verification covers 73 entries changing to one or zero without a scroll shift. Run full automated tests, source/assets/version checks and deployment-script syntax checks.
- Use the existing verified private backup, unchanged-data checks and automatic code rollback deployment workflow.

Rollback target:
- `33e3058` (1.1.119). Restore code only; retain current data and backups.

### 1.1.119 - 2026-10-28

Purpose:
- Publish the owner-approved course-wide schedule management and individual event editing from `7cd4b00`, including names, dates, times, locations and notes. Preserve the latest ordinary/Plus memberships, administrator controls, Google entry and branding from 1.1.118.
- Refresh release/cache versions without migrating or rewriting saved accounts, courses, material, chats, schedules or preferences. The new actions change schedule entries only when explicitly confirmed by the user.

Validation:
- 310 combined regression tests and 199-file source/assets/version checks passed, along with deployment-script syntax validation. Retain the production dependency audit gate.
- Use verified private pre-install backups, unchanged configuration/data checks and automatic code rollback. Verify both new entry points on the live calendar, cancel the review dialogs and confirm existing schedule counts without changing user entries.

Rollback target:
- `75919e2` (1.1.118). Restore application code only; retain current user data and private backups.

### 1.1.118 - 2026-10-28

Purpose:
- Publish owner-approved PR #7 (`b21cc31`): ordinary/Plus memberships, direct Google first entry, optional signup invitations and Settings redemption, user badges and administrator classification controls.
- Keep current branding/personalization, administrator roles, credentials, sessions, SB IDs and all saved learning data. Membership remains a classification with identical features.

Validation:
- The combined feature set passed 303 automated tests and 194-file syntax/assets/version checks, including Google entry, invitation/admin races, stale decisions, historical classification and data preservation.
- Require the production dependency audit, verified private backup and unchanged configuration/data checks before installation. Verify actual Google login, invitation redemption and admin tier changes separately after release while comparing pre-existing accounts/data.

Rollback target:
- `95a2aa9` (1.1.117). Restore application code only; retain current user data and private backups.

### 1.1.117 - 2026-10-28

Purpose:
- Publish the owner-approved book-and-bridge identity from `5a0f0a7`: default monochrome logo on the homepage, login, sidebar and browser tab, with an independent blue-purple/mint choice in **设置 → 个性化 → 品牌 Logo**.
- Preserve existing accounts, courses, documents, chats, schedules, authored files, authentication configuration, palettes and dark-mode choices. The optional logo preference uses the existing account-owned appearance record, with no data migration or reset.
- Refresh package and frontend/cache versions.

Validation:
- 287 passing tests, 191-file syntax/assets/version checks and deployment-script syntax checks on the release. Require the production dependency-audit gate before installation.
- Retain the verified private backup and unchanged-data checks before installation, with automatic code rollback on failure. Compare the original signed-in account's courses and saved preferences and verify live logo assets after deployment.

Rollback target:
- `f351b25` (1.1.116). Restore code only; retain current user data and private backups.

### 1.1.116 - 2026-10-28

Purpose:
- Require delivered registration codes with StudyBridge HTML mail cards, clear six-digit entry, expiry/resend/attempt limits, and production fallback disabled. Preserve existing login, Google verification and all saved data.
- Configure sender-restricted SES through encrypted Secrets and private SSH input, with configuration backup and rollback.

Validation:
- 282 passing tests and 191-file syntax/assets/version checks; live SMTP sender restriction, HTML delivery and Gmail SPF/DKIM verified. Verify production delivery and registration after activation.

Rollback target:
- `c759615` (1.1.115); restore code and previous private SMTP settings if needed, retain all current user data.

### 1.1.115 - 2026-10-28

Purpose:
- Clear and collapse manual schedule fields immediately after a successful save; retain complete drafts on validation/save failure. Show a distinct refresh warning after successful persistence to prevent duplicate additions.
- Refresh frontend/cache versions, preserving all saved accounts, schedules and preferences.

Validation:
- Run full automated tests, source/assets/version checks and deployment-script syntax checks.
- Use the existing verified private backup, unchanged-data checks and automatic code rollback deployment workflow.

Rollback target:
- `372b391` (1.1.114). Restore code only; retain current data and backups.

### 1.1.114 - 2026-10-28

Purpose:
- Collapse and clear successful course-file imports; retain file, preview and semester settings on failed or partial saves for retry. Preserve saved courses and unrelated quick-entry drafts.
- Refresh frontend/cache versions without modifying account or saved schedule data.

Validation:
- Run full automated tests, source/assets/version checks and deployment-script syntax checks.
- Use the existing verified private backup, unchanged-data checks and automatic code rollback deployment workflow.

Rollback target:
- `b7271dc` (1.1.113). Restore code only; retain current data and backups.

### 1.1.113 - 2026-10-28

Purpose:
- Clear typed/transcribed input and audio retry state, and collapse Add schedule after successful AI schedule confirmation. Keep failures and partial saves retryable.
- Refresh frontend/cache versions without changing saved accounts, schedules or preferences.

Validation:
- Run full automated tests, source/assets/version checks and deployment-script syntax checks.
- Deploy with the existing verified private backup, unchanged-data checks and automatic code rollback.

Rollback target:
- `0344fe4` (1.1.112). Restore code only; retain current data and backups.

### 1.1.112 - 2026-10-28

Purpose:
- Place Add schedule and Import from course files between the calendar and full agenda, keeping both entry points accessible above long lists.
- Refresh frontend/cache versions. Preserve form drafts during clock refreshes and retain account data, security and appearance settings.

Validation:
- Run calendar regression tests, full automated tests, source/assets/version checks and deployment-script syntax checks before release.
- Use the existing deployment workflow's verified private backup, unchanged-data checks and automatic code rollback.

Rollback target:
- `c453ed5` (1.1.111). Restore code only and retain current account data and backups.

### 1.1.111 - 2026-10-28

Purpose:
- Release the optional **黑白灰简约** palette (`118b744`) under Settings → 外观与显示 → 界面色调.
- Keep all seven original palettes, existing default behavior, saved per-account selections and independent dark mode. No account/data migration, appearance reset or automatic selection of the new option.

Validation:
- Passed 266 regression tests, 182-file source/assets/version checks and deployment-script syntax. Covers retention of an existing graphite/dark-mode choice across restart, alongside saving the new option and account isolation.
- Require production dependency audit and verified private backup before installation; compare the original account's palette/mode and course list after deployment without changing its selection.

Rollback target:
- `6e665ce` (1.1.110 with account security). Restore code only and retain current account data and backups.

### 1.1.110 - 2026-10-28

Purpose:
- Release the owner-approved Account Security settings (`bf4a641`), allowing Google-first users to set a website password and existing password users to change it with current-password verification.
- Keep Google/password login on the original account, retain SB IDs, saved data and recovery, and preserve legacy sessions until a password is changed. Add CSRF/account checks, atomic password writes and credential-version session revocation.

Validation:
- Passed 266 automated tests and 182-file source/assets/version checks; isolated desktop and 390 px previews cover password setup/change modes and expired-Google re-verification prompts.
- Require the existing production dependency-audit gate and verified private database/configuration/files backup before installation. Verify production health, versioned assets, retained account settings and enabled Google sign-in after publishing.

Rollback target:
- `fc0cc7d` (1.1.109). Restore application code only; retain production accounts, data and private backups.

### 1.1.109 - 2026-10-28

Purpose:
- Match login and registration to the approved homepage's neutral white/light-gray/charcoal style, using a shared wordmark, thin frames and a homepage link.
- Keep the original login/register/Google actions, field IDs, invitation and email-code handling, password help and redirects. Authentication styles do not change saved account themes or learning-space appearance.

Validation:
- Passed 256 regression tests and 181-file source/assets/version checks. Isolated desktop/mobile checks cover login, logout, incorrect-password feedback, one-use invitation registration, profile routing and an enabled Google entry, without horizontal overflow.
- Require the existing production dependency audit and verified private backup before installation, then verify live assets, guest entry, retained account/session/course data and Google configuration.

Rollback target:
- `5662fef` (1.1.108). Restore application code only; retain production accounts, data and backups.

### 1.1.108 - 2026-10-28

Purpose:
- Release the approved white/light-gray/charcoal introduction homepage (`77ac29d`) and `/login` / `/app` routing (`725d0f3`).
- Retain the deployed Google sign-in (`1165f3c`), including browser-bound state, PKCE, verified identity and existing-account/course reuse. Keep the original accounts, session secret, data locations and authored files; no migration or reset.

Validation:
- The combined release passed 256 automated tests and 181-file source/assets/version checks, including Google cookie/session handling and the retained-account/course regression.
- Require successful production dependency audit and a verified private database/configuration/files backup before installation. Check live homepage, neutral assets, login routing and health after deployment.

Rollback target:
- `1165f3c` (1.1.107 with Google sign-in). Restore application code only; keep production data and private backups.

### 1.1.89 - 2026-10-26

Purpose:
- Release the user-authorized school-name suggestions, 50 MiB course uploads, per-post community replies, automatic profile-photo compression and weekly timetable imports with official-calendar lookup.
- Preserve production accounts, local/DynamoDB records, credentials and existing reminders. New community replies use separate records; timetable reminders are still saved only after explicit confirmation.

Validation:
- The feature set passed 161 automated tests and isolated browser checks for school matching, large-file upload/persistence, cross-account replies, photo compression and timetable confirmation/deduplication.
- Timetable recognition/calendar API results were mocked in tests; live AI lookup still depends on the production AI/web-search configuration and official-source availability.
- Re-run source/asset checks, the full suite and the production high-severity dependency audit for the versioned release. Verify deployment and live assets after publishing.

Rollback target:
- `3348e36` (previous production version `1.1.88`).

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

## 1.13.0 — 2026-11-20

- MINOR from verified AWS production 1.12.9 (`69ecb54a9eb8b8534e78a5e4c85188621fca1171`): add independent durable user/platform AI cost accounting, six total-cost periods and optional official reconciliation.
- Preserve automatic calendar updates and push reminders while caching official sources, routing validated simple extraction to Luna, keeping complex verification on Sol, and saving retry state across restarts. Reuse relevant material evidence without downgrading learning answers.
- Preserve the production refund and concurrent chat-loading fixes. Added cost/refresh records are retained; no user-data migration or credential change.
- Validate merged regressions, source/assets, release policy and deployed version/health/accounting. Rollback code target: `69ecb54a9eb8b8534e78a5e4c85188621fca1171`; retain all user data and new ledger records.

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

## 1.2.9 (2026-11-01) — Alipay preparation

Separate Alipay-only integration, private configuration installer, verified paid
validity and bilingual owner preparation UI. Draft prices retained; checkout stays
closed. This development version does not itself install live credentials or prove
a real payment, and is not permission to enable public charging.
