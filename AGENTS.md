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

## AWS Deployment

Pushing to main triggers .github/workflows/deploy.yml and deploys to AWS.
When the owner is testing before release or has not requested deployment, push
changes to a task branch so they are available on GitHub for review. Merge or
push to main when deployment is authorized by the owner.
