const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { test } = require("node:test");

function preview({ reduced = false, observers = true } = {}) {
  const events = new Map(), frames = new Map(), mediaEvents = new Map();
  const preference = { matches: reduced, addEventListener: (name, fn) => mediaEvents.set(name, fn) };
  let nextFrame = 0, intersection;
  const stage = { getBoundingClientRect: () => ({ top: 200 - window.scrollY, height: 500 }) };
  const layers = [24, -30].map((distance) => {
    const styles = new Map(), classes = new Set();
    return { dataset: { parallax: String(distance) }, closest: () => stage, styles, classes,
      style: { setProperty: (key, value) => styles.set(key, value), removeProperty: (key) => styles.delete(key) },
      classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name), remove: (name) => classes.delete(name) } };
  });
  const addEventListener = (name, fn) => events.set(name, fn);
  const document = { hidden: false, querySelectorAll: () => layers, addEventListener };
  const window = { innerHeight: 900, scrollY: 0, matchMedia: () => preference, addEventListener,
    requestAnimationFrame: (fn) => { frames.set(++nextFrame, fn); return nextFrame; },
    cancelAnimationFrame: (id) => frames.delete(id) };
  if (observers) window.IntersectionObserver = class {
    constructor(callback) { intersection = callback; }
    observe() {}
    disconnect() {}
  };
  vm.runInNewContext(fs.readFileSync(require.resolve("../public/landing-motion"), "utf8"), { window, document });
  return { layers, frames, window, document,
    emit: (name) => events.get(name)?.(),
    flush: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn()); },
    reduce: (matches) => { preference.matches = matches; mediaEvents.get("change")(); },
    intersect: (isIntersecting) => intersection([{ target: stage, isIntersecting }]),
    offsets: () => layers.map((layer) => Number.parseFloat(layer.styles.get("--parallax-y"))) };
}

test("scroll layers move in opposite directions, stay bounded and stop requesting frames when idle", () => {
  const page = preview();
  page.flush();
  assert.deepEqual(page.offsets(), [0, 0]);
  page.window.scrollY = 300;
  for (let n = 0; n < 20; n++) page.emit("scroll");
  assert.equal(page.frames.size, 1);
  page.flush();
  const [background, foreground] = page.offsets();
  assert.ok(background > 0 && foreground < 0);
  assert.equal(page.frames.size, 0);
  page.window.scrollY = 100000;
  page.emit("scroll"); page.flush();
  assert.deepEqual(page.offsets(), [24, -30]);
});

test("reduced motion starts static and switching it on cancels pending work and clears offsets", () => {
  const page = preview({ reduced: true });
  page.emit("scroll");
  assert.equal(page.frames.size, 0);
  assert.ok(page.layers.every((layer) => layer.styles.size === 0));
  page.reduce(false);
  page.window.scrollY = 300;
  page.flush();
  assert.ok(page.offsets()[0] > 0);
  page.emit("scroll");
  page.reduce(true);
  assert.equal(page.frames.size, 0);
  assert.ok(page.layers.every((layer) => layer.styles.size === 0 && layer.classes.size === 0));
});

test("hidden pages pause immediately and resume from the current scroll position", () => {
  const page = preview();
  page.document.hidden = true;
  page.emit("visibilitychange");
  page.emit("scroll");
  assert.equal(page.frames.size, 0);
  page.window.scrollY = 300;
  page.document.hidden = false;
  page.emit("visibilitychange"); page.flush();
  assert.ok(page.offsets()[0] > 0);
});

test("offscreen layers stay idle and update on reentry; restored pages recover without a scroll", () => {
  const page = preview();
  page.flush();
  page.intersect(false);
  page.window.scrollY = 300;
  page.emit("scroll"); page.flush();
  assert.deepEqual(page.offsets(), [0, 0]);
  page.intersect(true); page.flush();
  assert.ok(page.offsets()[0] > 0);
  page.emit("scroll"); page.emit("pagehide");
  assert.equal(page.frames.size, 0);
  page.window.scrollY = 0;
  page.emit("pageshow"); page.flush();
  assert.deepEqual(page.offsets(), [0, 0]);
});

test("motion still works when optional observers are unavailable", () => {
  const page = preview({ observers: false });
  page.window.scrollY = 300;
  page.emit("resize"); page.flush();
  assert.ok(page.offsets()[0] > 0);
  page.reduce(true);
  assert.ok(page.layers.every((layer) => layer.styles.size === 0));
});
