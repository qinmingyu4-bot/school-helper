'use strict';
// Single byte ranges keep native video seeking working in Safari and mobile browsers.
function sendPublicVideo(req, res, bytes) {
  const headers = { 'content-type': 'video/mp4', 'accept-ranges': 'bytes', 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff' };
  let start = 0, end = bytes.length - 1, status = 200;
  if (req.headers.range && req.method !== 'HEAD') {
    const match = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!match || (!match[1] && !match[2])) {
      res.writeHead(416, { ...headers, 'content-range': `bytes */${bytes.length}` }); return res.end();
    }
    if (match[1]) { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), end) : end; }
    else { start = Math.max(0, bytes.length - Number(match[2])); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= bytes.length) {
      res.writeHead(416, { ...headers, 'content-range': `bytes */${bytes.length}` }); return res.end();
    }
    status = 206; headers['content-range'] = `bytes ${start}-${end}/${bytes.length}`;
  }
  headers['content-length'] = end - start + 1;
  res.writeHead(status, headers);
  res.end(req.method === 'HEAD' ? undefined : bytes.subarray(start, end + 1));
}
module.exports = { sendPublicVideo };
