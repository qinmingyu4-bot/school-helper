# Refined homepage preview

The owner requested the refinement and restraint of a premium website, with a
recognizably StudyBridge identity. Use the reference for clarity, spacing and
craft, not for distinctive combinations of layout, color and control shapes.

The homepage uses an asymmetric opening: a left-aligned headline beside its
context and actions, followed by the learning workspace. Keep the product’s
black, compact, slightly rounded action buttons.

The owner selected the earlier neutral light-gray feature panels with white
inner examples, and the centered light-gray closing panel. Use #f5f5f7 for soft
backgrounds, with neutral text and dividers; the sage-tinted gray was explicitly
rejected. The closing “Start learning” button keeps the black product style.
These chosen panels coexist with the asymmetric opening and existing interactions.

`public/landing-refined.css` is the final homepage stylesheet and contains this
visual treatment without changing the signed-in product styles. The underlying
homepage structure, language switching, course-based content and interactive
grade example remain in place. The preview server serves the same stylesheet.

The product walkthrough stays as a static placeholder; see `homepage-video.md`.
No video or playback controls should be added until the owner follows up.

Review at `http://127.0.0.1:4318/` using `scripts/landing-preview.js`. The owner authorized production publication on 2026-11-16; release 1.5.1
ports this approved homepage onto the latest production baseline.

The grade demo uses two 0–100 tracks. Its fixed course points are 42 and the final
exam weight is 40%, so dragging the total track is constrained to 42–82 while
retaining the full scale. Both directions update immediately; score inputs show
two decimals after committing or leaving the field, with room for `100.00`.
