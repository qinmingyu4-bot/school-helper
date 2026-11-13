# Learning workflow completion — 1.3.0

This release integrates the selected product improvements into the latest main, rather than replacing newer production modules with the earlier task snapshot.

1. Real grades: retain the native `/app?page=grades` workspace, real courses, versioned `/api/grade-planner` service, source evidence, partial totals and syllabus conflict review.
2. First study: an empty conversation shows course, material and practice steps using the existing theme, navigation and language settings.
6. Review: combine recorded mistakes, due dates and explicit same-course exams. Proposed times respect existing events, timezone and the chosen daily window. The user confirms a slot; a topic cannot have duplicate pending plans.
7. Mail: update/cancel drafts are unchecked by default. Select an existing event and confirm its version; rejected stale/foreign/duplicate targets leave data unchanged. Confirmation retains a before/after receipt and is atomic with the draft status.
8. Drafts: schedule text/previews and unanswered quiz choices survive reload on the same device. Failed grade saves retain an explicit recovery/download/discard notice. Recovery requires an unchanged account version; stale drafts can be downloaded for comparison. Storage failures are visible, drafts are account/scope isolated and expire after 30 days. Local drafts are not cross-device sync and contain no credentials or uploaded file bytes.
10. Account recovery: retain the current email-code self-service reset, throttling and session invalidation. Real SMTP delivery remains dependent on production provider configuration.

No production accounts or data are created by release verification. Browser acceptance uses a disposable local database and fixture AI/mail responses; live verification is read-only.
