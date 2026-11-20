"use strict";
const { imageSize } = require('image-size');
const invalid = () => Object.assign(Error('暂时无法读取这个文件，请重新上传后再试。'), { statusCode: 400, usageError: true });
// Admission estimates, not invoice prices. Explicit settings are required by
// the product. Returned token/duration usage remains the settlement authority.
async function mediaEstimate(model, body, imageRates) {
  const form = body instanceof FormData, get = key => form ? body.get(key) : body[key];
  if (model === 'gpt-transcribe') {
    const file = get('file');
    if (!file?.arrayBuffer) throw invalid();
    try {
      const { parseBuffer } = await import('music-metadata');
      const data = Buffer.from(await file.arrayBuffer());
      const metadata = await parseBuffer(data, { mimeType:file.type, size:data.length }, { duration:true, skipCovers:true });
      const seconds = metadata.format.duration;
      if (!Number.isFinite(seconds) || seconds <= 0) throw invalid();
      return Math.ceil((seconds + 1) * 75); // One second of duration rounding headroom.
    } catch { throw invalid(); }
  }
  const size = get('size') || '1024x1024', quality = get('quality') || 'medium';
  if (!['1024x1024','1536x1024','1024x1536'].includes(size) || !['low','medium','high'].includes(quality)) throw invalid();
  const [width,height] = size.split('x').map(Number);
  // GPT Image 2 published output examples, rounded up with admission headroom.
  // 2.6 uses a conservative model/quality/size envelope (5x low, 2x others);
  // do not misrepresent the envelope as OpenAI's exact token calculator.
  const old = { low:[6000,5000], medium:[53000,41000], high:[211000,165000] };
  const output = model === 'gpt-image-2' ? old[quality][width === height ? 0 : 1]
    : old[quality][width === height ? 0 : 1] * (quality === "low" ? 5 : 2);
  const n = Number(get('n') || 1);
  if (!Number.isInteger(n) || n < 1 || n > 10) throw invalid();
  const inputs = form ? [...body.entries()].filter(([key,v])=>/^image(?:\[.*\])?$/.test(key) && v?.arrayBuffer).map(([,v])=>v)
    : (body.images || []).map(v => v.image_url);
  let inputTokens = 0;
  for (const value of inputs) {
    let bytes;
    if (typeof value === 'string' && /^data:image\/[\w.+-]+;base64,/.test(value)) bytes = Buffer.from(value.slice(value.indexOf(',')+1),'base64');
    else if (value?.arrayBuffer) bytes = Buffer.from(await value.arrayBuffer());
    else throw invalid();
    try {
      const { width:w,height:h } = imageSize(bytes);
      if (!w || !h) throw invalid();
      // High-fidelity reference envelope, based on actual dimensions; no network
      // fetch of arbitrary URLs, and no cost proportional to base64 string size.
      const scale = Math.min(1,2048/Math.max(w,h));
      inputTokens += 256 + Math.ceil(w*scale/32) * Math.ceil(h*scale/32);
    } catch { throw invalid(); }
  }
  const textTokens = Buffer.byteLength(String(get('prompt') || ''),'utf8');
  return Math.ceil((output*n + inputTokens*imageRates[1] + textTokens*imageRates[0])*1.1);
}
module.exports = { mediaEstimate };
