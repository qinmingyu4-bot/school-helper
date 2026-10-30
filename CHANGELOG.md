# Changelog

## 2026-10-30

- Add default inline course-source annotations beside source-backed claims and worked steps, with filename/title and verified PDF page or slide positions where available. Preserve PDF physical-page offsets through storage/retrieval, follow PowerPoint presentation/notes order, and give legacy sources explicit extracted-text line/character locators or short locating quotes. Disambiguate duplicate names, clear stale PDF locations when source text is replaced, and distinguish AI derivations from quoted source content. Prepared with bilingual retrieval on a task branch without AWS deployment.

- Improve large-course retrieval with bounded Chinese/English query expansion, synonyms and academic terminology, then rank source passages by original/expanded terms, exact phrases, term rarity and filenames. Preserve complete small collections, current-upload priority and course/conversation isolation; use only real source passages as evidence. Add an eight-second fallback and stream cancellation without a shared query cache. Prepared on a task branch without AWS deployment.

- Release `1.2.4`: publish the owner-approved Chinese / English interface, preserving the `1.2.3` community post editor and all existing data/configuration. Refresh release and frontend cache versions. Use the existing verified private backup, data/configuration checks and automatic code rollback deployment. Previous production code: `52c4d6e` (`1.2.3`).
- Follow-up live verification: allow English homepage headings/actions and the mobile language header to wrap naturally, and preserve spacing before the accented hero word. Verify both languages at 320, 390, 768 and 1440 px without horizontal overflow. The follow-up contains presentation assets only.
- Validate 389 automated tests and 227-file syntax/asset/version checks. Isolated Chrome checks cover homepage and authentication switching/persistence, all six destinations, retained profile/chat/document/file drafts, settings and 390 px layout, plus community post editing in English with unsaved content retained across language switches. No production test content is written.

- Add Simplified Chinese / English interface switching to the homepage, authentication, sidebar and Personalization settings. Translate navigation, settings, study controls, community, classmates, schedule, mailbox, creative tools and Office editor controls through a shared catalog. Use the browser’s supported language initially, retain the explicit choice locally, synchronize tabs, update accessible labels and locale-aware dates, and preserve active drafts while switching. Keep AI Learning Style and user-authored course, chat and document content independent from interface language. No database migration is required.
- Release `1.2.3`: add owner-only community post editing for the topic, content, publishing channels and anonymous setting. Keep the same post ID, original creation time, likes and replies; show edited time and retain failed drafts. Save channel/search index changes with the post in one conditional cloud transaction and reject stale edit revisions while preserving concurrent likes. Include legacy destinations when prefilling edits. Refresh frontend/package/cache versions. Previous production code: `5bad7cb` (`1.2.2`).
- Validate 384 automated tests and 223-file syntax/asset/version checks, including edit permissions, channel additions/removals, updated search, concurrent likes/edits, atomic failures, local save rollback/retry, stale-edit rejection, delayed feed responses and account-isolated drafts. Isolated browser checks cover all-to-major and all-to-school editing, retained replies/likes, edited labels and the 390 px form without horizontal overflow or page errors.

## 2026-10-29

- Release `1.2.2`: publish owner-approved Classmates fixes and private image/file sharing from `b768286` and `eaf811e`. Include removable previews, image enlargement, original downloads, attachment-only messages, retry deduplication and account/chat isolation; retain the latest Google verification disclosures from `3558c69`, existing accounts, sessions, mailbox configuration and all learning data. Refresh package/frontend cache versions. Use the existing private verified-backup, unchanged data/configuration and automatic code rollback workflow. Previous production code: `3558c69` (`1.2.1`).

- Add images and original files to Classmates chat: a compact attachment picker, screenshot paste/file drop, removable previews, image enlargement, downloadable filename/size cards and sending feedback. Allow attachment-only messages; limit each send to 6 files, 12 MB per file and 20 MB total. Keep unsent files separate by chat, preserve new text/files typed during delivery, and retain retryable drafts on failure. Keep the latest message in view when the attachment queue changes height.
- Store originals privately outside message records, validate actual bytes and image dimensions, and authorize both chat participants on every preview/download. Publish files/messages atomically in local storage and with conditional DynamoDB writes; retain committed files after lost database responses. Deduplicate network retries using account/chat-bound message identities, preserve original download bytes through restart, and include attachment summaries in the classmate list. Prepared on a task branch without AWS deployment.
- Validate 375 automated tests and 221-file source/assets/version checks. Isolated Chrome/WebKit checks cover multi-file selection, image-only sends, screenshot paste/drop, exact original downloads, image enlargement, chat-scoped drafts, failed/lost-response retries without duplicate messages, retained new files/text during delivery, refresh and 320/390/1280 px light/dark layouts without page errors or horizontal overflow. Fetch individual files independently to avoid rereading every attachment for each preview.

- Audit Classmates and fix delayed request/message responses forcing users back after navigation, duplicate submissions after redraws, and successful delivery clearing a newly typed message. Preserve the SB ID draft and request-list expansion across refreshes; isolate live updates and read acknowledgements by account.
- Make friend requests and acceptance atomic in local storage and DynamoDB, coordinating concurrent requests across server instances. Reuse the original request/chat IDs, prevent duplicate chats and conflicting accept/ignore decisions, retain pending requests on save failure, and immediately notify both users when requests change. Prepared on a task branch without AWS deployment.
- Validate 363 automated tests and 216-file source/assets/version checks. Isolated browser checks cover live requests/acceptance, two-account messaging and unread/read state, retained drafts during delivery and page changes, profile return, delayed navigation responses and 320/390/1280 px layouts without overflow or page errors. Use fixture accounts and temporary local storage only.

## 2026-10-28

- Prepare Google production-verification prerequisites: bilingual public privacy policy disclosing optional read-only Gmail/Outlook access, server-side AI classification (including messages classified as unrelated), processing providers, retention/backups and deletion controls; add homepage mailbox description/privacy/contact links and a Settings disclosure link. Document observed Google project gaps, scope justification, real-consent demonstration script and required independent assessment. Owner approved publication and operation under the policy, domain verification and switching Google to production once configuration is ready. Search Console domain ownership is verified using a separate TXT record; existing DNS and provider permissions are preserved. Google review and the independent assessment remain pending. Validate 344 automated tests, 213-file source/assets/version checks and browser policy/homepage-link checks on the current 1.2.1 base.

- Release `1.2.1`: deploy the owner-approved schedule fixes from `7b1389e`: retained ambiguous clocks and noon/midnight choices, automatic review positioning, responsive waiting/cancellation, and bounded date/time controls on desktop/mobile Safari. Refresh package/frontend cache versions, retain the latest mailbox layout and all existing accounts, schedules, courses, conversations, settings and private authorization configuration. Use the existing verified private-backup, data/configuration checks and automatic code rollback workflow. Previous production code: `00438d9` (`1.2.0`).

- Preserve ambiguous clocks such as “12点” in text/voice schedule drafts and offer noon / that-date midnight choices without guessing or changing the date. Focus and scroll to extracted results on desktop/mobile. Replace waiting-time full-page rendering with a spinner, elapsed status, cancellation and bounded requests that retain input on failure; route short descriptions to the configured simple model. Constrain review labels and native date/time/end-time controls within their cards, including mobile Safari. Prepared on a task branch without AWS deployment.
- Validate 344 automated tests and 213-file source/assets/version checks. Isolated Chrome and WebKit browser checks cover 320/390/430/1280 px layouts, review visibility, noon/midnight/manual time selection, persistence, steady waiting UI, cancellation and failed-request retry without overflow or page errors.


- Put **学习通知** before **邮件解读与回复** in Email Assistant and open notices by default. Make the full Gmail/Outlook status strip a keyboard-accessible shortcut to **设置 → 邮箱授权**, with hover/focus feedback. Preserve reply drafts, notice edits and provider authorization configuration; refresh only the mailbox asset cache keys and retain version `1.2.0`.
- Validate 339 automated tests and 212-file source/assets/version checks. Isolated browser checks cover desktop/390 px phone layouts, light/dark modes, bound/unbound mailbox states, click/Enter/Space shortcuts to the authorization settings, and retained reply text and notice edits. Prepare on a task branch for review.

- Activate real Gmail and Outlook configuration for `1.2.0` online testing. Enable Gmail API and its separate callback/read-only scope, and register an Outlook Web app supporting organizational and personal accounts with delegated `Mail.Read`, `User.Read` and `offline_access`. Keep provider secrets in encrypted GitHub Secrets and private server configuration; retain the existing mailbox encryption key. Validate the live callbacks, encrypted OAuth state, scopes, health and existing Google login, confirm both binding controls are available in Settings, and compare 23 existing learning-data fingerprints without changes. Individual inbox consent and real mail synchronization remain user-initiated tests. The initial Outlook application credential expires on `2027-04-26` and must be renewed before then.

- Prepare real mailbox activation through a manually dispatched, revision-guarded GitHub workflow and private server configurator. Reuse existing Google credentials, accept optional provider credentials only through encrypted secrets/SSH stdin, retain a stable mailbox encryption key, back up private configuration, validate read-only OAuth and existing login, and roll back failed activation. Keep provider-console setup and each user's inbox consent explicit; retain version `1.2.0` for this configuration work.
- Validate 339 automated tests, 212-file source/assets/version checks, and private-configurator syntax. Real provider activation remains separate from fixture tests and requires provider-console configuration plus the user's own inbox consent.

- Release `1.2.0`: make **邮件解读与回复** the default Email Assistant workspace with a visible received-mail/intent form and reply draft, replacing the collapsed footer. Put extracted mail and calendar confirmation under **学习通知** with its own refresh/sync controls. Reduce the header to read-only Gmail/Outlook binding state and linked addresses; all authorization management remains in Settings. Retain typed drafts, completed replies and notice edits across view switches, and open learning notices after a successful OAuth callback. Update package/frontend cache versions and continue the owner-authorized AWS online test release through the existing verified private-backup and rollback workflow. Previous production code: `959d682` (`1.1.123`).
- Validate 337 automated tests and 211-file source/assets/version checks. Browser checks cover default expanded reply panels, mock reply generation, retained mail/replies/review edits across views, passive connection status, Settings authorization management, phone layout and dark mode. Capture 20 production content fingerprints for post-release comparison; preserve accounts, course materials, chats, schedules, preferences and private configuration without a data migration.

