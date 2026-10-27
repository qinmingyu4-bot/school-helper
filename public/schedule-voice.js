(function (scope) {
  "use strict";
  function createRecorder({ mediaDevices = scope.navigator?.mediaDevices, Recorder = scope.MediaRecorder, secure = scope.isSecureContext, onState = () => {}, onAudio = () => {}, timers = scope } = {}) {
    let phase = "idle", generation = 0, stream = null, recorder = null, timer = null, chunks = [], size = 0, discarded = false;
    const supported = Boolean(secure && mediaDevices?.getUserMedia && Recorder);
    const emit = (message = "") => onState({ phase, message, supported });
    const release = () => { if (timer !== null) timers.clearTimeout(timer); timer = null; stream?.getTracks().forEach((track) => track.stop()); stream = null; };
    function cancel(message = "录音已取消。") {
      generation++;
      discarded = true;
      if (recorder?.state === "recording") { try { recorder.stop(); } catch {} }
      recorder = null; chunks = []; release(); phase = "idle"; emit(message);
    }
    function stop() {
      if (phase === "requesting") { cancel(); return; }
      if (recorder?.state !== "recording") return;
      phase = "stopping"; emit("正在结束录音…");
      try { recorder.stop(); } catch { cancel("录音未成功结束，请重试。"); }
      release();
    }
    async function start() {
      if (phase !== "idle") return;
      if (!supported) { emit("此页面暂不支持直接录音，可导入语音文件，或使用手机键盘的麦克风。"); return; }
      const token = ++generation;
      phase = "requesting"; discarded = false; chunks = []; size = 0; emit("请允许使用麦克风…");
      try {
        const acquired = await mediaDevices.getUserMedia({ audio: true });
        if (token !== generation) { acquired.getTracks().forEach((track) => track.stop()); return; }
        stream = acquired;
        const mimeType = ["audio/webm;codecs=opus", "audio/mp4", "audio/webm"].find((type) => Recorder.isTypeSupported?.(type));
        recorder = new Recorder(stream, mimeType ? { mimeType } : {});
        const current = recorder;
        current.ondataavailable = (event) => {
          if (token !== generation || discarded || !event.data?.size) return;
          chunks.push(event.data); size += event.data.size;
          if (size > 8 * 1024 * 1024) cancel("录音超过 8 MB，请分段录制。");
        };
        current.onerror = () => { if (token === generation) cancel("录音出错，请重试或输入文字。"); };
        current.onstop = () => {
          if (token !== generation) return;
          release(); recorder = null; phase = "idle";
          const audio = new Blob(chunks, { type: current.mimeType || mimeType || "audio/webm" });
          chunks = [];
          if (discarded || !audio.size) { emit("未录到语音，请重试。"); return; }
          emit();
          Promise.resolve().then(() => { if (token === generation) return onAudio(audio); }).catch(() => { if (token === generation) emit("语音处理失败，请重试。"); });
        };
        current.start(1000); phase = "recording"; emit("正在录音，点击结束后转成文字。最多录制 2 分钟。");
        timer = timers.setTimeout(stop, 120000);
      } catch (error) {
        if (token !== generation) return;
        release(); recorder = null; phase = "idle";
        emit(error.name === "NotAllowedError" ? "麦克风权限未开启。可在浏览器设置中允许，或使用文字 / 导入语音。" : "无法使用麦克风，请检查设备，或直接输入文字。");
      }
    }
    return { start, stop, cancel, get supported() { return supported; }, get phase() { return phase; } };
  }
  const api = { createRecorder };
  if (typeof module === "object" && module.exports) module.exports = api;
  else scope.StudyBridgeScheduleVoice = api;
})(typeof window !== "undefined" ? window : globalThis);
