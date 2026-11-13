# Isolated StudyBridge development

Independent chats that write code use independent Git worktrees and task
branches. Worktrees protect files during development, but shared APIs and data
formats still need integration tests. They cannot guarantee defect-free releases.

## Starting or continuing a task

1. Read AGENTS.md and inspect branch, status and registered worktrees. Identify
   whether an active chat owns existing edits before touching the primary checkout.
2. Reuse the chat's managed worktree or create one from the intended verified
   commit. Attach it to the chat so future turns use the same directory. Give new
   work a unique `codex/` branch and record its base SHA.
3. Install dependencies using the lockfile. Use a fresh local test database and a
   separate port. Do not copy production credentials or share writable runtime
   state with another worktree. Worktrees share Git history, not safe access to
   external services or databases.
4. Make changes, run relevant tests, review the diff and commit only task files.
   Publish to the task branch; report push failures rather than claiming backup.

## Transitioning existing work without interrupting it

- Read-only audits can inspect the shared checkout. Writers must be isolated.
- Let each existing writer finish or reach a saved checkpoint before moving its
  files. Coordinate with that chat only with the owner's authorization.
- For committed work, create a managed worktree from the exact task commit and
  compare `HEAD` and `git status` with the source. Leave the old copy in place
  until the owning chat is attached and needed ignored artifacts are accounted for.
- For uncommitted work, identify its exact diff and new files. Preserve unrelated
  changes and staging. Verify the destination before removing only the transferred
  edits from the source. If the changes cannot be separated safely, do not move them.
- Do not prune old worktrees merely because their directories are missing. First
  check whether local-only commits or recoverable task snapshots remain relevant.
- Migration is not a release and does not mean unfinished features have been merged.

## Bringing completed tasks together

1. Begin a dedicated integration worktree at the latest verified production/main
   baseline. Confirm which finished task commits are intended for integration.
2. Integrate one task at a time. Review app.js, server.js, database changes,
   shared schedule records, dependencies and release instructions whenever touched.
   Preserve newer features rather than copying an old task's entire tree over main.
3. Run syntax/assets checks and the full test suite on the combined code:
   `npm run check` and `TZ=UTC npm test`. UTC makes legacy date expectations
   reproducible; explicitly test school-local time and timezone behavior too.
4. Exercise the affected user journeys, including course ownership, persistence
   after reload, calendar/checklist consistency, grades and learning links when
   involved. Check Chinese/English, narrow layouts and dark mode for UI changes.
5. Record what passed and what remains unfinished. Push the integration branch
   for review. Only deploy after explicit owner authorization, using the current
   version/release policy and a recoverable production baseline.

## Current transition boundary

The daily checklist was completed at `aae4001` in its own task branch and has a
managed copy at `daily-checklist-isolated/StudyBridge`. Its earlier Git push was
rejected by the local deployment key; it must not be described as remotely backed
up until synchronization is verified. Other active task edits must remain with
those tasks until their saved checkpoints are confirmed. This workflow does not
silently merge that older feature baseline into the newer production branch.

Reference: [OpenAI worktree documentation](https://learn.chatgpt.com/docs/environments/git-worktrees).
