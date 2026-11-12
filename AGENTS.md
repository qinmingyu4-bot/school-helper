# Project Instructions

## Lasting Design Preference

The owner's standing preference is a simple, restrained interface that matches
StudyBridge's existing approved style. Apply this to future modules, pages,
components and design proposals without requiring the owner to repeat it.

- Use the current product as the visual baseline. Before designing a new module,
  inspect the relevant existing page and shared styles rather than inventing a
  separate visual identity. A discussion demo is not an approved replacement for
  the product's design system.
- Favor clear typography, generous but purposeful whitespace, thin dividers,
  compact controls and restrained accents and shadows. Keep primary actions clear;
  avoid decorative gradients, excessive cards, oversized metrics and unnecessary
  animation or dashboard chrome.
- Keep prominent controls integrated with the product rather than oversized,
  generic form styling. Favor direct manipulation and linked values over
  explanation-heavy mode switches when that makes the task easier to understand.
- Reuse existing navigation, components, typography and theme variables. Reference
  `public/typography.css`, `public/appearance.css`, `public/display-modes.css`, and
  the quiet course-workspace treatment in `public/learning-loop.css`, together
  with the relevant page styles.
- Respect the user's selected account palette and independent light/dark mode;
  do not hardcode a new module to one palette. Preserve Chinese/English support,
  readable contrast and mobile usability.
- Make focused, consistent improvements within the established style. Introduce
  a different visual direction only when the owner explicitly asks for it.

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

Use `MAJOR.MINOR.PATCH` for future production releases, starting from the latest
verified production baseline (main records `1.2.31` at this audit). Keep historical
release numbers unchanged.

- Increment PATCH for bug fixes and small optimizations: `1.2.31` → `1.2.32`.
- Increment MINOR for important new functionality and reset PATCH to zero:
  `1.2.31` → `1.3.0`.
- Increment MAJOR for a major product redesign or major architectural change,
  and reset MINOR and PATCH to zero: `1.2.31` → `2.0.0`.
- For a release containing several change types, use the highest applicable
  level. Do not treat PATCH as a running release counter.
- Choose the bump from the actual release scope. Record the reason in
  `CHANGELOG.md` and `docs/version-archive.md`, and synchronize package, lockfile,
  frontend version and affected asset cache keys before deployment.
- Documentation-only changes and unreleased work do not require a product
  version bump or a deployment. See `docs/version-archive.md` for the checklist.
- Before preparing a release, read the policy from the latest main branch and
  verify that it survives merges from older task branches. If it is missing,
  restore it before choosing a version. Never blindly carry a task branch version
  forward as the production baseline.

- Production releases must include `release-plan.json` with the verified production
  commit/version, target version, classification, concrete reason and explicit
  feature list. The deployment policy job blocks missing/stale records, invalid
  increments and feature releases marked PATCH. See `docs/version-archive.md`.

## AWS Deployment

Pushing to main triggers .github/workflows/deploy.yml. Application changes must
pass the release-policy gate before AWS deployment; its narrow documentation/
governance-only exception skips deployment.
When the owner is testing before release or has not requested deployment, push
changes to a task branch so they are available on GitHub for review. Merge or
push to main when deployment is authorized by the owner.
