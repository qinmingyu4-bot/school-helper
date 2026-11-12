# Storage operations

## Verified production baseline — 2026-11-12

Lightsail Montreal, Ubuntu, Node 22.23.3, 4 GB RAM, 80 GB plan. Production
commit at inspection: `86e251f`; `/api/health` reports `local`.
The root filesystem has 82,086,711,296 bytes total, 5,059,514,368 used and
77,010,419,712 available (~71.72 GiB). No expansion is needed now.
There are 18 users, 30 courses, 232 documents (including schedules), and 143 messages.
No account identifiers or private content are recorded here.

Database: `/home/ubuntu/school-helper/.data/studybridge.json` (~2.7 MiB).
Material files: ~108 MiB; authored files: ~2.1 MiB. There are 72 live file
references and no unreferenced material files at inspection. Some legacy material
values remain embedded in JSON and continue to be readable.

Hard links make independent directory totals non-additive. Counting active files
first, scheduled backups add ~273 MiB and release backups add ~552 MiB.
Independent directory sizes are ~380 MiB (72 scheduled snapshots) and ~660 MiB
(62 releases). Private configuration backups add ~1.6 MiB. The first preliminary
344 KiB material reading counted shared inodes under backups first; it was not the
actual size of the material collection.

AWS automatic snapshots were disabled at inspection. Nothing was deleted,
migrated, restarted or deployed during the inspection.

## Changes and limits

- New course uploads retain exact original bytes, including non-PDF formats.
  Authenticated downloads check course ownership and force attachment download.
  Editing extracted text retains the original; historical non-PDF uploads whose
  bytes were never stored cannot be reconstructed and require re-upload.
- Local accounts default to 1 GiB of attributed storage; configurable with
  `STORAGE_USER_LIMIT_BYTES`. This counts owned JSON records, encoded material
  bytes and allocated authored files, not a promise of raw upload capacity.
  Authentication/account metadata, shared community records without a userId, backups and logs
  are not charged to users. DynamoDB metering is explicitly unavailable rather
  than showing a false zero; these controls target the actual local deployment.
- New growth retains 2 GiB of free disk (`STORAGE_RESERVE_BYTES`); Shrinking
  writes retain 16 MiB so cleanup can still work. Existing over-limit accounts
  can read and reduce data. No membership entitlements are changed.
- Users see usage beside course uploads. Administrators see free space and file /
  backup allocation, with hard-link deduplication. Every 15 minutes the server
  checks free space and logs state transitions below 20% or twice the reserve.
  This is a server log/admin warning, not an email/SMS notification service.
- Scheduled backups remain every six hours / 72 snapshots by default. They now
  include authored files, material snapshots and checksums, publish only when
  complete, serialize against file writes, and coalesce overlapping requests.
- Release backups verify copied authored files. Existing unverified legacy
  backups are not silently declared restorable.
- SQLite is opt-in after offline migration. WAL + FULL synchronous transactions
  commit changed rows and serialize concurrent writers. Collection reads/draft
  copies still use memory; this is a modest single-server solution, not horizontal
  scaling or a substitute for external backups.

## Validation and restore drill

Run from the deployed checkout with the same private environment as PM2; never
print `.env` or `pm2 jlist` to shared logs. All maintenance defaults to dry-run.

```sh
node --env-file=.env scripts/storage-maintenance.js report
node --env-file=.env scripts/storage-maintenance.js materials
node --env-file=.env scripts/storage-maintenance.js releases "$HOME/studybridge-release-backups"
node --env-file=.env scripts/storage-maintenance.js verify /private/release-directory /private/new-restore-directory
node --env-file=.env scripts/storage-maintenance.js verify-scheduled /private/backups/studybridge-TIMESTAMP.json
```

`verify` validates all referenced materials and authored files before creating a
new restore destination. It refuses an existing destination and does not restore
credentials into the output. Test login/course/file access in an isolated service
with test credentials and external workers disabled before treating a restoration
as a full application recovery. A checksum drill alone is not a live disaster
recovery exercise.

## SQLite activation (requires release authorization)

1. Ship and verify this code in JSON mode first. Preserve current secrets and all
   records. Both old and new code read the same JSON until explicit activation.
2. Pause auto-deploy and all application writers. Take a complete release backup
   with the new runner, verify it and restore a copy to a fresh private directory.
3. `node scripts/storage-migrate.js /absolute/path/studybridge.json --writers-stopped`
   creates a private `.sqlite` sibling, verifies SQLite integrity and deep equality
   of every collection, and refuses an existing destination or changing source.
4. Set `LOCAL_STORE_FORMAT=sqlite` in the private service environment, preserving
   other settings. Restart once; check users/courses/documents counts, sign-in,
   original downloads, schedule edits, and a new scheduled backup. Resume auto-deploy.
5. Keep the original JSON and migration backup. JSON is now a historical copy,
   not a fallback. New code refuses JSON startup when the SQLite sibling exists.
   To roll back, stop writers and export the **current** SQLite state with
   `node scripts/storage-export.js /absolute/path/studybridge.json /private/current-export.json`.
   Verify the export, preserve SQLite/WAL/SHM privately, then perform a separately
   controlled configuration switch. Never start an old release against stale JSON.

Node >=22.13 is required; production is 22.23.3. Release backups and installation
verification understand both formats. Do not copy a live SQLite main file without
its WAL: use the application snapshot/export mechanism.

## Safe retention and orphan cleanup

Keep at least the latest 14 complete releases and everything younger than 30 days.
Before applying retention, the latest retained release must pass full checksum
verification, including authored files. Legacy releases without those checksums
cannot authorize pruning. Unknown/incomplete directories are never removed.

Material GC validates every live reference first, examines only content-addressed
JSON files, and only considers unreferenced files older than seven days. Hard-linked
backups remain valid; reported reclaimable bytes exclude multiply-linked files.
For JSON mode, pause all writers before applying because its queue is in-process.

After reviewing dry-run output and verifying an external backup, use `--apply
--writers-stopped` on the same maintenance command. These flags permanently remove
only the eligible backup/material entries. After the first retention/restore cycle and external backup have been reviewed,
set `STORAGE_MAINTENANCE_ENABLED=true` to run this conservative policy daily inside
the single application process. It verifies a retained release first and aborts
on a corrupt live material reference. Leave it disabled until that review. Current production has ample free space
and no material orphans, so there is no urgent reason to delete old copies.

## External backup decision

Recommended initial protection: Lightsail automatic daily snapshots, last seven
retained, plus application-consistent six-hour local snapshots. AWS snapshots live
outside the instance disk but remain in the same account/region; they are not a
cross-region or separate-account disaster recovery solution. New AWS snapshot
storage charges require owner approval before enabling.

AWS documents $0.05/GB-month for stored snapshot data. Actual cost depends on
incremental changed blocks and retention, not simply the nominal 80 GB plan.
Do not promise a fixed bill or enable a paid service without an agreed budget.
https://docs.aws.amazon.com/lightsail/latest/userguide/amazon-lightsail-faq-snapshots.html

For a later stronger disaster recovery target, use encrypted application backups
in a separate-region bucket/account with restricted credentials and restore drills.
Do not copy private data to a new destination or provision new access implicitly.
