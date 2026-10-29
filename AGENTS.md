# Project Instructions

## GitHub Synchronization

The project owner requests automatic GitHub synchronization after completed
project changes, including relevant source, configuration, documentation, and
CHANGELOG.md. This authorization applies to future work on this repository.

- Update CHANGELOG.md for user-visible changes and update related documentation
  and configuration when the change requires it.
- Run checks appropriate to the change before committing and pushing.
- Review the diff and stage the files belonging to the completed work explicitly.
  Preserve unrelated work and never force-push to overwrite remote changes.
- Never commit secrets, .env files, private databases, database backups, caches,
  logs, or temporary verification artifacts.
- Commit and push completed changes without asking again for routine GitHub
  synchronization. Report the branch and commit, or any synchronization failure.

## Versioning

Use `MAJOR.MINOR.PATCH` for future production releases, starting from the existing
`1.1.122` baseline. Keep historical release numbers unchanged.

- Increment PATCH for bug fixes and small optimizations: `1.1.122` → `1.1.123`.
- Increment MINOR for important new functionality and reset PATCH to zero:
  `1.1.122` → `1.2.0`.
- Increment MAJOR for a major product redesign or major architectural change,
  and reset MINOR and PATCH to zero: `1.1.122` → `2.0.0`.
- For a release containing several change types, use the highest applicable
  level. Do not treat PATCH as a running release counter.
- Choose the bump from the actual release scope. Record the reason in
  `CHANGELOG.md` and `docs/version-archive.md`, and synchronize package, lockfile,
  frontend version and affected asset cache keys before deployment.
- Documentation-only changes and unreleased work do not require a product
  version bump or a deployment. See `docs/version-archive.md` for the checklist.

## AWS Deployment

Pushing to main triggers .github/workflows/deploy.yml and deploys to AWS.
When the owner is testing before release or has not requested deployment, push
changes to a task branch so they are available on GitHub for review. Merge or
push to main when deployment is authorized by the owner.
