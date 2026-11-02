const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildFrame, mount } = require("../public/landing-story");

test("the product scene rises, separates into rotating layers and assembles into a complete workspace", () => {
  const start = buildFrame(0), open = buildFrame(.46), end = buildFrame(1);
  assert.deepEqual([start.phase, open.phase, end.phase], [0, 1, 2]);
  assert.equal(start.layers.doc.opacity, 0);
  assert.equal(open.layers.doc.opacity, 1);
  assert.ok(open.layers.material.x < 0 && open.layers.study.x > 0);
  assert.ok(open.layers.material.rotate < 0 && open.layers.study.rotate > 0);
  assert.ok(open.layers.doc.z > 0 && open.shell < .2);
  assert.equal(end.shell, 1);
  for (const name of ["material", "study", "schedule", "tools"]) {
    assert.deepEqual(end.layers[name], { x: 0, y: 0, z: 0, rotate: 0, tilt: 0, scale: 1, opacity: 1 });
  }
  assert.equal(end.layers.doc.opacity, 0);
  const forward = [0, .2, .46, .65, 1].map((p) => buildFrame(p));
  assert.deepEqual([1, .65, .46, .2, 0].map((p) => buildFrame(p)).reverse(), forward);
});

test("scene frames stay continuous and bounded, with smaller translations on phones", () => {
  assert.deepEqual(buildFrame(-100), buildFrame(0));
  assert.deepEqual(buildFrame(100), buildFrame(1));
  assert.deepEqual(buildFrame(NaN), buildFrame(0));
  for (let n = 0; n <= 100; n++) {
    const frame = buildFrame(n / 100);
    for (const pose of Object.values(frame.layers)) {
      assert.ok(Object.values(pose).every(Number.isFinite));
      assert.ok(pose.opacity >= 0 && pose.opacity <= 1);
    }
  }
  for (const boundary of [.46, .86]) {
    const a = buildFrame(boundary - .0001), b = buildFrame(boundary + .0001);
    assert.ok(Math.abs(a.layers.material.x - b.layers.material.x) < .01);
    assert.ok(Math.abs(a.layers.doc.opacity - b.layers.doc.opacity) < .001);
  }
  const desktop = buildFrame(.46), phone = buildFrame(.46, 390);
  assert.ok(Math.abs(phone.layers.material.x) < Math.abs(desktop.layers.material.x) / 2);
  assert.ok(phone.layers.doc.z < desktop.layers.doc.z / 2);
});

function preview({ reduced = false, height = 800 } = {}) {
  const events = new Map(), frames = new Map();
  let next = 0, onPreference;
  function element(dataset = {}) {
    const classes = new Set(), properties = new Map();
    return { dataset, classes, properties, style: { transform: "", opacity: "",
      setProperty: (key, value) => properties.set(key, value), removeProperty: (key) => properties.delete(key) },
      classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name), remove: (name) => classes.delete(name) } };
  }
  const layers = ["material", "study", "doc"].map((name) => element({ storyLayer: name }));
  const steps = [element(), element(), element()];
  const section = element();
  section.querySelectorAll = (selector) => selector === "[data-story-layer]" ? layers : steps;
  section.getBoundingClientRect = () => {
    const top = 1200 - browser.scrollY, height = section.classes.has("story-enabled") ? browser.innerHeight * 3 : 500;
    return { top, height, bottom: top + height };
  };
  const preference = { matches: reduced, addEventListener: (_name, fn) => { onPreference = fn; } };
  const document = { hidden: false, querySelector: () => section, addEventListener: (name, fn) => events.set(name, fn) };
  const browser = { document, innerWidth: 1280, innerHeight: height, scrollY: 1200, matchMedia: () => preference,
    addEventListener: (name, fn) => events.set(name, fn),
    requestAnimationFrame: (fn) => { frames.set(++next, fn); return next; }, cancelAnimationFrame: (id) => frames.delete(id) };
  mount(browser);
  return { section, browser, document, frames, layers, steps,
    emit: (name) => events.get(name)?.(),
    flush: () => { const pending = [...frames.values()]; frames.clear(); pending.forEach((fn) => fn()); },
    reduce: (value) => { preference.matches = value; onPreference(); } };
}

test("reduced motion uses a static unpinned workspace and clears live transforms when toggled", () => {
  const page = preview({ reduced: true });
  assert.ok(!page.section.classes.has("story-enabled"));
  assert.equal(page.frames.size, 0);
  page.reduce(false); page.flush();
  assert.ok(page.section.classes.has("story-enabled"));
  assert.notEqual(page.layers[0].style.transform, "");
  page.emit("scroll"); page.reduce(true);
  assert.equal(page.frames.size, 0);
  assert.ok(page.layers.every((layer) => layer.style.transform === "" && layer.style.opacity === ""));
  assert.ok(!page.section.classes.has("story-enabled"));
});

test("short viewports get a static layout and recover when the viewport grows", () => {
  const page = preview({ height: 580 });
  assert.ok(!page.section.classes.has("story-enabled"));
  page.browser.innerHeight = 800;
  page.emit("resize"); page.flush();
  assert.ok(page.section.classes.has("story-enabled"));
  page.browser.innerHeight = 500;
  page.emit("resize");
  assert.ok(!page.section.classes.has("story-enabled"));
  assert.equal(page.layers[0].style.transform, "");
});

test("native scroll changes the scene in both directions without an idle loop or hidden-page work", () => {
  const page = preview(); page.flush();
  const initial = page.layers[0].style.transform;
  page.browser.scrollY = 1936;
  for (let n = 0; n < 20; n++) page.emit("scroll");
  assert.equal(page.frames.size, 1);
  page.flush();
  assert.notEqual(page.layers[0].style.transform, initial);
  assert.equal(page.frames.size, 0);
  page.browser.scrollY = 1200; page.emit("scroll"); page.flush();
  assert.equal(page.layers[0].style.transform, initial);
  page.emit("scroll"); page.document.hidden = true; page.emit("visibilitychange");
  assert.equal(page.frames.size, 0);
  page.document.hidden = false; page.emit("visibilitychange"); page.flush();
  page.browser.scrollY = 0; page.emit("scroll"); page.flush();
  assert.ok(!page.section.classes.has("story-in-view"));
});
