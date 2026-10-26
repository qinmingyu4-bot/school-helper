# Changelog

## 2026-10-26

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
