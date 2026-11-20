# AI cost controls — owner decisions, 2026-11-20

All eleven items were discussed and authorized together. No technical cost,
retry, reconciliation or budget alerts should be shown to students. Operational
issues belong in the developer console. Ordinary action failures may use a short,
actionable inline message. Prioritize complete approximate attribution over false
precision; retain unknown amounts and explain coverage.

1. Remove scheduled/startup academic-calendar discovery. Fetch only when importing
   a timetable, changing its term, or explicitly revalidating. Existing saved
   reminders remain independent and automatic.
2. Preserve failure refunds, independently track provider costs, deduplicate paid
   attempts, cool repeated failures, and protect platform spend with admin alerts.
3. Preserve request identities early and reconcile interrupted/unknown costs;
   never invent per-user costs from an organization aggregate.
4. Reserve audio from its measured duration and images from model/quality/size/
   reference inputs, rather than a fixed charge. Check before paid dispatch.
5. Use one completion/failure/cancellation parser for personal settlement and
   provider accounting. Provider cost survives a personal refund.
6. Persist verified calendars and reuse within the applicable term or academic
   year across course combinations. Never merge different scope applicability.
   Expiry alone must not start a paid request.
7. Separate provider consumption from top-ups, taxes and account balance; show
   reconciled/estimated/unavailable values honestly in the admin console.
8. Separate official history coverage from the start of local request recording.
9. Only fall back on explicit unsupported-tool/API errors, never blind retries
   after timeouts, rate limits, authorization failures or delivered output.
10. Coalesce concurrent admin connectivity checks and cache results.
11. Coalesce/cache official reads, back off on 429, retain dated stale results,
    and label tool prices/unknown amounts as approximations.

Configuration and financial credentials remain private on AWS; never commit them.
