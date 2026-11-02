(function (scope, factory) {
  "use strict";
  if (typeof module === "object" && module.exports) module.exports = factory();
  else factory().mount(scope);
})(typeof globalThis === "object" ? globalThis : this, function () {
  "use strict";
  const clamp = (value) => Math.max(0, Math.min(1, value));
  const smooth = (value) => { const t = clamp(value); return t * t * (3 - 2 * t); };
  // Each pose is x, y, depth, rotation, Y tilt, scale, opacity. The final pose
  // matches the static CSS layout, so disabling motion always leaves a complete UI.
  const poses = {
    material: [[110, 110, 100, -18, -24, 1, 1], [-92, -64, 150, -12, 14, 1.06, 1], [0, 0, 0, 0, 0, 1, 1]],
    study: [[-75, 34, 40, 8, -15, .92, 1], [42, 10, 75, 8, -12, 1.03, 1], [0, 0, 0, 0, 0, 1, 1]],
    schedule: [[110, -66, 70, 14, 20, .96, 1], [-75, 65, 120, -9, 18, 1.04, 1], [0, 0, 0, 0, 0, 1, 1]],
    tools: [[20, -130, 30, -8, -10, .88, 1], [28, 74, 110, 5, -10, 1, 1], [0, 0, 0, 0, 0, 1, 1]],
    doc: [[130, 190, 80, -65, -70, .3, 0], [-58, -20, 170, -19, 18, 1, 1], [120, 285, 0, 0, 0, .4, 0]],
    chat: [[20, 220, 30, 55, 65, .3, 0], [-12, -42, 140, 12, -20, 1, 1], [70, 285, 0, 0, 0, .4, 0]],
    calendar: [[-120, 160, 50, -45, -60, .3, 0], [25, -14, 165, -12, 22, 1, 1], [20, 285, 0, 0, 0, .4, 0]],
    create: [[-200, 210, 30, 70, 70, .3, 0], [40, 40, 130, 20, -18, 1, 1], [-15, 285, 0, 0, 0, .4, 0]]
  };

  function buildFrame(value, viewportWidth = 1440) {
    const progress = clamp(Number(value) || 0);
    const first = progress <= .46;
    const amount = smooth(first ? progress / .46 : (progress - .46) / .4);
    const factor = viewportWidth <= 800 ? .42 : viewportWidth <= 1100 ? .68 : 1;
    const layers = {};
    for (const [name, keys] of Object.entries(poses)) {
      const from = keys[first ? 0 : 1], to = keys[first ? 1 : 2];
      const pose = from.map((start, index) => start + (to[index] - start) * amount);
      layers[name] = { x: pose[0] * factor, y: pose[1] * factor, z: pose[2] * factor,
        rotate: pose[3], tilt: pose[4], scale: pose[5], opacity: pose[6] };
    }
    return { progress, phase: progress < .28 ? 0 : progress < .7 ? 1 : 2, layers,
      shell: .15 + .85 * smooth((progress - .46) / .34),
      guides: Math.sin(progress * Math.PI) * .7 };
  }

  function mount(browser) {
    const document = browser.document;
    const section = document.querySelector("[data-product-story]");
    if (!section || !browser.matchMedia) return;
    const preference = browser.matchMedia("(prefers-reduced-motion: reduce)");
    const layers = [...section.querySelectorAll("[data-story-layer]")];
    const steps = [...section.querySelectorAll(".story-step")];
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
      for (const element of layers) {
        const pose = state.layers[element.dataset.storyLayer];
        if (!pose) continue;
        element.style.transform = `translate3d(${pose.x.toFixed(2)}px,${pose.y.toFixed(2)}px,${pose.z.toFixed(2)}px) rotateZ(${pose.rotate.toFixed(2)}deg) rotateY(${pose.tilt.toFixed(2)}deg) scale(${pose.scale.toFixed(3)})`;
        element.style.opacity = String(pose.opacity);
      }
      section.style.setProperty("--story-shell", state.shell.toFixed(3));
      section.style.setProperty("--story-guides", state.guides.toFixed(3));
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
        section.style.removeProperty("--story-shell");
        section.style.removeProperty("--story-guides");
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
