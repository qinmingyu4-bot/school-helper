# Page-load performance

Initial optimization baseline: `974a751` (1.2.16). The owner authorized production
release 1.2.19 on 2026-11-06. The release incorporates the latest production
`7a6f0b1` (1.2.18), retaining compact timetable review, aligned reminder settings, failed-login protection, asynchronous password
verification, private API headers, dependency fix and unchanged-allowance-write fix.
The original performance branch passed all 600 Linux/Nginx regressions before integration.

## Delivery and invalidation

- `lib/static-assets.js` prepares each entry's scripts in their original order
  and serves one deferred JavaScript bundle. The complete CSS cascade, including
  inline base styles, becomes one stylesheet; relative KaTeX font URLs are rebased.
- Both bundles use a SHA-256 content fingerprint in their path. Direct entry
  references to other JS/CSS/SVG assets use a validated content fingerprint query.
  Those resources, and existing versioned WOFF2 fonts, are public/immutable for a
  year. A forged or stale fingerprint query gets revalidation, not immutable caching.
- Old/manual `?v=` and unversioned resource URLs use `max-age=0, must-revalidate`
  plus content ETags. Conditional requests return 304; changed content returns 200.
  Missing bundles return 404 rather than an HTML fallback.
- HTML, auth redirects and `push-worker.js` remain `no-store`. Authentication
  guards still run before the app/login entry is sent. APIs, account data and AI
  event streams do not enter the public asset cache or compression pipeline.
- Brotli and gzip use asynchronous compression, shared per-file promises, and
  `Vary: Accept-Encoding`. HEAD and encoding quality/exclusion rules are supported.
  File content and representations are an in-memory process snapshot, keyed by
  canonical paths rather than arbitrary query parameters. Restart after public-file
  edits. No build dependency, checked-in bundle, database migration or private cache.
- Office execution stays on demand. Chinese font loading is driven by text
  actually rendered rather than an eager preload;
  `font-display: swap` continues to allow fallback text during download.

## Workspace startup

- The entry HTML contains a public loading screen. The app opens the workspace as
  soon as `/api/me` confirms the session. Google and registration settings load
  for the login entry or a confirmed signed-out session. The API and HTML
  authentication checks still run.
- Each startup request has a 10-second deadline. Only a 401 triggers login
  recovery. Network errors and timeouts offer a refresh without changing the URL.
- Browser User Timing records `studybridge:boot-start`,
  `studybridge:session-settled`, `studybridge:workspace-mounted`, and
  `studybridge:initial-page-settled`. Compare them with the navigation and
  resource timings. The final mark describes the initial route loader, while
  self-loading modules such as Grades can finish rendering later.

## Office first-open optimization (1.14.1)

- Entering the tools page adds a low-priority script preload for the shared Office
  bundle. This downloads public code only; execution and private project reads
  wait for an editor to open. Data saver and reported 2G connections skip preload.
- The first editor starts its project-list request while its script is downloading.
  Docs, Sheets and Slides share the in-flight result and a 30-second memory cache
  scoped to the current account. Failed reads are retryable; successful saves and
  account changes invalidate the cache. Already initialized workspaces do not
  fetch the list again just because the page renders.
- Local draft lookup starts alongside the project list. Drafts still take priority
  over cloud content, and version conflict checks still finish before editing.
  Cloud content is requested only when no valid local draft is recovered.
- `build:office` writes the bundle's SHA-256 prefix into the loader URL. Existing
  static serving grants that verified URL a year of immutable caching; changed
  bytes change the URL. `npm run check` rejects mismatched bundle/loader pairs.
- Startup regressions cover overlapping requests, cache expiry/invalidation,
  account isolation, failed-load retry, rapid tab changes and draft conflicts.
  Static HTTP tests verify immutable caching and stale-key revalidation. No
  specific production speedup is promised; timings depend on network and device.

## Profile images on startup

- The workspace session view returns short, versioned URLs for embedded avatars
  and covers. The sidebar shows initials while its image loads. The image route
  serves binary bytes only after verifying the owner session and image version.
