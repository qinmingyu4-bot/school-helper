const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

function audioUpload(body) {
  const value = typeof body.fileData === "string" ? body.fileData : "";
  const encoded = value.startsWith("data:") ? value.slice(value.indexOf(",") + 1) : value;
  if (!encoded || encoded.length > Math.ceil(MAX_AUDIO_BYTES / 3) * 4 || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) throw new Error("语音文件为空、无效或超过 8 MB。");
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > MAX_AUDIO_BYTES) throw new Error("语音文件为空或超过 8 MB。");
  let format;
  if (bytes.subarray(0, 4).toString() === "RIFF" && bytes.subarray(8, 12).toString() === "WAVE") format = ["wav", "audio/wav"];
  else if (bytes.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) format = ["webm", "audio/webm"];
  else if (bytes.subarray(4, 8).toString() === "ftyp") format = ["m4a", "audio/mp4"];
  else if (bytes.subarray(0, 3).toString() === "ID3" || bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0) format = ["mp3", "audio/mpeg"];
  if (!format) throw new Error("请选择 WebM、M4A、MP4、WAV 或 MP3 语音文件。");
  return { bytes, name: `schedule-recording.${format[0]}`, type: format[1] };
}

async function transcribeAudio(file, { apiKey, model = "gpt-transcribe", request = fetch, signal = AbortSignal.timeout(60000) }) {
  const form = new FormData();
  form.append("model", model);
  form.append("file", new Blob([file.bytes], { type: file.type }), file.name);
  const response = await request("https://api.openai.com/v1/audio/transcriptions", { method: "POST", headers: { authorization: `Bearer ${apiKey}` }, body: form, signal });
  if (!response.ok) throw new Error("语音转写暂时失败，请重试或直接输入文字。");
  const payload = await response.json();
  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  if (!text) throw new Error("没有识别到清晰语音，请重新录制或输入文字。");
  if (text.length > 6000) throw new Error("语音内容较长，请分段输入，每次不超过 6000 字。");
  return text;
}

module.exports = { MAX_AUDIO_BYTES, audioUpload, transcribeAudio };
