# Homepage walkthrough slot

The owner has paused video production. The homepage framework is ready and
`#usage-demo` currently contains a quiet, bilingual placeholder. There is no
video element, poster, source, playback control or timed caption in the active
page, so visiting the homepage makes no media requests.

Keep this area empty until the owner provides the final video. Do not generate
or restore the previous draft as part of routine homepage changes.

The previous MP4 and poster remain unlinked in `public/media` for reference;
retaining them does not mean they are approved. The player CSS/JS and
`lib/public-video.js` remain available for later integration. The script updates
placeholder copy and returns before initializing playback when no video exists.

When the final video is supplied:

1. Replace `.demo-placeholder` with the `.demo-film` player markup from the
   previous revision, retaining compact floating controls rather than a framed bar.
2. Supply the approved source and poster with fresh cache keys. Update or remove
   the chapter timings and example-data disclosures to match the actual footage.
3. Restore the associated caption and text transcript elements used by the player.
4. Check mobile/fullscreen playback, keyboard controls, language switching,
   reduced motion, offscreen pause and byte-range delivery.

Preview with `npm run preview:landing` at `/#usage-demo`. This placeholder change
does not authorize production deployment.
