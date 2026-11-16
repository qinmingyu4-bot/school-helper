/* A seekable, silent product film. Only transform/opacity animate; no video download. */
(function () {
  'use strict';
  const root = document.querySelector('.usage-demo');
  if (!root || !Element.prototype.animate) return;
  const scenes = [...root.querySelectorAll('[data-scene]')];
  const play = root.querySelector('[data-demo-play]');
  const seek = root.querySelector('[data-demo-seek]');
  const replay = root.querySelector('[data-demo-replay]');
  const chapters = [...root.querySelectorAll('[data-demo-chapter]')];
  const clock = root.querySelector('[data-demo-time]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const starts = [0, 9000, 18500], duration = 28000;
  let position = 0, playing = !reduced.matches, visible = false, frame = 0, previous = null, active = -1;
  const tracks = [];
  function track(selector, keyframes, start, length) {
    root.querySelectorAll(selector).forEach(element => {
      const animation = element.animate(keyframes, { duration: length, fill: 'both', easing: 'cubic-bezier(.22,.68,.2,1)' });
      animation.pause();
      tracks.push({ animation, start, length });
    });
  }
  scenes.forEach((scene, index) => {
    if (index < 2) track(`[data-scene="${index}"]`, [{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(-12px)' }], starts[index + 1] - 500, 500);
    track(`[data-scene="${index}"] .demo-scene-copy`, [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }], starts[index], 900);
    track(`[data-scene="${index}"] .demo-workspace`, [{ opacity: 0, transform: 'translateX(32px) scale(.96)' }, { opacity: 1, transform: 'translateX(0) scale(1)' }], starts[index] + 250, 1200);
  });
  track('.demo-file-one', [{ opacity: 0, transform: 'translate(70px,-90px) rotate(9deg)' }, { opacity: 1, transform: 'translate(0,0) rotate(0)' }], 1500, 1800);
  track('.demo-file-two', [{ opacity: 0, transform: 'translate(90px,55px) rotate(-7deg)' }, { opacity: 1, transform: 'translate(0,0) rotate(0)' }], 2400, 1800);
  track('.demo-file i, .demo-ready', [{ opacity: 0 }, { opacity: 1 }], 4200, 800);
  track('.demo-bubble', [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }], 9800, 900);
  track('.demo-reply', [{ opacity: 0, transform: 'translateY(18px)' }, { opacity: 1, transform: 'translateY(0)' }], 11300, 1300);
  track('.demo-tangent', [{ transform: 'rotate(-25deg)' }, { transform: 'rotate(0)' }], 12800, 3000);
  track('.demo-citation', [{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'translateY(0)' }], 15500, 900);
  track('.demo-note, .demo-note-lines', [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'translateY(0)' }], 20000, 1400);
  track('.demo-revision', [{ opacity: 0, transform: 'translateY(20px)' }, { opacity: 1, transform: 'translateY(0)' }], 22200, 1400);
  track('.demo-doc-end', [{ opacity: 0 }, { opacity: 1 }], 25000, 900);
  const english = () => window.StudyBridgeI18n?.getLanguage() === 'en';
  function controls() {
    play.textContent = playing ? 'Ⅱ' : '▶';
    play.setAttribute('aria-label', english() ? (playing ? 'Pause demo' : 'Play demo') : (playing ? '暂停演示' : '播放演示'));
  }
  function render() {
    const index = position >= starts[2] ? 2 : position >= starts[1] ? 1 : 0;
    if (index !== active) {
      active = index;
      scenes.forEach((scene, i) => { scene.hidden = i !== index; });
      chapters.forEach((button, i) => i === index ? button.setAttribute('aria-current', 'step') : button.removeAttribute('aria-current'));
    }
    tracks.forEach(({ animation, start, length }) => { animation.currentTime = reduced.matches ? (animation.effect.target.matches('[data-scene]') ? 0 : length) : Math.max(0, Math.min(length, position - start)); });
    seek.value = position / 1000;
    const seconds = Math.floor(position / 1000);
    const label = `0:${String(seconds).padStart(2, '0')} / 0:28`;
    if (clock.textContent !== label) clock.textContent = label;
    seek.setAttribute('aria-valuetext', label);
  }
  function tick(now) {
    frame = 0;
    if (previous !== null) position = Math.min(duration, position + now - previous);
    previous = now;
    render();
    if (position >= duration) { playing = false; controls(); }
    if (playing && visible && !document.hidden) frame = requestAnimationFrame(tick);
    else previous = null;
  }
  function sync() {
    cancelAnimationFrame(frame); frame = 0; previous = null;
    controls();
    if (playing && visible && !document.hidden) frame = requestAnimationFrame(tick);
  }
  play.addEventListener('click', () => { if (position >= duration) position = 0; playing = !playing; render(); sync(); });
  replay.addEventListener('click', () => { position = 0; playing = true; render(); sync(); });
  seek.addEventListener('input', () => { position = Number(seek.value) * 1000; if (position === duration) playing = false; render(); sync(); });
  chapters.forEach((button, index) => button.addEventListener('click', () => { position = starts[index] + (playing ? 0 : 5500); render(); sync(); }));
  document.addEventListener('visibilitychange', sync);
  reduced.addEventListener('change', () => { if (reduced.matches) playing = false; render(); sync(); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => { visible = entries[0].isIntersecting; sync(); }, { threshold: .15 }).observe(root.querySelector('.demo-player'));
  } else visible = true;
  function translate() {
    root.querySelectorAll('[data-demo-zh]').forEach(element => { element.textContent = element.dataset[english() ? 'demoEn' : 'demoZh']; });
    seek.setAttribute('aria-label', english() ? 'Demo playback position' : '演示播放进度');
    replay.setAttribute('aria-label', english() ? 'Replay demo' : '重新播放演示');
    root.querySelector('.demo-stage').setAttribute('aria-label', english() ? 'Animated learning workflow' : '学习流程动画');
    controls();
  }
  window.StudyBridgeI18n?.subscribe(translate);
  translate(); render(); sync();
})();