- Release `1.1.123`: publish the owner-authorized sixth **邮箱助手** destination and **设置 → 邮箱授权**, including Gmail/Outlook inbox synchronization and confirm-before-calendar review, from `1cf567a`. Include the already-prepared course-specific Cheatsheet workspace. Refresh package/frontend cache versions. Use the existing verified private-backup, unchanged configuration/data checks and automatic code rollback workflow; retain accounts, sessions, course notes/materials, conversations, schedules and preferences. Do not activate local demo transports, accounts or simulated mail in production. Real mailbox binding remains unavailable until private provider/encryption configuration and applicable provider approval are complete. Previous production code: `d5f1eb1` (`1.1.122`).
- Release validation: 334 passing automated tests, 211-file source/assets/version checks and deployment-script syntax validation. Capture private content fingerprints for the existing account's four visible courses, 73 documents/schedule records, five course conversations, four course-chat messages, 14 general-chat messages, appearance and profile/learning preferences before deployment; compare the same read-only responses after deployment. Retain the production dependency audit and verified private-backup gates.

- Promote **邮箱助手** from Tools to the sixth main student destination on desktop/mobile; retain manual paste/reply drafting and legacy navigation. Add **设置 → 邮箱授权** for separate read-only Gmail and Outlook/Microsoft 365 consent, linked account status, relinking and unlinking. Return authorization feedback to the assistant.
- Add durable background Inbox synchronization, recent-seven-day backfill, Gmail history/Outlook delta pagination, encrypted credentials, refresh/backoff and cross-process leases. AI extracts learning notices into source-linked review cards; students select/edit items and complete missing dates/times before explicit, atomic, duplicate-safe calendar confirmation. Disconnect stops sync and removes extracted mailbox data while retaining confirmed schedules. Document private provider configuration and launch requirements. Prepared on a task branch without AWS deployment.
- Validate 334 automated tests and 211-file source/assets/version checks. Isolated browser checks cover both authorization flows, explicit consent, waiting for confirmation, incomplete-time correction, duplicate prevention, immediate unlink cleanup, all six navigation destinations, retained review edits, desktop and 320/390 px phone layouts, and dark mode. Real-provider registration, credentials and applicable Google production review remain required before live mailbox use.

- Consolidate Cheatsheet creation in **Tools → Cheatsheet PDF** and remove the Study Area mode/PDF shortcut. Add an account-remembered course selector; use the selected course’s uploaded materials and historical images, keep drafts/print settings/uploads/results separate per course, and require a valid owned course before generation. Existing revisions retain their original course. Prepared on a task branch without AWS deployment.
- Validate 323 passing regression tests and 203-file source/assets/version checks on the latest 1.1.122 mobile/compact-chat base. Browser checks verify legacy-mode fallback, required course selection, course-specific drafts/settings/uploads/history/revisions, selected-course evidence in generated AI requests, remembered selection and a 390 px layout using isolated fixture accounts.

- Release `1.1.122`: publish the owner-approved mobile main-menu/full-screen navigation, **轻量横排** Study input on desktop/mobile and denser phone reply layout from `220bea1`. Retain the 1.1.121 navigation icons and all existing accounts, sessions, memberships, courses, materials, conversations, schedules, authored files, palettes, dark mode and authentication settings. Refresh package/frontend/cache versions without a data migration. Use the existing verified private backup, unchanged configuration/data checks and automatic code rollback. Previous production code: `7697805` (`1.1.121`).
- Release validation: 319 passing automated tests, 203-file source/assets/version checks and deployment-script syntax validation. Retain the production dependency audit and private verified-backup gates. Record four courses, 73 agenda entries, account classification and saved appearance for read-only post-deployment comparison; retain prior 32-theme-combination, mobile navigation, attachment, draft and reply-density browser checks.

- Improve phone Study reading density without shrinking the 14 px body font: use 1.65 line spacing, wider reply columns and smaller bubble/paragraph/list gaps; retain accessible speaker labels without their side column. Remove the non-actionable empty-deadline placeholder from phone reading space while retaining real upcoming schedules. Keep desktop typography, themes, formulas and scrollable tables unchanged; prepare on the existing task branch without deployment.
- Validate 26 related regression tests and 203-file source/assets/version checks. Compare identical Chinese prose, lists, four formulas and a table at 320/390/430/1280 px: at 390 px the reply height falls from 845 to 691 px, text width grows from 284 to 339 px and the empty-schedule chat viewport grows from 458 to 558 px. Desktop measurements remain identical. Verify light/dark layout, no page overflow, retained formula geometry and a visible real upcoming-deadline fixture using only isolated local data.

- Apply the approved **轻量横排** Study composer on desktop and mobile: quiet text shortcuts, a compact mode selector, an upward-opening More menu and a shared rounded field with attachment/send/stop icons. Retain all Study/general prompts, modes, Cheatsheet PDF and attachment workflows. Grow wrapped/restored input on both layouts and inherit all eight palettes and independent dark mode from existing account settings. Retain mobile menu navigation; prepare on a task branch without AWS deployment.
- Validate 319 passing automated tests and 203-file source/assets/version checks after retaining 1.1.121 navigation icons. Inspect 32 desktop/mobile theme combinations (eight palettes in light/dark), retained drafts, restored saved themes, 320 px menus in all seven modes, general chat, multiline input, file selection/sending through the in-app browser and simulated send/stop recovery. The new input/placeholder and send-icon contrast remains above 4.5:1 in every tested combination; replace inherited dark gradients and strengthen secondary text where needed.

- Fix the mobile Study composer clipping a wrapped placeholder or typed second line. Use a short mobile prompt and grow the input with its text up to 120 px, then scroll within the field; recalculate after draft restoration and screen resizing. Retain the desktop prompt and sizing.

- Add mobile-only main-menu navigation at widths up to 700 px: all five student destinations open as full-screen pages sliding in from the right, with an upper-left return and browser Back support. Keep the current page mounted when returning/reopening so forms, file selections and unsent chat text survive. Open Study directly to chat and move course selection/materials/preferences into a separate accessible panel. Preserve larger-screen and creator-console layouts, account themes and existing data. Prepared on a task branch without AWS deployment.
- Validate 316 passing automated tests and 201-file syntax/assets/version checks. Browser checks cover 320/390/430 px layouts, all five destinations, direct page links, browser Back/Forward, retained unsent chat and schedule text/disclosures/scroll position, and matching 1280 px desktop Study/Tools geometry against the unchanged application using isolated fixture accounts.

- Release `1.1.121`: publish the owner-authorized navigation icon flicker fix from `024e94d`. Render the same five main icons inline, preserving their appearance and all navigation behavior, and refresh package/frontend/cache versions. Retain the current agenda scroll fix, memberships, branding, settings, accounts and learning data. Use the existing private backup, unchanged configuration/data checks and automatic code rollback. Previous production code: `e315a95` (`1.1.120`).

- Prevent the five main navigation icons from flashing during route changes by drawing their existing SVG paths inline instead of recreating external sprite references whenever the sidebar renders. Keep the same shapes, dimensions, colors, selection highlights and destinations, retain the legacy sprite for already-open clients, and refresh the application asset cache key. Prepared on a task branch for review; no AWS deployment.
- Validate 310 passing regression tests and 199-file source/assets/version checks. With external sprite loading blocked, reproduce five missing legacy icons, then verify all five fixed icons across 30 day/night route switches and 624 sampled frames without blank geometry or page errors; confirm every SVG path exactly matches its existing symbol.

- Release `1.1.120`: publish the owner-approved agenda filter scroll fix with trailing space for short/empty results and restored schedule scroll position across redraws. Refresh frontend/cache versions; retain all accounts, schedules, course management and preferences. Previous production code: `33e3058` (`1.1.119`).

- Keep the full-agenda area at least one viewport tall with natural-height cards and trailing blank space for short/empty filters. Restore the schedule page's scroll position across redraws so switching from a long list to a single item does not push the filter controls down the screen.

- Release `1.1.119`: publish both owner-approved schedule features from `7cd4b00`: course-wide management across months and individual event editing for title, date, start/end time, location and notes. Keep the latest 1.1.118 membership, Google entry, admin controls and branding. Refresh release/cache versions and retain accounts, sessions, courses, materials, chats, schedules and preferences. Use the existing verified private backup, unchanged-data checks and automatic code rollback. Previous production code: `75919e2` (1.1.118).
- Release validation: 310 passing combined regression tests, 199-file source/assets/version checks and deployment-script syntax checks. Keep the production dependency audit and verified private backup gates; verify the two live controls and compare the existing 73-entry schedule count without saving changes.

- Release `1.1.118`: publish owner-approved PR #7 (`b21cc31`) with ordinary/Plus classification, direct Google first entry, optional signup and deferred invitation redemption, visible badges/counts and administrator classification controls. Retain the latest book-and-bridge branding, personalization, credentials, administrator roles, sessions, SB IDs and learning data. Refresh release/cache versions; use the existing verified private backup and unchanged-data checks. Previous production code: `95a2aa9` (1.1.117).

- Add per-user **设为 Plus / 设为普通用户** controls and classification counts in the developer console, retaining visible user badges in the sidebar and Settings. Authenticate administrators, bind changes to their session/actor and expected current tier, and atomically preserve credentials, roles, invitation history and learning data. Explicit stored classifications override historical invite evidence; keep adjustment metadata private and allow later redemption of a new valid code.
- Synchronize user labels through Settings reads and existing active-user heartbeats without rebuilding learning pages or losing drafts. Update visible admin classifications/counts during existing polling, guard against stale account/response updates, and retain creator access when changing an administrator's membership. Authorized for this production release; preserve existing accounts and learning data.
- Validate 303 passing combined regression tests and 194-file source/assets/version checks after retaining the latest 1.1.117 branding release, covering administrator-only changes, CSRF/actor/target checks, stale decisions, explicit historical-user downgrades, local/DynamoDB persistence and unchanged credentials/roles/sessions/data. Verify desktop and 390 px admin controls, upgrade/downgrade counters, retained admin input, synchronized user/Settings badges and retained learning drafts using isolated fixture accounts.

