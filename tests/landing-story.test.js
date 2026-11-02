const assert = require("node:assert/strict");
const { test } = require("node:test");
const { buildFrame, mount } = require("../public/landing-story");

test("files gather into one course before guided study, review and assignment outputs emerge", () => {
  const start = buildFrame(0), stored = buildFrame(.54), emerging = buildFrame(.72), end = buildFrame(1);
  assert.deepEqual([start.phase, stored.phase, end.phase], [0, 1, 2]);
  const centers = { slides: [15, 15], syllabus: [85, 17], problems: [15, 52], notes: [85, 54] };
  for (const [name, center] of Object.entries(centers)) {
    assert.equal(start.layers[name].opacity, 1);
    assert.notEqual(start.layers[name].rotate, 0);
    assert.equal(stored.layers[name].opacity, 0);
    assert.deepEqual([center[0] + stored.layers[name].x, center[1] + stored.layers[name].y], [50, 35]);
    assert.equal(stored.layers[`stored-${name}`].opacity, 1);
  }
  assert.equal(stored.fill, 1);
  assert.equal(stored.layers.study.opacity, 0);
  assert.ok(emerging.layers.study.opacity > 0 && emerging.layers.study.y < 0);
  assert.ok(emerging.layers.study.x > 0 && emerging.layers.assignment.x < 0);
  assert.equal(end.links, 1);
  for (const name of ["study", "review", "assignment"]) {
    assert.deepEqual(end.layers[name], { x: 0, y: 0, z: 0, rotate: 0, tilt: 0, pitch: 0, scale: 1, opacity: 1 });
  }
  const forward = [0, .2, .46, .65, 1].map((p) => buildFrame(p));
  assert.deepEqual([1, .65, .46, .2, 0].map((p) => buildFrame(p)).reverse(), forward);
});

test("scene frames stay continuous and bounded, with less depth on phones", () => {
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
  for (const boundary of [.27, .54, .56, .6, .94]) {
    const a = buildFrame(boundary - .0001), b = buildFrame(boundary + .0001);
    assert.ok(Math.abs(a.layers.slides.x - b.layers.slides.x) < .05);
    assert.ok(Math.abs(a.layers.study.opacity - b.layers.study.opacity) < .01);
  }
  const desktop = buildFrame(.2), phone = buildFrame(.2, 390);
  assert.equal(phone.layers.slides.x, desktop.layers.slides.x);
  assert.equal(phone.layers.slides.y, desktop.layers.slides.y);
  assert.ok(phone.layers.slides.z < desktop.layers.slides.z / 2);
  assert.ok(Math.abs(phone.layers.world.pitch) < Math.abs(desktop.layers.world.pitch));
  assert.ok(buildFrame(0).layers.world.tilt < 0 && buildFrame(.54).layers.world.tilt > 0);
  assert.ok(new Set(Object.values(buildFrame(0).layers).map((pose) => pose.z)).size >= 4);
  assert.notEqual(desktop.layers.slides.pitch, desktop.layers.syllabus.pitch);
  assert.ok(buildFrame(.72).layers.study.z > 60);
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
  const layers = ["world", "course", "slides", "stored-slides", "study"].map((name) => element({ storyLayer: name }));
  const steps = [element(), element(), element()];
  const section = element();
  section.querySelector = () => ({ getBoundingClientRect: () => ({ width: browser.innerWidth <= 800 ? browser.innerWidth - 36 : browser.innerWidth * .6, height: 500 }) });
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
  assert.match(initial, /rotateX\(-18\.00deg\)/);
  assert.match(initial, /rotateY\(-22\.00deg\)/);
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
