# Refined homepage preview

The owner requested the refinement and restraint of a premium website, with a
recognizably StudyBridge identity. Use the reference for clarity, spacing and
craft, not for distinctive combinations of layout, color and control shapes.

The homepage uses an asymmetric opening: a left-aligned headline beside its
context and actions, followed by the learning workspace. Charcoal controls,
subtle sage accents, open feature rows and thin rules connect the website with
StudyBridge’s quiet course-workspace treatment. Avoid returning to the combined
centered billboard, blue pill buttons and repeated large gray rounded panels.

`public/landing-refined.css` is the final homepage stylesheet and contains this
visual treatment without changing the signed-in product styles. The underlying
homepage structure, language switching, course-based content and interactive
grade example remain in place. The preview server serves the same stylesheet.

The product walkthrough stays as a static placeholder; see `homepage-video.md`.
No video or playback controls should be added until the owner follows up.

Review at `http://127.0.0.1:4318/` using `scripts/landing-preview.js`. This version
is synchronized on a task branch for review, without production deployment.

The grade demo uses two 0–100 tracks. Its fixed course points are 42 and the final
exam weight is 40%, so dragging the total track is constrained to 42–82 while
retaining the full scale. Both directions update immediately; score inputs show
two decimals after committing or leaving the field, with room for `100.00`.