- Let both Google login and registration immediately enter the site, creating an ordinary account for a new verified Google email and retaining existing accounts. Recover concurrent first-login account creation without duplicates; preserve browser-bound OAuth and PKCE.
- Add **设置 → 账号与资料 → 账号类型 → 补填邀请码**. Authenticated ordinary users can redeem a valid one-use code to become Plus after entry. Bind redemption to the current session/account, atomically claim the code and upgrade the existing account, preserve credentials/roles/sessions/learning data, and avoid consuming additional codes on retries or already-Plus accounts. Show immediate membership updates and retryable errors without storing codes in browser storage. Extend the existing review branch; no AWS deployment.
- Validate 295 passing regression tests and 194-file source/assets/version checks; cover direct first Google login, concurrent account creation, deferred redemption, CSRF/account isolation, one-code and two-code races, idempotent retries, failed persistence and unchanged credentials/admin rights. Confirm the local Google-first → Settings → Plus flow, Chinese errors, immediate sidebar updates, retained SB ID after reload, and a 390 px form without overflow using isolated fixtures.

- Open email and Google registration with optional invitations: empty codes create standard users; valid one-use invitations create Plus users. Always validate supplied codes, including with legacy invitation-gate settings; retain delivered email verification, verified Google identities, one-use redemption and administrator roles.
- Add server-owned membership classification and show it in Settings, the sidebar and admin user management. Legacy users with saved invitation evidence automatically resolve to Plus without rewriting credentials, roles or learning data. Both tiers currently have the same features. Make invitation-free DynamoDB registration atomic to preserve email/account uniqueness. Prepared on a task branch; no AWS deployment.
- Validate 291 passing automated tests and 194-file source/assets/version checks, including ordinary/invited email and Google signup, delivered email-code enforcement, historical classification without record changes, one-use/invalid codes, client tier/role tampering, concurrent DynamoDB registration and retained Google/password identity. Inspect desktop registration, both membership badges, admin classification and 390 px Settings without overflow using isolated fixtures.

- Add **日程 → 按课程管理日程** with one-action bulk editing/deletion across all months. Review affected counts and examples, choose not-yet-started or all course entries, and restrict by Lecture, Tutorial, assignments/exams or personal plans. Add individual edit/delete actions with scope selection; preserve course materials and chats. Time edits retain occurrence dates and school-local daylight-saving conversion, with selective room/link/notes edits and single-entry title/date edits.
- Validate all selected edits before saving; process larger course selections in batches with atomic local/DynamoDB writes, user/schedule ownership checks, conditional conflict protection and retryable outstanding batches. Prepare on a task branch without deployment.
- Validation: 294 passing tests and 196-file source/assets/version checks. Browser verification covers 82-occurrence editing, retrying only the remaining two after a failed second batch, scope/type counts, cancellation, cross-month full-course deletion, retained material/other courses, persistent individual title/date editing and a 390 px dialog without horizontal overflow.

- Release `1.1.117`: publish the owner-approved monochrome book-and-bridge logo by default and the blue-purple/mint alternative in **设置 → 个性化 → 品牌 Logo** from `5a0f0a7`. Refresh release/cache versions and retain existing accounts, courses, chats, schedules, authored files, login configuration, palettes and dark-mode settings without migration. Use the existing verified private backup, unchanged-data checks and automatic code rollback workflow. Previous production code: `f351b25` (`1.1.116`).
- Release validation: 287 passing tests, 191-file syntax/assets/version checks and deployment-script syntax checks; require the production dependency-audit gate before installation. Record the existing online account's five courses, appearance and learning preferences for read-only post-deployment comparison.

- Keep both approved book-and-bridge identities: use the monochrome logo by default on the homepage, login, app sidebar and browser tab, and add an indigo/mint option under **设置 → 个性化 → 品牌 Logo** with visual previews and account-scoped saving. Retain existing palettes and dark-mode choices independently, reset the logo on logout, include it in preference exports and preserve both original design proofs alongside scalable SVG assets. Prepared on a task branch for review without deployment.
- Validate 287 passing tests and 191-file syntax/assets/version checks against the latest registration-verification release. Browser checks cover the homepage/login/app identity, immediate logo switching, refresh and new-login restoration, palette/dark-mode independence, failed-save retry, logout/account isolation and a 390 px layout without horizontal overflow.

- Release `1.1.116`: enable owner-approved SES registration email codes with branded HTML cards, prominent selectable six-digit codes, 15-minute expiry and plaintext fallback. Keep code values out of subjects. Validate 282 passing tests and 191-file source/assets/version checks. Store SMTP credentials in encrypted Actions Secrets and apply private server settings with backup/rollback; retain latest 1.1.115 account and schedule behavior.

- Prepare SES SMTP activation through an encrypted deployment secret and SSH input. Restrict the dedicated sender to `noreply@studybridge.ink` in Canada Central, validate TLS/authentication before activation, preserve unrelated private settings and restore configuration after failed startup. SES production access, mailbox delivery, SPF and DKIM verified; alternate verified senders rejected. Validate 278 passing tests and 188-file source/assets/version checks after merging current 1.1.114 account-security and schedule updates; website activation awaits release approval.

- Prepare delivered six-digit email verification for invited registration, with server-driven requirements, accessible code entry, 60-second resend countdown, retained form contents and code clearing when the mailbox changes. Forward registration invitations to Google, whose verified email remains accepted.
- Enforce mailbox/purpose binding, one-time use, 15-minute expiry and five-attempt limits; serialize concurrent code operations in the single application process. Disable page-code fallback in production, remove failed-delivery challenges and return safe retry feedback. Existing password logins and manual reset requests remain available. Add isolated service/HTTP coverage and activation documentation; mail provider setup, live inbox verification and AWS deployment remain pending.
- Validate the full automated suite and source/assets/version checks, plus isolated browser registration with simulated mail, incorrect-code feedback, successful account creation, form retention, email-change clearing and restored resend countdown after switching tabs. Use strongly consistent DynamoDB challenge reads to avoid stale attempts or consumed codes.
- Release `1.1.115`: clear and collapse manual schedule input immediately after saving, retain complete visible fields on validation/save failure and distinguish calendar refresh failure from save failure. Refresh frontend/cache versions; preserve accounts, schedules, security and appearance settings. Previous production code: `372b391` (`1.1.114`).

- Clear and collapse the manual schedule form immediately after a successful save, independently of calendar refresh. Capture all visible fields before validation/save so errors retain a complete retryable draft; distinguish a refresh failure from a save failure to avoid duplicate additions.

- Release `1.1.114`: collapse course-file import and clear uploaded file, extracted results and temporary semester settings after all confirmed batches save. Keep failures and partial saves retryable, preserve saved courses and unrelated quick-entry text. Refresh frontend/cache versions; previous production code: `b7271dc` (`1.1.113`).

- Collapse course-file import after all confirmed batches save successfully; clear the uploaded file, extracted preview/source, recognized-course preview and temporary semester settings, and show a success toast. Retain file, preview and settings after failed or partial saves for retry; preserve saved courses and unrelated quick-entry text.

- Release `1.1.113`: after confirming AI-organized text/voice schedules, collapse Add schedule and clear the input/transcription/audio state. Preserve input and preview on failed or partial saves, and leave file-import quick drafts intact. Refresh frontend/cache versions; retain all account and schedule data. Previous production code: `0344fe4` (`1.1.112`).

- After successfully confirming AI-organized typed or voice-transcribed schedules, collapse Add schedule and clear the input text, transcription status, audio retry file and source. Keep the success notice visible as a toast; retain drafts/text on failed or partial saves for retry.

- Release `1.1.112`: publish owner-approved Add schedule and Import from course files entry points above the full agenda. Refresh frontend/cache versions; preserve drafts during clock refreshes and retain all accounts, calendar data, security and appearance settings. Previous production code: `c453ed5` (`1.1.111`).

- Move Add schedule and Import from course files between the monthly calendar and the full agenda so long lists no longer bury either entry point. Keep form drafts/disclosure state intact during calendar/agenda clock refreshes.

- Release `1.1.111`: publish the owner-approved **黑白灰简约** appearance option from `118b744`. Add it alongside the seven existing palettes without changing defaults, saved appearance records or dark-mode choices. Retain all accounts, courses, calendars, chats, authored files and login configuration; use the existing verified private backup and unchanged-data checks. Refresh release/cache versions. Previous production code: `6e665ce` (1.1.110, including account security).
- Release validation: 266 passing tests and 182-file syntax/assets/version checks, including retained account security, an existing graphite/dark selection retained across restart, new-palette persistence, account isolation and unchanged preferences. Record the signed-in production account's appearance/mode and courses for read-only post-deployment comparison.

- Add **黑白灰简约** as an eighth optional Settings → 外观与显示 palette (`monochrome`), matching the homepage's white/light-gray/charcoal surfaces and thin frames. Retain all original palettes, current selections, account-scoped saving and independent dark mode; retain semantic calendar/status colors and authored Office content. Prepared on a task branch without deployment.
- Validate 256 passing tests and 181-file source/assets/version checks, including new-palette HTTP acceptance, persistence through restart, account isolation and dark/light restoration. Local browser checks cover eight choices, saved selection after reload, night-mode restoration, retained unsent drafts, a 390 px option list without overflow, other main destinations and neutral editor surrounds with unchanged white document paper.
- Release `1.1.110`: publish the owner-approved **账号安全** settings from `bf4a641`, enabling Google-first password setup and current-password-verified changes while retaining the same accounts, Google bindings, SB IDs and saved data. Refresh release/cache versions. Use the existing verified private pre-install backup, data/configuration checks and rollback workflow; previous production code: `fc0cc7d` (1.1.109).

