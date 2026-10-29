# Creative Tools

## Available Features

Tools provides Word/PDF documents, editable Excel workbooks, editable PowerPoint
decks, and PNG image generation/editing. Revisions produce a new version without
overwriting the original. Sources can include up to four uploaded files and an
explicitly selected owned course. These requests do not pollute course chat history.

The prepared video provider uses asynchronous create/status/content endpoints,
but `STUDYBRIDGE_VIDEO_ENABLED` defaults to false. The UI is disabled and direct
API requests are rejected before any provider call. Enable it only after an
explicitly approved launch, account access verification, and pricing review.

## Cheatsheet Printing

Open **Tools → Cheatsheet PDF**, choose a course from **选择课程**, and enter the
content and print requirements. The account remembers the chosen course independently
of the Study Area course. AI uses the selected owned course’s uploaded materials,
chat attachments and latest 16 messages as reference. Requests, print settings,
workspace uploads and history stay separate per course when switching. Without any
courses, add one in Study Area before generating. Revisions retain their original
course and earlier files. Study Area no longer offers a Cheatsheet creation mode.

PDF generation and every revision apply the current saved Learning Style. The
client waits for pending preference saves before submitting the PDF
workspace, and each request snapshots the authenticated account's preferences.
English answers with Chinese explanations produces complementary English sheet
content and concise Chinese teaching notes within the print limits. A latest
explicit request overrides saved style; earlier revision requests do not override
the current language choice.

Each generation reloads current course text, durable chat attachments and recent
course guidance. Selected historical PNG/JPEG/WebP/GIF images are provided as
actual vision inputs and uploaded to the hosted Python environment. Named images
and previously selected image names guide follow-up retrieval. Up to eight image
inputs are selected per generation; large text collections use relevant passages.
Unsupported retained image formats produce a clear error requesting a supported
format rather than silently omitting them.

Cheatsheet workspace source uploads are copied to private job storage and inherited
by the next version along with the latest PDF. Every revision gets its own source
copies, so it can continue after a restart or deletion of an earlier version.
Bounded earlier requests preserve the original and recent revision requirements
(36,000 characters); the latest PDF remains the content baseline. Revisions retain
the original owned course and inherit print settings unless explicitly changed.
Limits: 16 retained workspace sources and 28 MB total sources, selected historical
images and previous artifact. These source files are never exposed as public
downloads/job metadata and are removed with the job or after generation failure.
Existing older PDFs remain revisable; workspace originals discarded by earlier
versions need re-upload, while already-retained course chat images remain usable.

Users control A4/Letter, portrait/landscape, single/double-sided printing, one to
four physical sheets, one to three columns, minimum 8-14 pt text and 5-20 mm margins.
Double-sided output has two PDF pages per sheet. The server checks every page's
dimensions, selectable text, minimum font size, text bounds and neutral vector/text
colors for monochrome output. It does not independently infer column structure or
check embedded raster image colors. Failed layout checks trigger at most one
automatic regeneration, which may incur an additional provider charge.

The preview/print icon opens the authenticated PDF in the browser's PDF viewer;
use its Print command to print the actual PDF, not the chat or preview image.
Choose matching paper, actual-size scaling, and duplex settings in the printer
dialog. The application cannot override the user's printer settings.

## Provider Configuration

The server uses its existing private `OPENAI_API_KEY`. Document generation uses
`OPENAI_DOCUMENT_MODEL`, falling back to the configured complex-task model.
The model must support Responses API Code Interpreter. Images use
`OPENAI_IMAGE_MODEL` (default `gpt-image-2`); video uses `OPENAI_VIDEO_MODEL`
(default `sora-2`) only when enabled. These APIs have separate permissions and
usage charges. A missing key or permission error produces an explicit failure,
not a simulated successful artifact. ChatGPT subscription access does not
configure the application's API access.

Documents run in a fresh hosted Code Interpreter container. Uploaded source and
prior-version files are re-uploaded for each task, so revisions do not depend on
an expired container. Source uploads and known containers are deleted after the
result is downloaded, including failure paths where their IDs are known. Model
generated code never runs on the StudyBridge host.

Official API references:
- https://developers.openai.com/api/docs/guides/tools-code-interpreter
- https://developers.openai.com/api/reference/resources/images/methods/edit
- https://developers.openai.com/api/docs/guides/image-generation
- https://developers.openai.com/api/docs/guides/video-generation

## Quality And Limits

The document instruction requires proper document styles, readable editable
tables/charts, formulas, CJK-capable fonts, speaker notes, and a rendered-content
review. A successful document must include the requested primary format, a PDF
preview, and at least one PNG preview; text-only or incomplete results fail.
Duplicate previews are removed. If native rendering is unavailable to the
generation environment, it must disclose that a content preview was used.

The server checks file signatures, Office package structure, size/dimension
limits, and disallows macros, embedded OLE objects and spreadsheet external links.
These are format/security checks, not an independent factual or visual guarantee.
Users should review important claims, calculations, sources and native Office
layout. We cannot promise every generated artifact matches ChatGPT's quality.

Limits: one active job per account, six active jobs per server process, ten
submissions per account/hour in a durable quota ledger, 100 saved jobs per account,
6000-character requests, 12 MB per source file/16 MB aggregate uploads, 20 MB per
output file and 40 MB total outputs. Jobs time out after ten minutes. Failed and
canceled submissions count toward the hourly limit; deleting a job does not reset
the quota. Existing pending jobs are marked interrupted after a server restart,
rather than being silently retried and billed again. For multi-process deployments,
the durable quota remains shared, but global worker concurrency needs a shared queue.
Execution and restart recovery currently assume one server worker. Before
clustering or using multiple replicas, add shared job leases/queue ownership as
well; one worker must not mistake another worker's active task for an interruption.

## Private Storage And Backup

Metadata is persisted in the existing database. In local/Lightsail mode, binary
files live outside `public`, under `creative-files` beside the JSON database,
in hashed-account and checked-job directories with private permissions. Older
test material-backed files remain readable. Binary files do not inflate the main
JSON database. DynamoDB mode uses the existing chunked material store.

Every preview/download requires the owning account's session. Responses use
private/no-store caching and content-disposition headers; only PDF/PNG/MP4 preview
requests can be inline. Delete removes that job's files without touching other
accounts or versions. Cancel/failure removes partial saved output.

Back up both the database and its sibling `creative-files` directory for a full
local artifact backup. Existing scheduled JSON database backups alone do not
include these binary files. Keep all private storage, verification outputs,
credentials and backup files out of Git and deployment source archives.

## API

- `GET /api/creative/capabilities`
- `GET /api/creative` lists the account's recent jobs.
- `POST /api/creative` creates a job and returns HTTP 202.
- `GET /api/creative/:id` returns progress/results.
- `POST /api/creative/:id/cancel`
- `DELETE /api/creative/:id`
- `GET /api/creative/:id/files/:fileId` downloads a checked file.

The client preserves per-tool request drafts/settings/uploads through rerenders,
polls only while an active job is visible, and offers revision, cancellation,
refresh and deletion without changing the existing email or Study Area workflows.
