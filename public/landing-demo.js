/* Shared demo copy; the player stays dormant until final video markup is supplied. */
(function () {
  'use strict';
  const root = document.querySelector('.usage-demo');
  if (!root) return;
  const english = () => window.StudyBridgeI18n?.getLanguage() === 'en';
  function translateCopy() {
    root.querySelectorAll('[data-demo-zh]').forEach(el => { el.textContent = el.dataset[english() ? 'demoEn' : 'demoZh']; });
  }
  window.StudyBridgeI18n?.subscribe(translateCopy); translateCopy();
  const video = root.querySelector('video');
  if (!video) return;
  const film = root.querySelector('.demo-film');
  const controls = root.querySelector('.demo-float');
  const play = root.querySelector('[data-film-play]');
  const replay = root.querySelector('[data-film-replay]');
  const full = root.querySelector('[data-film-fullscreen]');
  const scrub = root.querySelector('.demo-scrub');
  const start = root.querySelector('.demo-start');
  const caption = root.querySelector('[data-film-caption]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const chapters = [[0, '01 / 选择课程，上传讲义', '01 / Choose a course and upload notes'], [5.5, '02 / 输入问题，点击发送', '02 / Type a question and send'], [8.5, '03 / 看解释，沿着例子理解', '03 / Follow the explanation and example'], [19.5, '04 / 打开 SB Docs，编辑并保存', '04 / Open SB Docs, edit and save']];
  let visible = false, wanted = !reduced.matches, started = false, pending = false;
  function state() {
    const paused = video.paused;
    play.textContent = paused ? '▶' : 'Ⅱ';
    play.setAttribute('aria-label', english() ? (paused ? 'Play demo' : 'Pause demo') : (paused ? '播放演示' : '暂停演示'));
    film.classList.toggle('is-paused', paused);
    start.hidden = started || !paused;
  }
  function progress() {
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const value = duration ? video.currentTime / duration * 100 : 0;
    scrub.value = value;
    scrub.style.setProperty('--played', `${value}%`);
    scrub.setAttribute('aria-valuetext', `${Math.floor(video.currentTime)} / ${Math.floor(duration)}`);
    const chapter = [...chapters].reverse().find(item => video.currentTime >= item[0]) || chapters[0];
    caption.textContent = chapter[english() ? 2 : 1];
  }
  async function sync() {
    if (!visible || document.hidden || !wanted) { video.pause(); return; }
    if (pending || !video.paused) return;
    pending = true;
    try {
      await video.play();
      if (!visible || document.hidden || !wanted) video.pause();
    } catch (error) {
      if (error.name !== 'AbortError' && visible && !document.hidden) wanted = false;
      state();
    } finally {
      pending = false;
      if (wanted && visible && !document.hidden && video.paused) sync();
    }
  }
  function toggle() {
    wanted = video.paused;
    if (video.ended) video.currentTime = 0;
    sync();
  }
  play.addEventListener('click', toggle);
  start.addEventListener('click', toggle);
  replay.addEventListener('click', () => { video.currentTime = 0; wanted = true; sync(); });
  scrub.addEventListener('input', () => { if (Number.isFinite(video.duration)) video.currentTime = Number(scrub.value) / 100 * video.duration; progress(); });
  full.addEventListener('click', async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else if (film.requestFullscreen) await film.requestFullscreen(); else video.webkitEnterFullscreen?.(); } catch (_) { /* Playback remains usable if fullscreen is unavailable. */ }
  });
  full.hidden = !film.requestFullscreen && !video.webkitEnterFullscreen;
  video.addEventListener('playing', () => { started = true; state(); });
  video.addEventListener('pause', state);
  video.addEventListener('ended', () => { wanted = false; state(); });
  video.addEventListener('timeupdate', progress);
  video.addEventListener('loadedmetadata', progress);
  video.addEventListener('error', () => { wanted = false; video.controls = true; controls.hidden = scrub.hidden = start.hidden = true; });
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', () => { if (reduced.matches) { wanted = false; sync(); } });
  function translate() {
    replay.setAttribute('aria-label', english() ? 'Replay' : '重新播放');
    full.setAttribute('aria-label', english() ? 'Watch fullscreen' : '全屏观看');
    scrub.setAttribute('aria-label', english() ? 'Playback position' : '演示进度');
    video.setAttribute('aria-label', english() ? 'StudyBridge product walkthrough (Chinese interface)' : 'StudyBridge 产品使用演示');
    state(); progress();
  }
  controls.hidden = scrub.hidden = false; video.controls = false;
  window.StudyBridgeI18n?.subscribe(translate); translate();
  if ('IntersectionObserver' in window) new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }, { threshold: .25 }).observe(film);
  else { visible = true; sync(); }
})();
