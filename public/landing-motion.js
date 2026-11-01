(function () {
  "use strict";
  const layers = Array.from(document.querySelectorAll("[data-parallax]"), (element) => ({
    element,
    stage: element.closest("[data-parallax-stage]"),
    distance: Number(element.dataset.parallax)
  })).filter((layer) => layer.stage && Number.isFinite(layer.distance));
  if (!layers.length || !window.matchMedia) return;

  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const stages = new Set(layers.map((layer) => layer.stage));
  const visible = new Set(stages);
  let frame = 0;

  function cancelFrame() {
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
  }

  function render() {
    frame = 0;
    if (reducedMotion.matches || document.hidden) return;
    // Read stationary containers first; moving layers never feed back into the geometry.
    const positions = new Map();
    for (const stage of visible) {
      const { top, height } = stage.getBoundingClientRect();
      const progress = (window.innerHeight - height - 2 * top) / (window.innerHeight + height);
      positions.set(stage, Math.max(-1, Math.min(1, progress)));
    }
    for (const { element, stage, distance } of layers) {
      if (!positions.has(stage)) continue;
      element.style.setProperty("--parallax-y", `${(positions.get(stage) * distance).toFixed(2)}px`);
    }
  }

  function schedule() {
    if (!frame && !reducedMotion.matches && !document.hidden) frame = window.requestAnimationFrame(render);
  }

  const observer = window.IntersectionObserver ? new window.IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (entry.isIntersecting) visible.add(entry.target);
      else visible.delete(entry.target);
    }
    for (const { element, stage } of layers) element.classList.toggle("parallax-active", visible.has(stage));
    schedule();
  }, { rootMargin: "80px 0px" }) : null;

  function updatePreference() {
    cancelFrame();
    observer?.disconnect();
    visible.clear();
    for (const { element } of layers) {
      element.style.removeProperty("--parallax-y");
      element.classList.remove("parallax-active");
    }
    if (reducedMotion.matches) return;
    for (const stage of stages) {
      visible.add(stage);
      observer?.observe(stage);
    }
    schedule();
  }

  window.addEventListener("scroll", schedule, { passive: true });
  window.addEventListener("resize", schedule, { passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) cancelFrame();
    else schedule();
  });
  window.addEventListener("pagehide", cancelFrame);
  window.addEventListener("pageshow", updatePreference);
  reducedMotion.addEventListener("change", updatePreference);
  // Fonts and language changes can alter a stage without changing the viewport.
  if (window.ResizeObserver) {
    const resizeObserver = new window.ResizeObserver(schedule);
    for (const stage of stages) resizeObserver.observe(stage);
  }
  updatePreference();
})();
