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
private/no-store caching and content-disposition headers; only PNG/MP4 preview
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
