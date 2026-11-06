# Whole-site audit — 2026-11-06

Baseline: production 1.2.16, `974a7513d8ad325b146272ca89f8ad44d2af7831`.
Scope: source review, isolated local/DynamoDB tests, real browser checks using
synthetic accounts/AI, dependency advisories and small unauthenticated production
GET checks. Production accounts, data, payments and AI allowance were not used.
Fixes are prepared on a review branch; this audit does not deploy them.

## Confirmed findings and fixes

| Area | Finding | Change and verification |
| --- | --- | --- |
| Mail dependency | Pinned Nodemailer 10.1.0 has moderate recipient-parser advisories; the existing high-severity CI threshold allowed them. | Pin 10.1.4 with its official registry integrity hash. Regression cases exercise nested comments, group delimiters and quoted local parts using a local mail transport; no mail is sent. |
| Background database work | Every unchanged allowance poll called an atomic write, serializing the full local database or issuing a DynamoDB transaction. Visible tabs poll every 15 seconds. | Compare a detached normalized snapshot; write only for expired reservations or period rollover. Reconcile the latest value atomically, retaining reservations, settlement, limits and membership behavior. Twenty unchanged reads produce zero writes in both stores. |
| Server responsiveness | Password hashing/verification used synchronous scrypt on the HTTP event loop. | Use asynchronous scrypt with unchanged parameters, salt, hash format and timing-safe comparison. Limit active password work to two and queued work to 32; overload is rejected instead of allocating unbounded work. Old hashes continue to work. |
| Input robustness | Malformed cookie percent encoding or non-string login passwords could throw HTTP 500. | Ignore only malformed cookies, use a null-prototype cookie map, and reject invalid password types/oversized input as failed authentication. A bad unrelated cookie no longer blocks a valid session. |
| Private response caching | Several private API responses did not explicitly prohibit caching. | Default API responses to `private, no-store`, including authentication errors; explicit stream/download policies remain in their routes. |
| Browser response policy | Public pages had no frame-embedding or MIME-sniffing protection. | Add SAMEORIGIN, `frame-ancestors 'self'` and `nosniff`; same-origin document functionality remains permitted. |

The existing account-security five-attempt rule now reserves an in-flight attempt
before asynchronous verification, preventing concurrent requests from bypassing
that rule. Registration/reset derive the hash before consuming a one-time email
code, so a full password-work queue cannot waste a valid code.

Mail advisories, all patched in 10.1.4:
- [Nested comment parsing](https://github.com/advisories/GHSA-8c8m-p3m8-cjg8)
- [Group delimiter parsing](https://github.com/advisories/GHSA-m943-m63m-w62w)
- [Quoted local-part parsing](https://github.com/advisories/GHSA-85x2-q946-cp5h)

These are confirmed dependency vulnerabilities; this audit did not establish an
exploitable mail-delivery path in StudyBridge or send a real proof-of-concept email.

## Validation

- Baseline: 594 full-suite tests passed. After fixes: 602 tests passed. The final
  asynchronous-attempt race hardening additionally passed all 16 focused account,
  password and mail tests. Source/assets/package checks cover 303 JavaScript files.
- Chrome and WebKit: seven authenticated pages (Community, Classmates, Schedule,
  Study, Tools, Mailbox, Profile), Chinese/English and 320/390/1280 px widths:
  84 combinations, no page exceptions or document-wide horizontal overflow.
  Screenshots of narrow Schedule, Tools and Mailbox pages were inspected.
- Both browsers also check streamed Chinese/emoji, late Markdown references,
  formulas, complete final DOM, unchanged table identity, typing/draft retention,
  navigation during generation, stop and absence of late repaint after stopping.
- All existing authentication, cross-account/course access, persistence, stale
  writes, schedule time zones, attachment access, AI grounding/review, billing,
  learning-loop, import/export and simulated mailbox/push regressions remain green.
- Official npm advisory bulk lookup returned no advisories for 261 production
  dependency names after the mail upgrade. CI must independently verify the
  lockfile installation, test suite and dependency audit on Linux.
- Production `/`, `/login` and `/api/health` returned 200. Unauthenticated `/api/me`,
  `/api/courses`, `/api/admin/overview`, `/api/office`, `/api/mailbox`,
  `/api/me/ai-usage` and `/api/billing` returned 401. An intermittent client/network
  interruption during these reads was retried successfully; it does not establish
  a server-side fault.

## AI quality and data invariants

No AI routing, model selection, reasoning parameters, prompts, context budgets,
retrieval, independent reviews, output length, tool limits, prices or weekly
allowance values are changed. Only the allowance **status read path** changes;
reservation and settlement policy remain the same. No data migration, password
reset, production configuration change or account-data rewrite is performed.

## Open risks and limits

1. The ordinary `/api/auth/login` handler has no failed-login rate limiter in the
   reviewed application code. The password-work cap protects server load, not
   against sustained password guessing. The existing five-attempt limit applies
   to changing a password in an authenticated account, not to ordinary sign-in.
   Add a separate, tested sign-in abuse control considering trusted-proxy address
   handling, shared networks, account lockout abuse and multi-instance persistence.
   Independent edge/WAF controls were not audited or assumed present. No brute-force
   testing was performed against production.
2. AI accuracy cannot be certified by simulated transports. The tests validate
   routing, source boundaries, completeness checks and review behavior; actual
   difficult course questions still require real-model evaluation.
3. Live Google consent, Gmail/Outlook delivery, real payments/refunds and physical
   device push delivery were not exercised. Their local contracts and isolation
   tests passed; production end-to-end integrations need separate acceptance.
4. This is not an exhaustive penetration test, production load test or restore drill.
   Provider latency, very large content, external account state and future dependency
   advisories can still cause failures. No claim of a completely defect-free site
   follows from the checks above.
