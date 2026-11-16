# Course notes

Open **Tools → Course notes** (the first tool), select a course, then upload a
PDF or select an existing course PDF. Uploads automatically match a course code
in the filename, then the opening 4,000 extracted text characters when the filename
has no code. Matching handles spaces, hyphens and underscores and reuses the course
code normalization used by timetable imports. Distinct campus codes and duplicate
course codes across terms are not silently merged. Ambiguous, missing or unknown
codes open a destination picker; canceling does not create a document. Scanned PDFs
without extracted text need a filename code or manual selection. Existing courses
only: no course is created automatically. **View in Study** opens the destination
course; its materials list shows the same stored PDF without a second upload.

Uploads use the existing private course
material system and its 50 MB file limit. PowerPoint, Word and image files must
be exported to PDF before annotation; this release does not convert those files.

Course and material values open compact selection menus. Use Arrow keys, Home/End,
Enter and Escape to navigate them; native selects remain hidden synchronization
controls. The editor uses line icons with localized tooltips and accessible names, compact text actions and thin dividers.

The responsive web workspace supports mouse, touch and stylus pointer input:
pen, translucent highlighter, editable multiline text, whole-object eraser,
undo/redo (60 operations per open page), page navigation and 100–300% zoom.
Use Browse for scrolling and Stylus only to avoid drawing with fingers.
Focus expands the workspace on tablets; Exit focus restores navigation.
Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z and Ctrl/Cmd+S are supported outside text inputs.
More exports the current annotated page as PNG or a JSON draft backup.
This release does not export a complete annotated PDF or import JSON backups.

Notes save automatically after 800 ms, separately per account/course/PDF/page.
Reopening reads cloud notes. A local draft survives refresh and failed saves;
leaving with unsaved changes triggers a browser warning. Local drafts require
browser storage. Switching pages or PDFs waits for the current save. Cloud
conflicts preserve the local draft and stop navigation: export a backup, then
choose Reload cloud to discard the local draft explicitly. This is optimistic
concurrency, not live collaborative editing. Remote updates are read when a page
is reopened, not streamed into an active canvas.

`POST /api/course-materials` resolves and files a PDF through the existing document
creation flow. An unresolved match returns `needsCourse: true` without writing.
An explicit owned `courseId` completes filing; foreign/general destinations are rejected.

`GET /api/courses/:course/note-source/:document` serves an authenticated PDF.
`GET|PUT /api/courses/:course/notes/:document?page=N` reads/saves page records.
PUT requires the last version and a validated items array; stale versions return
409. Notes are limited to 2,000 objects and 260 KB per page; each stroke is limited
to 12,000 points. Coordinates are normalized to page size. DynamoDB writes use
conditional transactions with a source-document guard; local writes use the
existing serialized database writer. Deleting a document/course removes its
notes. Original PDFs remain unchanged.

PDF.js 5.4.624 is vendored under `public/vendor/pdfjs`, including worker, CMaps,
fonts, WASM decoders and Apache license, from the npm pdfjs-dist distribution.
The viewer uses same-origin assets without a CDN or new runtime npm dependency.
Its rendering integration follows https://mozilla.github.io/pdf.js/examples/.

Verification: model/validation and HTTP tests cover invalid data, account/page
isolation, conflicts, persistence, source access, static module MIME and deletion.
Browser verification covers upload, pen/highlight/text/eraser, undo/redo, multi-page
isolation, PNG export, save/reload and desktop,
834px tablet and 390px phone layouts. Real iPad/Apple Pencil pressure, latency and
palm behavior are not certified by desktop emulation. Pen width is selected
manually; this release does not implement pressure-sensitive width.

Release 1.9.0 validation: 715 tests passed, with one Linux-only Nginx check skipped on macOS; 364-file source/assets/version checks, 12 release-policy tests, dependency audit (zero vulnerabilities) and deployment script syntax checks passed. The merged release preview renders the PDF with the production asset bundler.
