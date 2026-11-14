# Developer console usage

**Usage overview** provides a 7-day or 30-day window including the current UTC
day, daily active users, return rates, first-study completion, feature actions,
operation failures and estimated AI spending. Click a user name under **Users**
to open the account summary and switch its reporting period independently.

- Active users have a foreground student activity report or a tracked account
  action. Admin console activity, background jobs and background mailbox analysis
  do not establish a return visit. A feature count represents a submitted
  operation, not a page view. The failure rate uses completed or failed tracked
  operations, including rejected inputs and quota limits. User disconnects and
  mere acceptance of background work are excluded from that rate.
- Return rates use accounts registered during the selected window after
  collection began. Day 1 and day 7 are exact UTC calendar offsets. Only fully
  elapsed target days are eligible. First-study completion uses the same
  registration cohort and counts a delivered course AI answer or a submitted
  quiz. Individual onboarding timestamps record the first observed event for
  each step, which may be done in any order.
- Course creations include automatic imports. Materials count saved uploads,
  including saved files whose text could not be read. Existing account and
  presence records supply the profile fields. Earlier activity is not inferred
  from old profiles, documents or messages.
- AI requests count account generation calls that reached the provider and
  were settled. This reuses the existing allowance ledger, including estimated
  reservations when the provider could not confirm usage. Token totals cover
  reported usage. Shared academic calendar lookups and health checks are outside
  these account figures. Figures are not the provider invoice.
- Both endpoints use the existing admin role and private, noncached responses.
  Individual reads log actor, target and period through the server log. Recent
  diagnostic records contain only a feature, timestamp, normalized error code,
  and request identifier. Tracked HTTP responses expose that identifier as
  `X-Request-Id`. No course content, grades, messages, filenames, email content
  or credentials enter usage storage.

Daily account summaries are stored for 35 UTC days. Local storage prunes old
buckets on usage writes. For DynamoDB, enable TTL on the numeric `expiresAt`
attribute using the table template (or enable it on an existing table). DynamoDB
deletes expired records asynchronously, and reports only query their date
window. First-observed onboarding timestamps are stored separately from daily
buckets. No new DynamoDB indexes or permissions are required.
