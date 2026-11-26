# Course notes

Open **Tools → Class notes**, or use **Class notes** in a Study course header.
Select a course and choose **New blank note** to open a dated, single-page A4
sheet. Write on it with the pen or text tools. The sheet appears in the notes
picker and the course materials list and supports the same autosave and export
controls as annotated PDFs. Use **Upload PDF** or select an existing PDF to write
on course materials. Uploads automatically match a course code
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
Pen, highlighter and eraser use distinct cursors; a compact localized hint identifies
the active tool on touch screens too. Drag the eraser across whole annotations;
one undo restores everything removed in that gesture. Canceled gestures restore
the previous state. Browse supports mouse/stylus dragging and native finger
scrolling. Use Stylus only to avoid drawing with fingers.
Choose **Sticky note**, then click/tap a page to place a pale yellow note. In this
mode, drag the center to move a note. Drag any edge or corner of a selected note
to resize it. The shaded lower-right grip also works. Select a note
to edit typed text, duplicate/delete it or change its background. Pen/highlighter
strokes started inside a note stay attached when it is moved, resized or copied;
the eraser removes its ink without deleting its background or typed text. Use
Delete note or press Delete/Backspace with the sticky note selected on the canvas.
Undo restores the whole note, including its text and ink. Copies are independent. Text
wraps and shrinks to fit; very small notes should be enlarged for readability.
Each note supports 4,000 text characters and 500 ink strokes within the existing
page storage limit. Note text chooses dark/light ink for background contrast.
Sticky notes save with the page and appear in PDF and page-image exports; selection
outlines and resize handles are omitted from exported files.

Focus expands the workspace on tablets; Exit focus restores navigation.
Ctrl/Cmd+Z, Shift+Ctrl/Cmd+Z and Ctrl/Cmd+S are supported outside text inputs.
More exports the current annotated page as PNG or a JSON draft backup.
**Export PDF** downloads the entire original PDF with annotations on every marked
page, including pages not opened in the current session. Unmarked pages remain
included. Original page content stays vector/selectable; annotations are flattened
as transparent images (up to 2× resolution, capped at 2,400 pixels per dimension).
Chinese/multiline text, highlight transparency, page rotation and crop origins
match the viewer. The original stored PDF is never replaced. JSON backup import
is not supported.

Export first attempts a save, then combines cloud notes with available local drafts
and the currently displayed page. A conflict does not prevent downloading your own
draft and does not overwrite newer cloud notes. Export requires the cloud notes
request to succeed; failures do not silently produce a partial document. Progress
and cancellation are provided, and editing/navigation is temporarily disabled to
keep the exported snapshot consistent.

Notes save automatically after 800 ms, separately per account, course, document and page.
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

`POST /api/courses/:course/notes` creates a blank sheet in an owned course with
an optional title. The sheet uses a generated background and needs no uploaded
material. `GET /api/courses/:course/note-source/:document` serves the blank sheet
or uploaded PDF under the same course authorization.
`GET|PUT /api/courses/:course/notes/:document?page=N` reads/saves page records.
`GET /api/courses/:course/notes/:document?all=true` returns all annotated pages
under the same account/course/document authorization. The response is capped at
16 MiB; larger note collections must use individual-page exports.
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
PDF export lazy-loads the existing pdf-lib 1.17.1 dependency as a same-origin ESM
bundle in `public/vendor/note-pdf`, with its MIT license. Rebuild that copy using
`node scripts/vendor-note-pdf.js`.

Verification: model/validation and HTTP tests cover invalid data, account/page
isolation, conflicts, persistence, source access, static module MIME and deletion.
Browser verification covers upload, pen/highlight/text/eraser, undo/redo, multi-page
isolation, PNG export, save/reload and desktop,
834px tablet and 390px phone layouts. Real iPad/Apple Pencil pressure, latency and
palm behavior are not certified by desktop emulation. Pen width is selected
manually; this release does not implement pressure-sensitive width.

Feedback verification (2026-11-20): continuous erasing and single-step undo,
mouse panning, and a five-page PDF exported through the browser were checked.
The exported pages were rendered and visually inspected with Chinese notes,
highlights, 90/180/270° rotation, a cropped page and an unannotated final page.
Model tests cover eraser hit geometry and inverse PDF transforms; HTTP tests
cover authenticated whole-document note reads, persistence and deletion.

Release 1.9.0 validation: 715 tests passed, with one Linux-only Nginx check skipped on macOS; 364-file source/assets/version checks, 12 release-policy tests, dependency audit (zero vulnerabilities) and deployment script syntax checks passed. The merged release preview renders the PDF with the production asset bundler.