- Add **账号安全** to Settings. Google-first users can set a website password after a recent Google sign-in; password users can change it by confirming their current password. Both methods retain the same account, SB ID, Google binding and saved data. Add explicit save/status/retry feedback, matching confirmation, 8–128-character limits, and clear password drafts on close/navigation.
- Protect password changes with session-bound CSRF, account checks, per-account attempt throttling, atomic expected-hash writes in local/DynamoDB storage, and credential-version session revocation. Rotate the current session after saving, retain Google login and creator-assisted recovery, and preserve legacy sessions until a password changes. Authorized for production release; existing credentials and sessions are retained until their owner changes a password.
- Validate 266 passing automated tests and 182-file syntax/assets/version checks. Cover Google-first setup, both sign-in methods returning the original account/course, wrong/mismatched passwords, expired Google proof, CSRF/account isolation, concurrent local/DynamoDB password writes, session rotation/revocation and manual recovery. Inspect desktop and 390 px Settings layouts and the re-verification state with isolated fixture accounts.

- Release `1.1.109`: match login and registration to the approved homepage with white/light-gray surfaces, charcoal buttons, thin frames, the shared bridge wordmark and a homepage link. Scope all new styling to authentication so saved learning-space themes remain unchanged. Retain existing field IDs, action handlers, invitation/email-code registration, password help, Google sign-in and authenticated redirects. Refresh release/cache versions; deploy with the existing verified private backup and data/configuration preservation checks. Previous production code: `5662fef` (1.1.108).
- Validate 256 passing tests and 181-file source/assets/version checks, plus isolated browser checks for incorrect-password feedback, successful login/logout, one-use invitation registration, post-registration profile routing, enabled Google controls and a 390 px registration layout without overflow. Confirm authentication styles disappear on entry to the learning space.

- Release `1.1.108`: publish the owner-approved neutral StudyBridge homepage, dedicated `/login` and authenticated `/app` entry, retaining legacy bookmarks and the already-deployed browser-bound/PKCE Google sign-in. Refresh package/frontend/cache versions. Use the existing verified private pre-install backup and rollback workflow; retain production accounts, session/configuration, courses, schedules, community, chats and authored files without migration. Previous production code: `1165f3c` (1.1.107 with Google sign-in).
- Combined release validation: 256 passing automated tests and 181-file syntax/assets/version checks, including retained password login, Google identity/account/course preservation, browser-cookie validation and homepage redirects. Keep the existing production dependency-audit gate and private verified-backup prerequisite.

- Restyle the introduction homepage in neutral white, light gray and charcoal, replacing every green and colored demo accent. Add a thin header divider, simplify the headline underline and straighten the framed previews with lighter shadows. Retain mobile layouts, content and entry/login routing. Verify 5 entry-route regression tests, 177-file syntax/asset checks, neutral-only color values, and desktop/390 px browser layouts without overflow. Prepared on the review branch without deployment.

- Add a responsive StudyBridge introduction homepage at `/`, with upper-right **进入 StudyBridge** and **开始使用** links into `/app`. Route guests to `/login` and valid sessions directly into the learning space; keep the homepage accessible to both. Retain existing account, registration, course, schedule, tools, appearance and data behavior. Preserve legacy root/index bookmarks and requested pages through login, return Google sign-in to the appropriate entry, show escaped OAuth errors and link login back to the homepage. Prepared on a task branch for review; no AWS deployment.
- Validate 253 passing automated tests and 177-file syntax/asset/version checks, including isolated HTTP checks for authenticated/guest/revoked sessions, legacy bookmarks and simulated Google callbacks. Verify desktop and 390 px mobile layouts, 320 px overflow bounds, homepage entry before/after login, logout, legacy schedule-page restoration, feature anchors and expandable FAQs in Chrome with an isolated temporary database.
- Correct the Google activation preflight for the existing server's development runtime: explicitly enable production mode with the private Google settings so host-prefixed OAuth cookies and login session cookies are Secure. Preserve and restore the previous runtime mode on failure, and report only non-secret validation labels when configuration checks fail.

- Prepare owner-authorized Google sign-in on the verified domain, with server-only encrypted credentials, the canonical callback, browser-bound signed state, PKCE, strict verified-email/Google-subject checks, and existing-account/course preservation. Preserve password login and invitation-gated registration. Add private configuration backups, atomic updates and startup rollback; Google Cloud setup, production activation and real account login require live verification.

- Connect `studybridge.ink` and `www.studybridge.ink` to the existing AWS site, with independent Nginx domain routing, canonical HTTPS redirects, a two-name Let's Encrypt certificate, existing automatic renewal, DNS propagation checks and configuration rollback. Verify successful issuance and simulated renewal, trusted TLS on both names, HTTP/www redirects preserving paths and queries, identical new/IP website responses, and continued access to the other hosted site. The domain setup workflow and repository checks passed; retain the application version, accounts and data.

- Release `1.1.107`: deploy the owner-authorized account-save, cloud-pagination, local-transaction and stale-page-load repairs from `a3ec3a5`, retaining all prior releases, current data formats, account/session configuration, seven daytime palettes, saved dark mode, navigation updates, courses, schedules, discussions, chats and authored Office content. Keep the password-reset/email fallback behavior unchanged as requested. Refresh package/frontend/cache versions; previous code release/rollback target: `caf5c5f` (`1.1.106`).
- Require a verified private server-side backup of the existing database, configuration and local authored files before installation. Pause application writes during backup, retain raw paginated DynamoDB items when cloud storage is configured, refuse incomplete snapshots, check unchanged local data/configuration and the expected served application before declaring success, and restore previous code on failure without restoring or deleting user data. Serialize production deployments so another release cannot cancel a backup in progress. Backups and credentials remain outside Git and workflow artifacts.
- Release validation: 248 passing automated tests, JavaScript/asset/version and deployment-script checks, and isolated browser regression across pages, saved themes/dark mode, retained drafts, existing Office projects, admin access and a 390 px Settings view. Deployment backup failure and startup-check failure tests preserve source user records and recover the previous code.

- Add pre-deployment checks for task branches/pull requests and a documented regression matrix covering all existing release workflows. Verify 240 passing tests, 172-file syntax/asset/version checks and isolated Chrome checks for late-response draft retention, all six pages, existing Docs/Sheets/Slides projects, seven daytime palettes, saved dark mode, admin access and a 390 px Settings view. Preserve seeded legacy records and course content. Password-reset/email fallback behavior remains unchanged at the owner's request. Prepared on `codex/data-navigation-integrity`; no AWS deployment or production-data changes.

- Apply the same request lifetime to every page: reject stale data/errors/completion after navigation or account changes, preserve newer loading state and inputs, and load the normalized destination of legacy saved routes. Retain the existing community/classmates lifecycle, chat identities and background streamed replies.

- Prepare an integrity repair from `1.1.106` (`caf5c5f`): preserve existing data formats and release features while preventing concurrent account saves from overwriting unrelated fields, retrying conditional DynamoDB account conflicts, and following every cloud directory scan page, including filtered empty pages.
- Extract the local store into a dedicated module with isolated transaction drafts and single-flight startup loading. Publish memory only after durable file replacement; failed creations, nested edits and deletions cannot leak into later saves. Retain large upload strings, unknown legacy fields, schedule deduplication and Office/conversation save protection; remove superseded per-operation rollback callbacks.

- Release `1.1.106`: publish the owner-authorized 暮色深灰 dark mode and outline navigation icons, retaining the existing seven daytime palettes and restoring the selected one when dark mode is disabled. Keep the `1.1.105` 日程/学习 naming update, refresh package/frontend/cache versions, and preserve production accounts, course materials, schedules, chats and authored Office content. Previous code release/rollback target: `d33bb89` (`1.1.105`).

- Add an account-saved 黑夜模式 in Settings with the reviewed 暮色深灰 charcoal/champagne appearance. Preserve all seven daytime palettes and restore the selected one when dark mode is disabled; retain legacy appearance records, serialized saves, retries, account isolation and authored Office content colors. Replace the five main navigation letters with outline icons and matching rounded selection highlights without moving the layout. Prepared on a task branch for testing; no AWS deployment.
- Validate the display update with 225 passing tests, syntax/asset/version checks and real browser checks across the five destinations, all seven daytime palettes, saved dark mode after reload, retained input drafts and a 390 px Settings view. Confirm Docs paper, Sheets cells and Slides backgrounds retain their content colors.

- Release `1.1.105`: rename the main navigation modules 时间表 to 日程 and 学习区 to 学习. Align the schedule heading, back links, import/accessibility text, settings shortcuts/help and deployment guide with the new names. Refresh package/frontend/cache versions. Previous code release: `9efdd9d` (`1.1.104`).

- Release `1.1.104`: publish the owner-tested three-entry calendar cells with increased desktop space and accurate overflow counts. Refresh frontend/cache versions; retain the deployed community upgrade and all saved schedules/accounts. Code rollback target: `bf6b9e6` (`1.1.103`).

- Show up to three schedule entries directly in each calendar date cell, increase desktop cell space to accommodate them, and count only entries beyond the third in the overflow indicator. Keep compact mobile dots/counts and full day details.

- Release `1.1.103`: deploy the owner-approved community upgrade: explicit multi-channel anonymous posts, concurrent/idempotent likes, paginated history/search, anonymous replies, deletion and private reply notifications. Refresh package/frontend/cache versions and retain `4c2bcf7` (`1.1.102`) as the previous code release. Preserve existing accounts and study/calendar data; cloud historical community indexing advances in bounded restart-safe pages.

- Add explicit multi-channel community publishing with one shared discussion and consistent anonymity; omit profile school/major metadata from public posts. Add anonymous replies, author/admin deletion of posts and replies, channel topic/body search, and private paginated reply notifications with read tracking and discussion links.
- Replace the 80-post cutoff with 40-post history pages. Bound cloud search to 100 feed references per request, replies to 50 and notifications to 30; avoid notification polling. Introduce canonical cloud post records, conditional/idempotent like updates, atomic reply/notification writes, deletion tombstones and a checkpointed incremental legacy index. Keep old posts/replies and legacy-client visibility compatible. Prepared on a task branch for review; not deployed to AWS.
- Validate with 219 passing tests and 169-file syntax/asset/version checks, including 32 concurrent simulated DynamoDB likes, legacy indexing/restart, history beyond 80 posts, anonymous notices and delete permissions. Local browser checks cover explicit all+major publishing with school exclusion, notification opening/read state, anonymous reply drafts/sends, and a 390 px layout without horizontal overflow.

