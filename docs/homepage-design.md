# Refined homepage preview

The owner requested a premium, minimal direction inspired by Apple, built on
StudyBridge’s existing homepage. The preview retains the content and brand while
using centered hero typography, a larger learning-space illustration, white and
soft gray sections, compact controls and restrained blue primary actions.

`public/landing-refined.css` is the final homepage stylesheet and contains this
visual treatment without changing the signed-in product styles. The underlying
homepage structure, language switching, course-based content and interactive
grade example remain in place. The preview server serves the same stylesheet.

The product walkthrough stays as a static placeholder; see `homepage-video.md`.
No video or playback controls should be added until the owner follows up.

Review at `http://127.0.0.1:4318/` using `scripts/landing-preview.js`. This version
is synchronized on a task branch for review, without production deployment.
