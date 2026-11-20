# Health monitoring

`GET /api/health` retains `ok`, `db`, and `schedulePush.configured` /
`workerEnabled` for existing deployment checks. It returns HTTP 200 when the
checked components are available and HTTP 503 when storage checks fail/time out
or an enabled background loop reports failure or becomes stale. Responses are
private/no-store and contain no account data, file paths, credentials or exception
messages. Point external uptime monitoring at this URL and alert on non-200.

## Storage

Checks are shared across concurrent requests and cached for 30 seconds. Each HTTP
caller waits at most 3 seconds. A stuck operation remains single-flight so repeated
requests cannot accumulate probes. A recovered result replaces the failed result.

- Local mode loads the database through the application store, checks that its
  persisted file can be opened for reading/writing and read, then writes, reads
  and removes an exclusive temporary file in the same directory. Existing account
  data is never rewritten. A fresh installation can be ready before its first
  database write; missing persisted data for already-loaded users fails the check.
- DynamoDB mode performs a consistent GetItem against a reserved, non-user key.
  No synthetic account records are written. `database.write` is explicitly
  `not_checked`; IAM write permissions and restore integrity need separate checks.

This is an availability check, not a full database integrity scan, backup restore
exercise, free-disk forecast or proof that every future write will succeed.

## Background work

`workers.study`, `workers.mailbox`, and `workers.push` report `enabled`, `ok`,
`status`, `lastSuccess`, and `lastFailure` (epoch milliseconds, null before an
observation). Status is `starting`, `ok`, `failed`, `stale`, or `disabled`. Enabled
loops become stale after 120 seconds without a completed successful cycle; the
same grace period applies at startup. A successful cycle clears the current
failure status. Disabled optional services do not fail overall readiness.

These observations cover queue scanning/dispatch, not the success of every AI job
or connected mailbox. An unusually long cycle can report stale until it completes;
this does not cancel work. Inspect job/account errors when an individual operation
fails despite healthy dispatch. State resets on process restart.

Push `delivery.lastAcceptedAt` records the last successful provider response;
`lastFailureAt` records the last non-expired-subscription transport failure. Expired
404/410 subscriptions continue to be removed normally. `deviceReceipt` remains
`not_verified`: an accepted push is not proof that the device displayed it. These
timestamps do not by themselves fail overall health or replace physical-device
acceptance testing.

## Deployment and verification

The existing release script already requires a successful health HTTP response
and `ok: true`, so the richer checks participate in deployment verification without
changing its backup/rollback policy. The owner authorized production deployment of this change as release 1.12.5.
The release preserves current data and private configuration.

Fault tests cover storage loss/corruption on load, probe cleanup, timeout and
concurrency bounds, stale/failing workers and recovery. Authentication regressions
cover sign-out failure preserving drafts, successful cleanup order, both notification
types after password login, and signed OAuth destination validation. Real email,
Google consent, payment transactions and device push delivery are not invoked.