- Release `1.1.102`: apply the approved vivid calendar palette: rose deadlines, sky-blue lectures, bright-green tutorials and yellow personal plans. Match legend dots, calendar chips and agenda badges with soft tinted backgrounds and readable dark text. Refresh frontend/cache versions; preserve schedule and account data. Code rollback target: `ce9e4d6` (`1.1.101`).

- Release `1.1.101`: publish the viewed-month navigation label and relocated return-to-today action. Refresh frontend/cache versions; preserve saved schedules and account data. Code rollback target: `ccad539` (`1.1.100`).

- Show the viewed month between the calendar navigation arrows and update it when changing months or years. Move the return-to-today action beside today's date below the header.

- Release `1.1.100`: publish Sunday-first calendar columns and matching date-grid alignment. Refresh frontend/cache versions; preserve all saved course/event dates and account data. Code rollback target: `3e8d44e` (`1.1.99`).

- Start the monthly calendar week on Sunday, followed by Monday through Saturday. Shift the date grid with the headings so saved meetings, adjacent-month dates, leap days and today/selection markers retain their correct dates.

## 2026-10-27

- Make mock-exam generation default to the format and structure of available previously uploaded questions in the current conversation or shared course materials. Preserve supported question types, sections, numbering/subparts, answer requirements, marks and difficulty while generating new content; honor current overrides and identify references or source gaps.

- Release `1.1.99`: publish amber highlighting and inline guidance for incomplete import fields, persistent validation messages and automatic focus/scroll before saving. Refresh frontend/cache versions; preserve accounts, course materials and calendar data. Code rollback target: `49113ee` (`1.1.98`).

- Highlight incomplete selected import drafts and exact missing/invalid fields with fixed amber status colors, inline guidance and accessible descriptions. Keep a persistent issue count beside confirmation; block saving before progress starts and expand/focus/scroll to the first problem. Clear highlighting as fields are corrected or items deselected, retain nonblocking source warnings and show server/save errors inside the preview.

- Release `1.1.98`: remove university-calendar availability as a prerequisite for weekly import duplicate review. Include bounded-date comparison, conservative unknown-range pattern matching and both upload-order regression coverage. Refresh frontend/cache versions; preserve existing account/schedule data. Code rollback target: `61be81b` (`1.1.97`).

- Fix weekly import duplicate review when university-calendar lookup fails: compare explicit source date ranges independently, or conservatively flag matching stored weekly patterns when boundaries are unknown. Default fully matching patterns to unchecked, retain new dates/weekdays and distinct sections/assessments, preserve manual selection and keep final batch duplicate checks. Comparison-only ranges do not create or replace a university calendar.

- Release `1.1.97`: publish preservation of explicit dates with missing clock times, visible/unchecked existing timetable and syllabus entries, and theme-independent developer health lights. Refresh frontend/cache versions; preserve existing accounts, course materials, saved schedules and chat data without migration. Code rollback target: `2b4b06c` (`1.1.96`).

- Keep developer system-health indicator colors independent of appearance themes: normal stays green, warning stays orange and failure stays red, including under gray-toned themes. Scope the semantic colors to status lights without changing theme accents or status detection.

- Retain duplicate timetable/syllabus entries in import review, mark calendar/batch duplicates and default fully existing entries to unchecked in either upload order. Keep manual checkbox choices, show counts for partly overlapping weekly templates and recheck edited dates/course/calendar settings. Preserve source details, quiz/assignment separation and final server duplicate protection.

- Preserve explicitly extracted dates when a deadline has no clock time. Split draft date/time inputs, show the known date with a missing-time hint, and recover a unique explicit due date from item evidence/notes without using a late-acceptance cutoff or guessing a year/time. Keep source details, incomplete-item validation, timezone conversion and duplicate checks; update file and natural-language extraction contracts.

- Release `1.1.96`: publish the additional 16 px indentation for course conversations and their selected backgrounds. Refresh frontend/cache versions so existing browsers receive the new spacing. No account or data migration; code rollback target: `cdb3b70` (`1.1.95`).

- Increase the indentation of conversations within each course by 16 px so chat titles and selection highlights clearly sit beneath their parent course without adding card borders or vertical spacing.

- Release `1.1.95`: publish individual course conversation deletion with private-attachment cleanup and late-reply protection, together with the compact flat course directory. Refresh frontend/cache versions; preserve existing courses, shared materials, schedules, accounts and undeleted chat history. Code rollback target: `bc275be` (`1.1.94`).

- Simplify the course sidebar into a compact, flat directory: remove nested rounded course cards, tighten row spacing and indentation, omit repetitive default Current term subtitles, and retain custom term labels, selected chat highlighting and visible action buttons.

- Add deletion for individual course conversations, including the legacy default: confirm before removing messages and private attachments, preserve shared documents/schedules and other chats, switch away from deleted selections and discard their drafts. Persist deletion markers so late AI replies and renames cannot revive removed chats.

- Release `1.1.94`: publish all pending fixes together: continuous reply loading/stop button, academic-only learning preferences, hidden internal planner chat, multi-select agenda type filters and removal of repetitive course-folder help. Refresh frontend/cache versions; preserve production accounts, schedules and chat data without a data migration. Code rollback target: `1a18a2c` (`1.1.93`).

- Remove the repeated conversation-independence/material-sharing hint from each expanded course folder to keep the course list compact.

- Add multi-select type filters below the agenda status tabs: Lecture, Tutorial, assignments/deadlines, Quiz, exams and personal plans. Combine types across pending/all/completed lists, keep chronological ordering, update counts and overdue notices, and clear with All types. Classify legacy quiz/exam titles for display without rewriting stored records; retain the full month calendar and completion rules.

- Hide the internal Schedule & Deadlines folder from the study chat/course list and skip it when restoring a selected chat. Preserve its course record, historical chats and documents, calendar reads, personal-event saves and duplicate checks; this is a presentation change without a data migration.

- Scope saved academic response preferences to actual learning intent, including academic questions in general chat. Let the reply model infer scope from the current question and relevant follow-ups, with explicit everyday/product-question and mixed-topic rules. Ordinary questions follow the user's language without forced bilingual duplication, while useful API/HTTPS/BYOK terms remain intact. Preserve explicit language requests, academic checkbox combinations and saved preferences; clarify scope in the sidebar and settings.

- Show a continuously rotating loading ring with a clear 停止 action on the Study Area send button while a reply is pending. Keep stop-generation behavior and accessible action labels, respect reduced-motion settings, and preserve the spinner node across streamed updates so the animation does not repeatedly restart.

- Release `1.1.93`: organize courses as expandable folders containing independently titled conversations. Add new chats, first-question titles and manual renaming; isolate each chat's history, retained uploads, drafts, learning mode and streaming reply while sharing course documents. Keep all historical messages in a compatible default conversation without rewriting data. Include automatic timetable/syllabus course creation, reuse existing names/codes, and file confirmed calendar items under their matching courses. Preserve batch saving, duplicate checks, original course information and account data; code rollback target is `c2bbee1` (`1.1.92`).

- Release `1.1.92`: batch confirmed calendar imports in groups of 80, with real processed/saved/duplicate progress and one final calendar refresh. Check duplicates on the server against all saved meetings (including completed records), preserve complete notes/evidence/time zones/end times/recurrence sources, and make retries safe after interrupted responses. Save each local batch in one file replacement with rollback on failure; use guarded atomic transactions in DynamoDB. Read calendar entries through one authenticated endpoint instead of downloading every course document separately.

- Assign default eight-character alphanumeric SB IDs on the server for email and Google registrations. Accept 1–8 letters/digits with case-sensitive uniqueness, profile saving and classmate lookup; allow existing single-character IDs such as `1`, preserve omitted profile IDs, and align Profile/Settings input rules.

- Configure trusted HTTPS for the existing AWS public IP with an isolated Certbot IP certificate, HTTP challenge/redirect, Nginx forwarding to the existing StudyBridge process, 70 MiB proxy requests and unbuffered AI streaming. Check renewal every six hours and reload Nginx after successful renewal; preserve the other hosted site's certificate and all StudyBridge accounts/data.

- Prepare the authorized `1.1.91` AWS release of the 待完成 agenda: retain past/overdue personal plans and assignments until manual completion, preserve automatic class completion and chronological order, and distinguish the separate 下一项安排 highlight. Refresh package/frontend/cache versions; keep `1325a14` (`1.1.90`) as the rollback target and preserve production accounts, data and credentials.

- Rename the agenda's upcoming tab to 待完成 and retain every unfinished assignment and personal plan, including past/overdue items, in chronological order. Preserve automatic Lecture/Tutorial completion and manual task completion; label the separate future-event highlight 下一项安排 to distinguish it from the pending list.

- Prepare the authorized `1.1.90` AWS release of the monthly calendar and unified agenda, automatic Lecture/Tutorial completion with manual assignment completion, syllabus assessment extraction and duplicate checks, compact mobile import review with complete notes, and everyday-language/voice entry. Refresh package/frontend/cache versions and retain `cb0a035` (`1.1.89`) as the code rollback target. Preserve production credentials, accounts and stored materials; exclude databases and temporary previews. Direct microphone recording needs HTTPS/browser permission; voice-file upload and phone-keyboard dictation remain available on HTTP.

## 2026-10-26

- Add everyday-language and voice entry to Schedule. Parse multiple personal plans/classes/deadlines into editable compact drafts with explicit timezone/current-day/selected-day context, end times and duplicate checks; save only after confirmation. Record bounded audio with microphone cleanup/cancellation or import a voice file, transcribe through the server, and retain editable text on errors. Keep manual entry and file imports, with accessible recording states, retry, mobile layout and an HTTPS/keyboard-dictation fallback.

- Compact pending Schedule imports into selectable, expandable cards. Keep title/type/time, course/location and a two-line notes preview visible; preserve complete notes, tutorial topics, evidence, warnings and editable fields inside each card. Open incomplete items for correction, retain disclosure/draft state during navigation, and keep a selected-count confirmation bar within reach on mobile without pagination or a nested scrolling list.

