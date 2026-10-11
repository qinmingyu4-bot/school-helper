# Markdown Browser Asset

`markdown-it-15.0.2.min.js` is the unmodified UMD browser bundle distributed by
the pinned `markdown-it` npm dependency. It is served locally, without a CDN.
`markdown-it-LICENSE.txt` includes the parser and bundled dependency notices.

Run `npm run vendor:markdown` after intentionally upgrading the dependency,
then update the entry script URL and verify the renderer tests. Those tests
check that the committed browser bundle matches the installed package.

Upstream: https://github.com/markdown-it/markdown-it
