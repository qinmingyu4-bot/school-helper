# Page-load performance

Baseline: production `974a751` (1.2.16). Changes are prepared on a task branch;
production deployment requires a separate release authorization.

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
- The three boot requests start concurrently. Office stays on demand. Chinese
  font loading is driven by text actually rendered rather than an eager preload;
  `font-display: swap` continues to allow fallback text during download.

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