- Prioritize syllabus quizzes, tests/exams and assignment deadlines as separate manually completed tasks. Match repeated timetable Lecture/Tutorial occurrences by normalized course, meeting type, actual instant and compatible section identifiers rather than title, including school time zones and UofT term suffixes. Skip duplicates during extraction review and recheck fresh saved items at confirmation; preserve distinct courses/sections and same-time assessments, count only new occurrences in previews, and avoid creating an empty planner for duplicate-only imports.

- Automatically treat elapsed Lecture/Tutorial meetings as completed at their valid end time (or recorded start time when no end is available), with no manual completion button or database rewrites. Share the rule across calendar/day/agenda views and server AI context; keep overdue assignments unfinished and visible until explicitly completed. Preserve prior manual completion records and refresh class status while the calendar stays open.

- Label unfinished Schedule actions 完成; reserve 已完成 for the status and completed view after the student clicks the action.

- Redesign Schedule as a monthly calendar with today/month navigation, selectable day details and a separate chronological agenda spanning all months. Show the next event and ongoing classes, distinguish Lecture/Tutorial/deadlines/personal plans, retain completed and overdue entries, and add day-prefilled personal arrangements with optional end times. Preserve existing imports, upload selections and manual drafts during calendar navigation; retain imported duration/time-zone/recurrence data when marking entries complete.

- Prepare the user-authorized `1.1.89` AWS release containing all five locally reviewed updates: school suggestions, 50 MiB course materials, community replies, profile-photo compression and weekly timetable/calendar defaults. Bump package/frontend/cache versions and retain `3348e36` (`1.1.88`) as the code rollback target; exclude databases, credentials, browser fixtures and temporary verification files.

- Treat timetable LEC/TUT grids as weekly patterns, preserving original image/PDF layout. Look up teaching dates and no-class periods from the Profile school's official calendar with source/year/scope checks, then expand only upcoming teaching-day occurrences through the last class day with DST-aware school-local times. Show one shared semester/source summary and grouped meeting rules; preserve one-off deadlines and ask only for genuinely missing weekday/time or unverified semester information. No reminders are created before confirmation.

- Accept profile source photos up to 25 MiB and resize/compress avatars and covers locally before upload instead of rejecting photos over 2 MiB. Bound encoded images for profile storage, preserve saved images when no replacement is selected, show save progress and actionable decode errors, and reject oversized API image values instead of silently truncating them.

- Add persistent per-post community discussions: authenticated replies with account names and timestamps, isolated post threads, older-reply pagination, refresh, retained drafts and retryable errors. Store replies separately in local JSON/DynamoDB so concurrent responses do not overwrite the original post or likes; exclude account IDs from public reply responses.

- Raise authenticated course-material uploads to 50 MiB per file, with a shared browser/server limit and a route-specific JSON limit that includes base64 overhead. Read multi-file uploads sequentially, show progress and retain successful files after a partial failure. Preserve smaller limits on chat, Schedule and Office-editor imports, private PDF storage and bounded AI visual context; document reverse-proxy requirements and large scanned-PDF limitations.

- Restore school-name suggestions in Profile and Settings, including dynamically created forms. Match full names, abbreviations and Chinese aliases; selecting a suggestion fills the full school name. Preserve manual entries and explicit profile saving, and support arrow keys, Enter, Escape and IME composition without submitting the form.

- Prepare the authorized `1.1.88` AWS release: compact course materials/preferences (`b6ad697`), rename 自定义要求 (`5b21033`), and add Enter-to-send with Shift+Enter/IME safeguards (`9c1d643`). Preserve production data and credentials; record `b8e34fe` (1.1.87) as the rollback target. Recheck source/assets, full tests, actual browser save/upload/keyboard behavior and the high-severity production audit gate before deployment; one existing moderate Nodemailer advisory remains outside this UI-only release.

- Study Area and General Chat now send with Enter and retain Shift+Enter for a newline. Ignore IME composition/legacy key code 229, held-key repeats, modified Enter, empty submissions and active replies; reuse the existing send action and error handling.

- Renamed the Study Area learning-preference instruction label from 补充要求 to 自定义要求, without changing its saved value or behavior.

- Updated to `1.1.88`: compacted Study Area course materials and learning preferences. Aligned note/title/file controls with accessible save/upload icons, reduced textarea heights, styled the native file picker, and bounded long material lists. Replaced repeated bilingual preference explanations with concise checkbox labels, a labeled optional instruction field and a compact save/retry action. Preserved account-level autosave and Settings synchronization.
- All 141 tests and 141-file source/asset checks passed. Real isolated-account browser checks verified note save, file upload, preference save/reload, 1440/1100/390/320px layouts and overflow; the complete Settings browser regression also passed. Prepared on `codex/study-sidebar-layout` for local review; not deployed to AWS.

- Prepare the user-authorized `1.1.87` AWS release of the complete settings center and six optional muted themes (`49c47c1`), retaining the original blue/green default and the already released invitation clipboard fix (`e331ddd`). Refresh package/frontend/cache versions and preserve `e331ddd` as the rollback target. Production data and credentials are excluded; deployment and live verification follow the main push.
- Merged release validation passed all 141 tests, 141-file source/asset checks, settings browser checks and the configured high-severity production dependency audit gate. The audit reports one existing moderate Nodemailer advisory; no dependency changes are included in this interface release.

- Expand Settings into a category-based center with account/profile, learning/AI, appearance, courses/reminders, privacy/data, and help/about panels. Keep a left sidebar on desktop and category-list/detail/back navigation on mobile, with logout inside Settings.
- Connect real profile edits, shared autosaved Learning Style controls, the existing password-reset request, course/timetable/profile navigation, preference-only JSON export and usage help. Preserve avatar/cover images on text saves, form drafts across category changes, and current chat/editor state; clearly identify unavailable push notifications without dummy switches. Prepare `1.1.86` on the existing review branch.
- All 135 automated tests and 139-file source/asset checks passed. Browser checks covered category navigation, real profile save/rejection/retry, shared learning preferences, JSON downloads, timetable links, all seven themes, saved settings after login, pending preference saves immediately before logout, draft/attachment retention, live replies, authored Office colors, and 1600/1100/390/320px layouts without browser errors or horizontal overflow. Not deployed to AWS.

- Add Settings beside StudyBridge in the former logout position and move logout into its accessible dialog. Keep the current blue/green appearance as the default; offer six white-based muted themes: 烟紫灰, 石墨灰, 雾蓝灰, 灰玫瑰, 青瓷灰 and 冷银灰.
- Apply colors without rebuilding the current page, preserving drafts, attachments and active replies. Save appearance per account in a separate local/DynamoDB record with serialized writes, save/retry feedback and account-scoped browser caching. Restore original colors on default selection and logout; leave authored Office content colors intact.
- All 134 automated tests and 137-file source/asset checks passed. Local Chrome verification covered all seven themes, the six student pages, original-color restoration, saved account settings after refresh/login, save failure/retry, retained drafts/attachments, changes during a streamed reply, authored Docs text-color preservation, and 1600/1100/390/320px layouts without horizontal overflow or browser errors. Prepared `1.1.85` on `feat/personal-appearance-settings` for review; not deployed to AWS.

- Prepare the user-authorized `1.1.86` AWS release of clipboard compatibility (`9308e89`) from stable `1.1.84`. Keep the unrelated, unfinished `1.1.85` appearance work outside this release. Bump package/entry versions and preserve `27f1535` as the rollback target; production databases and credentials are excluded.

- Fixed invitation copy buttons on HTTP sites and browsers without an available Clipboard API. Fall back to a temporary selected text field when modern clipboard access is unavailable or denied, check actual copy acceptance, restore focus/selection, and show an honest success/failure message. Reuse the helper for the existing reply-copy command.
- Invitation copy feedback no longer rerenders the admin page, preserving invitation drafts and scroll position. Verified actual clipboard contents and pasting of a newly generated disposable invitation on a non-loopback HTTP origin. Private invitation data remains outside source control.
- All 132 tests and 137-file source/asset checks passed. Verified separate buttons for two invitations, matching clipboard/pasted text, retained drafts, temporary-field cleanup, and desktop/mobile layouts. Initially prepared on an isolated fix branch without unrelated appearance changes; authorized for release above.

## 2026-10-20

- Prepare the user-authorized `1.1.84` AWS release of complete uploaded problem-set coverage and retained native PDF inputs (`eeb84ef`). All 126 tests, 135-file source/asset checks and the zero-vulnerability production audit passed. Preserve `74fcb6a` (`1.1.83`) as the rollback target. Deployment and live verification follow the main push; legacy attachments require re-upload to retain their original PDF.

- Prepare `1.1.84` on a fix branch: correct guided teaching that stopped after the first subpart of an uploaded exam. Enumerate detected questions/subparts, complete the requested scope before optional checks, preserve explicit single-part/hints/interactive requests, prioritize the current upload and retain prior reply completion summaries. Route short PDF tutoring and multipart source tasks to the complex model.
- Retain original chat/course PDFs in private local/DynamoDB material storage and supply native PDF file inputs in both AI APIs and streaming fallback, preserving graphs, table alignment and mathematical notation that text extraction loses. Hide originals from display metadata and delete private course-source files when their source is deleted or its text replaced. Distinguish missing legacy/over-budget visuals and incomplete provider responses instead of presenting partial/unreadable work as complete.
- A real streamed guided request using the reported original PDF and the unchanged earlier shortcut produced 16,113 characters covering all 24 parts, 1(a)–6(d), through `gpt-6.1-sol`; graph-based question 4 was checked against the original page. The full response is retained in the local test account for review. All 126 tests, 135-file source/asset checks and the production audit passed. Desktop/mobile browser checks confirmed all 24 rendered part headings, math rendering, no console errors and no horizontal overflow. Native-file byte preservation, restart/fallback, private storage/deletion and truncated-provider handling have regression coverage. Included in the authorized release above.

- Prepare the user-authorized `1.1.83` AWS release, including manual Office editors (`41db172`) and in-place AI revisions for Docs (`20cff47`), Slides and Sheets (`a91d419`). Upgrade pinned markdown-it and its self-hosted browser bundle to `15.0.3` to resolve newly published denial-of-service advisories and pass the production dependency gate. Preserve `204b67c` (`1.1.79`) as the rollback target. Deployment and live verification follow the main push.
- Repeated release validation after the dependency update: all 120 tests, 132-file source/asset checks, production dependency audit (zero vulnerabilities), and desktop/mobile Office revision/native-download browser checks passed.

