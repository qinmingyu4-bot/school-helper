(function (scope, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else factory().mount(scope);
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const smooth = (value) => { const t = clamp(value); return t * t * (3 - 2 * t); };
  // Translations use a percentage of the visual, so files converge into the
  // same course center at every screen size. Depth alone is reduced on phones.
  const files = {
    slides: { x: 35, y: 20, rotate: -12, tilt: -12, start: .02 },
    syllabus: { x: -35, y: 18, rotate: 11, tilt: 10, start: .08 },
    problems: { x: 35, y: -17, rotate: -8, tilt: -9, start: .14 },
    notes: { x: -35, y: -19, rotate: 9, tilt: 12, start: .2 }
  };

  function buildFrame(value, viewportWidth = 1440) {
    const progress = clamp(Number(value) || 0);
    const depth = viewportWidth <= 800 ? .4 : viewportWidth <= 1100 ? .7 : 1;
    const layers = {};
    for (const [name, file] of Object.entries(files)) {
      const t = smooth((progress - file.start) / .32);
      layers[name] = { x: file.x * t, y: file.y * t, z: 65 * depth * (1 - t),
        rotate: file.rotate * (1 - t), tilt: file.tilt * (1 - t),
        scale: 1 - .82 * t, opacity: 1 - smooth((t - .6) / .4) };
      const stored = smooth((progress - file.start - .23) / .09);
      layers[`stored-${name}`] = { x: 0, y: 1.4 * (1 - stored), z: 0,
        rotate: 0, tilt: 0, scale: 1, opacity: stored };
    }
    const fill = smooth((progress - .18) / .36);
    layers.course = { x: 0, y: 0, z: 0, rotate: fill === 1 ? 0 : -2 * (1 - fill), tilt: 0,
      scale: 1 + .035 * Math.sin(fill * Math.PI), opacity: 1 };
    for (const [index, name] of ["study", "review", "assignment"].entries()) {
      const t = smooth((progress - .56 - index * .05) / .28);
      if (t === 1) {
        layers[name] = { x: 0, y: 0, z: 0, rotate: 0, tilt: 0, scale: 1, opacity: 1 };
        continue;
      }
      layers[name] = { x: (1 - index) * 33 * (1 - t), y: -45 * (1 - t),
        z: t > 0 && t < 1 ? 30 * depth * Math.sin(t * Math.PI) : 0, rotate: (index - 1) * 8 * (1 - t),
        tilt: 0, scale: .18 + .82 * t, opacity: smooth(t / .45) };
    }
    return { progress, phase: progress < .27 ? 0 : progress < .6 ? 1 : 2,
      layers, fill, links: smooth((progress - .55) / .3), inputs: 1 - fill };
  }

  function mount(browser) {
    const document = browser.document;
    const section = document.querySelector("[data-product-story]");
    if (!section || !browser.matchMedia) return;
    const preference = browser.matchMedia("(prefers-reduced-motion: reduce)");
    const layers = [...section.querySelectorAll("[data-story-layer]")];
    const steps = [...section.querySelectorAll(".story-step")];
    const visual = section.querySelector(".story-visual");
    let frame = 0, active = false, phase = -1;

    function cancel() {
      if (frame) browser.cancelAnimationFrame(frame);
      frame = 0;
    }

    function render() {
      frame = 0;
      if (!active || document.hidden) return;
      const rect = section.getBoundingClientRect();
      const inView = rect.top <= browser.innerHeight && rect.bottom >= 0;
      section.classList.toggle("story-in-view", inView);
      if (!inView) return;
      const state = buildFrame(-rect.top / Math.max(1, rect.height - browser.innerHeight), browser.innerWidth);
      const bounds = visual.getBoundingClientRect();
      for (const element of layers) {
        const pose = state.layers[element.dataset.storyLayer];
        if (!pose) continue;
        element.style.transform = `translate3d(${(pose.x * bounds.width / 100).toFixed(2)}px,${(pose.y * bounds.height / 100).toFixed(2)}px,${pose.z.toFixed(2)}px) rotateZ(${pose.rotate.toFixed(2)}deg) rotateY(${pose.tilt.toFixed(2)}deg) scale(${pose.scale.toFixed(3)})`;
        element.style.opacity = String(pose.opacity);
      }
      section.style.setProperty("--story-fill", state.fill.toFixed(3));
      section.style.setProperty("--story-links", state.links.toFixed(3));
      section.style.setProperty("--story-inputs", state.inputs.toFixed(3));
      if (phase !== state.phase) {
        phase = state.phase;
        steps.forEach((step, index) => step.classList.toggle("story-step-active", index === phase));
      }
    }

    function schedule() {
      if (!frame && active && !document.hidden) frame = browser.requestAnimationFrame(render);
    }

    function configure() {
      cancel();
      // Short viewports get the complete static composition instead of a pinned scene.
      active = !preference.matches && browser.innerHeight > 600;
      section.classList.toggle("story-enabled", active);
      if (!active) {
        section.classList.remove("story-in-view");
        for (const element of layers) { element.style.transform = ""; element.style.opacity = ""; }
        section.style.removeProperty("--story-fill");
        section.style.removeProperty("--story-links");
        section.style.removeProperty("--story-inputs");
        steps.forEach((step) => step.classList.remove("story-step-active"));
        phase = -1;
      }
      schedule();
    }

    browser.addEventListener("scroll", schedule, { passive: true });
    browser.addEventListener("resize", configure, { passive: true });
    browser.addEventListener("pagehide", cancel);
    browser.addEventListener("pageshow", configure);
    document.addEventListener("visibilitychange", () => { if (document.hidden) cancel(); else schedule(); });
    preference.addEventListener("change", configure);
    configure();
  }

  return { buildFrame, mount };
});