- Private browser copies can be revalidated by ETag without re-downloading the
  file. Changing an image changes its URL. Profile updates send only newly
  selected files, and omitted image fields are preserved by the database write.
- Existing image records and the default API representation remain readable.
  No database migration or external image storage is required.

## Large courses and Office navigation

- Study and Classroom Notes request `documents?summary=1`. The response omits
  material text and page excerpts. The Study list fetches one authorized document
  after a click. The original list endpoint remains available for existing
  callers, and AI retrieval still reads the stored material.
- A late course-directory response clears the tools loading indicator without
  replacing an Office file card or editor. Library refreshes reuse unchanged
  cards. Failed editor opens provide a retry in place for the selected file.
- Local browser timings record Office selection, bundle, file and editor mount
  stages, without recording file names, identifiers or content.

## Measured payload

Local raw HTTP measurements against the isolated preview, without simulated
network throttling, on 2026-11-06:

| App entry | Before | After |
| --- | ---: | ---: |
| Script + stylesheet requests | 67 | 2 |
| External JS/CSS bytes | 1,276,533 | — |
| JavaScript bundle, gzip / Brotli | — | 319,271 / 311,767 |
| CSS bundle, gzip / Brotli | — | 40,562 / 42,122 |
| Total Brotli bundle bytes | — | 353,889 |

The new CSS bundle includes the former inline CSS. Bundles reduce these transfers
by approximately 72%; fonts and authenticated API responses are outside this table.
Repeat visits can reuse the immutable bundles. Browser refresh behavior and VPN
routes affect timing, so these numbers do not promise a specific production load time.

## Verification

- `node --test tests/static-assets.test.js`: real local HTTP tests for bundle
  dependency order, syntax, cascade/font resolution, gzip/Brotli byte equivalence,
  HEAD, conditional requests, cache invalidation across releases, and concurrent
  authentication startup including signed-out/network-failure recovery.
- `node --test tests/web-performance.test.js`: Python installer tests cover
  idempotence, virtual-host ownership, backups and validation/reload rollback.
  The real Nginx test negotiates TLS HTTP/2, runs concurrent requests and checks
  compression, redirects and incremental SSE delivery using the managed domain
  template and an isolated upstream. It skips on machines without Nginx; the Linux
  performance workflow installs Nginx and makes this test mandatory.
- Full `node --test tests/*.test.js`, `node scripts/check.js`, deployment-shell
  syntax checks; existing integration tests exercise account/session isolation,
  login/logout, courses, persistence, schedules and both AI streaming transports.
- Isolated Chrome smoke check: public homepage, login, all six page entries,
  editor lazy loading and refresh recovery, and Chinese/English switching; no
  browser console errors. Uses a separate local test database and simulated AI.

## Authorized release

The release script keeps its existing private-data backup and application checks.
When managed Nginx sites are present it invokes `aws/web-performance.py` after
application verification. The installer locks against HTTPS maintenance, backs up
only the existing app hosts, enables `listen ... ssl http2` (Ubuntu Nginx 1.24),
validates and gracefully reloads. Validation/reload failure restores both files;
the release script also rolls back application code. Certificates, proxy buffering,
70 MiB upload allowance, timeouts and other virtual hosts remain intact.

After a separately authorized deployment, verify:

1. `curl --http2 -I https://studybridge.ink/login` negotiates HTTP/2 and keeps HTML
   `no-store`; unauthenticated `/app` redirects to `/login`.
2. The actual bundle URLs from that entry return an immutable cache policy,
   `Vary: Accept-Encoding` and the requested supported compression. A conditional
   request returns 304; `/push-worker.js` remains uncached.
3. An ordinary refresh reuses static bundles. New deployments change URLs for
   changed contents. Compare the same authenticated page on the same VPN route.
4. Existing AI replies still deliver the first chunk before completion. Do not
   use an SSE connection's eventual close time as the page-load duration.

The Nginx option is documented by the [HTTP/2 module](https://nginx.org/en/docs/http/ngx_http_v2_module.html).
The separate `http2 on` directive requires Nginx 1.25.1+, so this change retains
the listener syntax compatible with the currently observed 1.24 deployment.