- Prepare `1.1.82` for local testing: extend the permanent **AI 赋能** bar to SB Slides and SB Sheets. Preview and apply edits directly to existing slide text/styles/positions, image geometry, notes, backgrounds and transitions, or to multiple spreadsheet values/formulas/styles. Add page/presentation/element and worksheet/range/cell/workbook scopes, contextual shortcuts, named before/after targets and calculated formula previews.
- Share strict source/patch validation between client and server, reject unknown/duplicate/out-of-scope targets and unsafe fields/formulas, preserve untouched data/image bytes/formatting, and apply each batch as one undo step. Invalidate stale and in-flight previews after edits; skip redundant focus checkpoints during undo. Keep the separate full-file AI generator.
- All 120 automated tests and 132-file source/asset checks passed. Browser verification covered all revision scopes, existing-element/image preservation, multi-cell formula/style changes, recalculation/cross-sheet dependencies, stale/in-flight protection, undo/redo, persistence, native PPTX/XLSX downloads and 1600/1100/390/320px layouts; the Docs workflow passed again. Real provider calls through the local service edited slide text/transitions and applied a formula with bold/currency formatting and a checked result of 30. Updated the review branch; not deployed to AWS.

- Prepare `1.1.81` for local testing: add a permanent **AI 赋能** bar beneath the SB Docs title in manual editing. Submit a custom request or polish/academic/concise/translation shortcut for the whole document or selected text, inspect before/after changes, and apply them directly to existing prose instead of appending suggestions. Retain the separate complete-file AI generation workflow.
- Preserve untouched text, paragraph/list/heading structure, images and marks; inherit nearby formatting for rewritten spans and group application into one undo step. Reject stale previews after intervening edits, validate bounded source blocks and AI target IDs, and keep previews separate from persisted work.
- All 116 automated tests passed. Browser checks covered explicit requests, selected/whole-document replacement, formatting/images/lists/line breaks, single undo/redo, stale and in-flight previews, invalid targets, no-op/deletion/emoji changes, persistence and 1600/1100/390/320px layouts. A real provider call returned a valid academic rewrite through the running local service. Source/asset checks passed. Updated the review branch; not deployed to AWS.

- Prepared `1.1.80` with real manual SB Docs, Slides and Sheets editing alongside the existing AI file generator. Docs adds a paper canvas, rich text/font/size/color controls, paragraph line spacing including Double, headings/lists/alignment, page settings, images, undo/redo, DOCX export and printing/PDF.
- Added editable slide pages, visual thumbnails, add/duplicate/reorder/delete, movable/resizable native text and image elements, numeric geometry, fonts/colors/backgrounds, notes, presentation mode, and Fade/Push/Wipe transitions preserved in PPTX exports. Sheets adds multi-sheet editing, formatting, formula bar, TSV paste, row/column growth, safe formula calculation, cross-sheet references, errors/cycle limits and formula-preserving XLSX exports.
- Added private versioned cloud projects with local/DynamoDB storage, immutable chunked content, autosave, browser draft recovery, stale-save conflict handling and save-as-copy. Added Office imports with explicit conversion limitations and preserved the existing AI-generation, image and Cheatsheet workflows. AI suggestions preview writing, editable slide drafts or formulas and apply only after an explicit click.
- Bundled and licensed the lazy-loaded Tiptap/formula editor locally; pinned export dependencies and patched advisory-bearing transitive dependencies. Added model, formula, export/import, authentication/isolation, conflict, DynamoDB chunk and AI-preview coverage. All 114 automated tests passed; browser verification covered 1600/1100/390/320px layouts, manual edits, images/drag/transitions, recalculation, AI apply, native downloads/imports, project switching, cloud reload, conflicting saves and offline draft recovery. Source/asset checks and dependency audit passed. Saved on a review branch; not deployed to AWS.

## 2026-10-16

- Prepare user-authorized `1.1.79` main/AWS release of the Community redesign and school/major channel selection (`73b1702`, `c039cc8`). Refresh package/frontend versions and entry asset cache keys; retain `6a8023a` (`1.1.78`) as the rollback target. Deployment and live verification follow the main push.

- Let students browse school and major communities beyond their profile defaults with searchable suggested channel names, free-text entry, and one-click return to their own school/major. Discover published channel labels without exposing profile directories; keep browsing choices separate from saved personal details.
- Pass the selected destination through feed, publishing and liking APIs; retain profile-based defaults for existing clients and support Chinese channel names. Preserve composer drafts during channel changes, expose loading/retry states, and reject stale channel responses. Keep DynamoDB likes in the post's actual channel and allow liking school/major posts from the combined feed.
- All 107 automated tests and 116-file syntax/asset checks passed, including cross-profile filtering/posting, invalid input, anonymous posts, restart persistence, DynamoDB like storage and channel-load races. Local Chrome verification covered school/major defaults, switching to another school/major, returning to defaults, posting to the selected school, draft retention, and the 390px selector layout. Updated `design/community-layout`; not deployed to AWS.

- Redesign Community with a centered, spacious discussion feed on the left and a separate sticky composer on the right. Stack discussions above composing on phones and in narrow workspaces; add channel navigation, school/major destination labels, author/channel metadata, visible like states, and an illustrated empty state linking to the composer.
- Add scoped community styling, accessible input labels and focus indicators, and input limits matching the posting API. Preserve existing publishing, anonymous posting, channel filtering and like/unlike endpoints; refresh the app asset cache key.
- Verified local Chrome layouts at 1440px, 1100px, 980px, 390px and 320px without horizontal overflow, plus empty-state focus, channel switching, regular/anonymous posting, and like/unlike. All 24 server integration checks and 115-file syntax/entry-asset checks passed. Prepared on `design/community-layout` for review; not deployed to AWS.

- Prepare user-authorized `1.1.78` main/AWS release combining formula rendering (`e023e4c`) with clearer default study explanations. Preserve `fabeba9` (`1.1.77`) as the rollback target; deployment and live verification follow the main push.
- Teach each academic part in goal/method/reason/worked-calculation/answer order, including beginner-relevant intermediate steps, coefficient/exponent changes, substitutions, derivative rules and limit/bound evaluation. Keep conceptual explanations relevant and honor explicit answer-only, brevity, hints, quizzes, print constraints and time budgets.
- Apply Learning Style without reducing explanation depth. Bilingual solutions now teach each part in Chinese before its English answer, rather than listing all final answers first. Recognize image tutoring requests including `teach me`, `walk me through this` and `教我` as complex tasks while preserving ordinary Luna routing.
- All 102 automated tests, 115-file syntax/asset checks and a zero-vulnerability dependency audit passed, including all seven provider prompt contracts, style combinations, saved-image model routing and streaming snapshots. Live AWS behavior is verified after deployment.
- Replace the chat's plain-text math instructions with a shared typeset-notation contract across Learning Style and all study modes. Render inline/display roots, fractions, powers, integrals and limits through pinned, self-hosted KaTeX and local WOFF2 fonts.
- Render balanced arithmetic `sqrt(...)` / `cbrt(...)` calls in older reply prose as real radicals, including nested fractions and grouped fractional powers, without modifying saved history, code or URLs. Keep incomplete/unsupported expressions readable, block trusted HTML/URL commands, bound expansion and formula length, and allow long formulas to scroll locally on phones.
- Add regressions for the reported arc-length expression, nested radicals, streaming prefixes, currencies/code/links, malicious math and identical Node/browser rendering. Originally prepared on `fix/math-typesetting`; included in the authorized `1.1.78` release above.
- All 100 automated tests, 115-file source/asset checks and a zero-vulnerability dependency audit passed. Local Chrome verification at desktop and 390px confirmed historical radicals, a real-model streamed arc-length answer, correctly loaded local math fonts, safe code text and persistence after refresh.

## 2026-10-15

- Prepare the user-authorized `1.1.77` AWS release of the approved profile layout (`2246406`). Update package/frontend versions and entry asset cache keys; retain `27807cc` (`1.1.76`) as the rollback target. Deployment and live profile verification follow the main push.

- Redesign the sidebar profile entry as a compact avatar-and-identity row with a subtle cover accent and navigation arrow. Rebalance the personal profile page with a larger avatar, separate school overview, grouped two-column basic fields, styled image upload controls and a distinct save footer. Stack fields on phones and cards on narrower workspaces; retain existing profile/upload saving behavior.
- Verified the layout at 1440px, 1100px, 390px and 320px, including long names/schools, profile saving, avatar upload and keeping the saved avatar on later edits. All 111 JavaScript/entry-asset checks passed. Prepared on `design/profile-layout` for review; not deployed to AWS.

- Prepare user-authorized `1.1.76` AWS release: connect course Cheatsheet PDF generation/revisions to saved Learning Style, synchronize pending preference saves, and supply selected historical course images as vision inputs and Python reference files.
- Persist private workspace sources per PDF version; carry source copies, previous artifact, selected image names and bounded earlier requests into continuous revisions across refresh/restart. Re-read current course materials and account preferences for each submitted revision, inherit print settings, and reject cross-course/foreign parents. Keep source data out of public job/download responses and clean it up on failure/deletion.
- Add regression coverage for actual HTTP request contracts, late course text, named old images, two successive revisions, changed preferences, restart persistence, deleting an earlier version, original workspace image retention and private-source permissions. Production deployment/live verification follows the main push; rollback target is `d3c2202` (`1.1.75`).
- All 94 tests, 111-file source/asset checks and dependency audit passed. Real Sol generation produced a one-page bilingual slope-field PDF from a retained image; a new service instance revised it without re-upload, switched to English-only preferences, retained the verification footer and added H=60 with slope -8/3. Independently rendered and inspected both PDFs; each passed page/font/margin/monochrome checks.

