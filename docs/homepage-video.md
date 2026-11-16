# Homepage product walkthrough

The homepage embeds `public/media/studybridge-usage-demo.mp4` (H.264,
1440 × 900, 30 fps, 30.1 seconds) with a lightweight poster. It is silent.

The footage uses actual UI captures from an isolated local instance of this
repository with a dedicated sample account. It shows a real file upload,
question entry, streamed response rendering, and SB Docs editing/save operations.
Frames are edited, held and reframed for legibility; this is an edited walkthrough,
not an uninterrupted real-time recording or a latency benchmark. The response
is a deterministic example supplied by a local test transport. No production
account data, credentials or private files appear in the shipped media.

Sequence: 0–5.5 s course/material upload; 5.5–8.5 s question entry;
8.5–19.5 s example answer; 19.5–30.1 s SB Docs editing and save.
The filmed interface is Chinese; surrounding step captions, controls and text
transcript follow the website language selector.

The player uses native video decoding, loads on visibility/play and suspends in
background tabs or outside the viewport. Reduced-motion users start with the
poster and a manual play button. An explicit user pause remains paused. The
floating controls are keyboard accessible and stay visible on touch screens.
Native controls remain as the no-JavaScript/error fallback. Fullscreen uses the
container API where available, with the native iOS video API as a fallback.
`lib/public-video.js` serves single byte ranges for video seeking on both servers.

To preview, run `npm run preview:landing` and open `/#usage-demo`. Verify playback,
pause, replay, keyboard seeking, fullscreen, Chinese/English copy and narrow
screens. Do not commit recording accounts, local databases or raw temporary frames.
When replacing footage, update captions, duration information and media URL cache
keys together. This change is not authorization to deploy to production.