- Prepare the user-authorized `1.1.75` main-branch AWS release of detailed study explanations (`7f29be1`), durable image message previews (`31ee951`), independent Learning Style preferences and synchronized saving (`21825d6`), and Ctrl+V screenshots with pending image previews (`263efba`). Bump entry asset versions and record `084340b` (`1.1.74`) as the rollback target. Production deployment and live behavior are verified after the main push.

- Support Ctrl+V screenshot/image pasting in the Study Area question input across General Chat and all course modes. Add clipboard images to the existing attachment flow, give repeated screenshots distinct identities, preserve mixed-paste text/caret/focus, and leave ordinary text pasting and other fields unchanged.
- Show removable image thumbnails before sending, release preview object URLs when attachments leave the composer, and validate entire file batches before adding them. Sent screenshots retain the existing private, durable image-message previews.
- All 91 tests and 109-file checks passed. Local browser verification used actual PNG clipboard data and Ctrl+V to check repeated pastes, removals, ordinary/mixed text, loaded thumbnails, sending and refresh persistence. Prepared on the task branch; not deployed to AWS.

- Fix Learning Style preferences being ignored when all three checkboxes were enabled with an empty custom instruction. Resolve English answers and Chinese explanations independently, remove conflicting bilingual prohibitions, and apply the same language contract to all seven study modes. Latest explicit requests override custom style, then checkbox defaults; ordinary Chinese/English question wording does not disable saved preferences.
- Auto-save checkbox/custom-instruction changes with accurate unsaved/saving/saved/error status and a plain-language style summary. Serialize rapid saves, retain drafts on failure, and wait for the latest saved snapshot before sending a question. Keep the explicit save button and use saved profile preferences for API clients that omit the snapshot.
- All 89 tests and 109-file source checks passed, covering eight checkbox combinations, save races/failures/account disposal, every mode, persisted preferences after restart, streaming snapshots and account isolation. Local browser verification with the retained original slope-field image produced an English answer plus Chinese teaching steps; immediately disabling Chinese explanations produced an English follow-up, and an explicit Chinese-only request overrode the saved bilingual settings. Prepared on the task branch; not deployed to AWS.

- Display uploaded question images and filenames in the student's own message bubbles, including immediate local previews, lazy-loaded saved previews, and click-to-enlarge dialogs. Refresh and re-login retain the original question image for comparison with its answer; other attachments show filename cards.
- Serve saved images through authenticated account/course-scoped endpoints with no-store responses and safe raster MIME types. History carries metadata only. Backfill previews for older retained uploads using their originating message IDs without rewriting historical messages; deleting a course removes access to its images.
- All 83 tests and 107-file source checks passed, including stream metadata, image bytes, restart persistence, legacy backfill, invalid/external preview URLs, unauthorized access, and deletion. Verified the reported picture through the actual input uploader, refresh, enlargement, and logout/login in an isolated local browser. Not deployed to AWS.

- Improve academic problem explanations across all seven learning modes: short solve requests now ask for concept definitions, interpretation of given facts and diagrams, justified steps, a concrete calculation when helpful, and a clear conclusion/takeaway. Preserve explicit brevity, hint-only, interactive quiz, cheatsheet and cram limits, language preferences, and general-chat separation.
- Route current/retained problem images with short solve requests to Sol, including follow-up questions, while preserving Luna for photo descriptions and everyday questions. Remove the blanket preference for concise solution steps.
- All 80 automated tests and 105-file checks passed. A live, same-model comparison using the reported slope-field image verified that the revised prompt explains axes, segment slopes, the negative derivative, the H=50 substitution, and why solving H(t) is unnecessary. Prepared on a task branch; not deployed to AWS.

## 2026-10-13

- Updated to `1.1.74`: connected course Cheatsheet conversations to a real PDF workspace. Carry over the current request/uploads and recent course guidance; adjust content, A4/Letter paper, orientation, single/double-sided sheets, columns, minimum text size, margins and monochrome output. Preserve course-scoped drafts/history and earlier versions; offer previews, downloads and authenticated native PDF-viewer printing.
- Check all PDF pages for exact page count/dimensions, selectable text, minimum font size, text bounds and monochrome vector/text colors. Retry a print-layout failure once, without publishing invalid output. Added embedded-font regression coverage for server-only PDF inspection. Printer duplex/scaling settings remain under the user's control; automated checks do not guarantee column structure or raster-image colors.
- All 78 tests and 105-file source/asset checks passed; dependency audit reported zero vulnerabilities. Verified the course-to-PDF workflow, attachments, layout controls, revision history, reload and print links at 1440px/1100px/390px/320px. Prepared the authorized AWS release including `1.1.72` General Chat and `1.1.73` document/image extensions; video remains closed.
- Live API generation produced a selectable Chinese A4 one-page, two-column economics PDF with an actual-content PNG preview, passing all print checks after fixing the legacy PDF.js embedded-font namespace. One earlier provider request returned temporarily unavailable; failures were not published as successful output.

- Updated to `1.1.73`: replaced text-only document/table/slide helpers with authenticated generation jobs for real Word/PDF, editable Excel/PowerPoint and PNG images. Added source uploads, optional owned-course context, previews, downloads, per-tool drafts, revision history, cancellation and deletion; preserved the existing email and Study Area workflows.
- Documents use a fresh hosted Code Interpreter environment with layout/content review instructions and mandatory primary/PDF/PNG deliverables. The app checks file formats/Office structure, rejects macros/OLE/external workbook links, and never executes generated code on the host. Images support both generation and actual-source editing. Prepared asynchronous video generation, but disabled its UI and API by default before any provider call.
- Stored private files outside public assets and outside the main local JSON database, with account-scoped DynamoDB material storage as an alternative. Added durable hourly quotas, bounded file sizes/concurrency, restart recovery, timeout/error handling, partial-output cleanup, and authenticated no-store downloads. Documented API permissions/charges, backup requirements and quality/native-layout verification limits.
- All 74 automated tests and source/asset checks passed, including real HTTP permissions/download headers, durable local/DynamoDB storage, quotas, file validation, revisions and cancellation. Verified 1440px/1100px/390px/320px previews, downloads, draft/upload preservation and closed video controls. Live API checks generated four document formats and an image; confirmed selectable Chinese PDF text, Excel formulas with cached totals 1520/480, editable three-slide PPT with notes, one-page Word revision, and an image edit retaining its original composition. Inspected generated previews; independent native Office rendering on this machine was unavailable. No real video generation was requested.

- Updated to `1.1.72`: added a permanent General Chat entry beside courses in the Study Area, with everyday-question shortcuts, a neutral welcome, and no academic mode selector or course-material controls. It works without creating any course and remembers the selected conversation per account.
- Reused authenticated, account-scoped message and attachment storage for separate durable general history, JSON/streaming answers, cancellation, Markdown, and newest-message scrolling. General questions do not inherit other courses' materials or study workflows; course lists/counts remain unchanged, and general messages are included in DynamoDB user statistics. Protected the virtual entry from course deletion and document writes.
- Cleared the previous conversation while switching spaces so loading does not temporarily display another course's history. All 62 automated tests and 96-file source checks passed, including account/course isolation, restart persistence, attachment follow-ups, mode enforcement, and streamed replies. Verified 1440px, 1100px, 390px, and 320px layouts, no-course entry, selection persistence, existing study modes, sidebar positions, and streaming/cancellation regressions.

- Released `1.1.71`: preserve task model selection through web search, preview retries, and Chat Completions fallback. Complex tasks always use the configured Sol model instead of a 15% lottery; ordinary tasks remain on Luna even with large saved course materials or long old replies. Retain task complexity across short follow-up questions.
- Verified the pre-release AWS runtime was already configured with `gpt-6-luna` and `gpt-6.1-sol`. Updated defaults and removed legacy percentage/web-model overrides. Added admin-only runtime web-routing and last-completed-model/API diagnostics without storing question text. Updated the frontend version marker to match the release.
- All 59 tests and the 94-file source checks passed, including JSON/streaming web routes, deprecated overrides, compatibility fallback, repeated complex requests, ordinary questions with long saved context, and follow-up routing.

- All seven Study Area modes now reference complete saved course text and durable chat attachments. Removed the first-eight-document and 1,800/9,000/12,000-character truncation paths; retrieve relevant passages across the entire corpus for larger collections, while retaining full smaller collections and source filenames.
- Persist extracted attachment text and vision inputs per account/course for later questions, mode changes, and restarts. Chunk large DynamoDB materials, paginate queries, keep attachment payloads out of chat-history responses, and remove saved material when its course is deleted. Mark interrupted replies as incomplete in subsequent prompts.
- Previously discarded text and historical filename-only chat attachments require re-upload; unreadable/scanned files still need readable text. Prepared the user-authorized 1.1.70 main-branch AWS release.
- All 54 automated tests and the 92-file source checks passed. Coverage includes all seven modes, late material in the 50th source, Chinese queries, retained images, stream-upload follow-ups, restart persistence, course isolation, Unicode chunk reconstruction, deletion, and paginated DynamoDB queries.

## 2026-10-12

- Updated to `1.1.69`: fixed desktop creator-console scrolling with a viewport-height, independently scrollable admin workspace. Invitation, user, and reset sections remain reachable with the wheel while the sidebar stays in place. Same-page renders preserve the admin scroll position; mobile document scrolling and student chat layouts retain their existing behavior.

- Prepared the user-approved `1.1.68` AWS release with recent user activity only, based on the stable `1.1.66` production branch. The unreleased `1.1.67` Tools workspace redesign remains on its original test branch. Updated entry asset versions and recorded the previous production rollback target.

- Added admin-only recent online timestamps with relative minute/hour/day labels and exact-time tooltips. Successful logins and visible, recently active browser sessions update a server-timed record at most once per minute; hidden or five-minute-idle tabs stop heartbeats. Existing users without recorded activity show no history rather than a guessed timestamp.
- Stored activity separately from profiles in both local and DynamoDB databases to preserve concurrent profile edits. The creator console refreshes activity labels without replacing forms or user input; ordinary users cannot view other users' activity or supply another user's timestamp.
- All 47 automated tests passed, including activity persistence, throttling, conditional DynamoDB writes, permission boundaries, legacy accounts, and relative-time/idle-tab behavior. Verified responsive admin labels with isolated preview data.

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
