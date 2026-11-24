const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { chromium } = require(process.env.OFFICE_PLAYWRIGHT_MODULE || "playwright");
const Model = require("../../public/office-model");

const root = path.resolve(__dirname, "../..");
const password = "Office-browser-test-2026!";
const routeFor = (kind) => "/api/office/office_browser_" + kind;

async function startServer(directory) {
  const child = spawn(process.execPath, ["server.js"], {
    cwd: root,
    env: {
      ...process.env,
      NODE_ENV: "test",
      PORT: "0",
      STUDYBRIDGE_DB: "local",
      LOCAL_DB_FILE: path.join(directory, "db.json"),
      LOCAL_DB_BACKUP_DISABLED: "true",
      REQUIRE_INVITE_CODE: "false",
      REQUIRE_EMAIL_VERIFICATION: "false",
      SESSION_SECRET: "isolated-office-browser-test",
      OPENAI_API_KEY: "",
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      SMTP_HOST: "",
    },
    stdio: ["ignore", "pipe", "inherit"],
  });
  try {
    const base = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("StudyBridge did not start")), 15000);
      child.once("error", reject);
      child.once("exit", code => reject(new Error("StudyBridge exited: " + code)));
      child.stdout.on("data", data => {
        const match = String(data).match(/localhost:(\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve("http://127.0.0.1:" + match[1]);
        }
      });
    });
    return { child, base };
  } catch (error) {
    child.kill();
    throw error;
  }
}

async function signUp(context, base, name) {
  const response = await context.request.post(base + "/api/auth/register", {
    data: { name, email: name.toLowerCase() + "@example.test", password, passwordConfirm: password },
  });
  assert.equal(response.status(), 201, await response.text());
  return (await response.json()).user;
}

async function enableSharing(page) {
  await page.locator('[data-office="share"]').click();
  await page.locator("[data-share-enable]").click();
  const link = page.locator("[data-share-result] input");
  await link.waitFor();
  const url = await link.inputValue();
  assert.match(new URL(url).hash, /token=[a-f0-9]{64}/);
  await page.locator("[data-share-close]").click();
  return url;
}

async function openProject(page, base, kind) {
  await page.goto(base + "/app?page=tools");
  await page.locator(`[data-tool="${kind}"]`).click();
  await page.locator(`[data-action="office-library-open"][data-id="office_browser_${kind}"]`).click();
  await page.locator('[data-office="share"]').waitFor();
}

async function expectValue(page, selector, value) {
  await page.waitForFunction(({ selector, value }) => document.querySelector(selector)?.value === value, { selector, value });
}

function gate() {
  let release;
  const wait = new Promise(resolve => { release = resolve; });
  return { wait, release };
}

async function checkSlidesOpening(page, base) {
  const courses = gate();
  const courseRoute = route => courses.wait.then(() => route.continue());
  await page.route("**/api/courses", courseRoute);
  const slideRoute = "**" + routeFor("slides");
  let failOpen = false;
  await page.route(slideRoute, async route => {
    if (failOpen && await page.locator("#officeHost").count()) {
      failOpen = false;
      return route.fulfill({ status: 503, json: { error: "Test connection interruption" } });
    }
    return route.continue();
  });
  try {
    await page.goto(base + "/app?page=tools");
    for (const kind of ["sheets", "slides", "sheets", "slides"])
      await page.locator(`[data-tool="${kind}"]`).click();
    const card = page.locator('[data-action="office-library-open"][data-id="office_browser_slides"]');
    await card.waitFor();
    await card.scrollIntoViewIfNeeded();
    const box = await card.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    courses.release();
    await page.locator("#root > .busy").waitFor({ state: "hidden" });
    await page.mouse.up();
    await expectValue(page, "[data-name]", "Collaboration slides");
    await page.locator('[data-action="office-view-library"]').click();
    await card.waitFor();
    failOpen = true;
    await card.click();
    await page.locator("#officeHost [role=alert]").waitFor();
    await page.locator("#officeHost button").click();
    await expectValue(page, "[data-name]", "Collaboration slides");
    const marks = await page.evaluate(() => performance.getEntriesByType("mark").map(entry => entry.name));
    for (const stage of ["selected", "bundle-ready", "file-settled", "mounted", "failed"])
      assert.ok(marks.includes("studybridge:office:slides:" + stage), "missing " + stage + " mark");
  } finally {
    courses.release();
    await page.unroute("**/api/courses", courseRoute);
    await page.unroute(slideRoute);
  }
  console.log("Slides: rapid tool switching, pending navigation click and retry passed");
}

async function checkHeavyCourse(page, context, base) {
  const course = await context.request.post(base + "/api/courses", { data: { name: "Performance course" } });
  assert.equal(course.status(), 201);
  const { id } = (await course.json()).course;
  const route = `/api/courses/${id}/documents`;
  const text = "Course material preview. " + "Practice problem and worked example. ".repeat(650);
  for (let index = 0; index < 24; index++) {
    const result = await context.request.post(base + route, { data: { title: "Material " + index, text } });
    assert.equal(result.status(), 201);
  }
  const full = await context.request.get(base + route);
  const list = await context.request.get(base + route + "?summary=1");
  const body = await list.body();
  const legacyBytes = (await full.body()).length;
  assert.ok(body.length < legacyBytes / 20, "expected the list to omit course material bodies");
  const delayed = gate();
  const materialRoute = request => delayed.wait.then(() => request.continue());
  const messagesRoute = request => request.fulfill({ json: { messages: Array.from({ length: 80 }, (_, i) => ({
    id: "history-" + i, content: "Course chat " + i + "\n\n" + "Previously saved response. ".repeat(50),
    role: i % 2 ? "assistant" : "user", createdAt: "2026-11-22T15:00:00Z"
  })) } });
  const materialListRoute = new RegExp(route + "[?]summary=1$");
  await page.route(materialListRoute, materialRoute);
  const history = new RegExp("/api/courses/" + id + "/messages");
  await page.route(history, messagesRoute);
  try {
    await page.goto(base + "/app?page=study");
    await page.locator(`[data-action="select-course"][data-id="${id}"]`).click();
    const chat = page.locator(".study-workspace .chat-area");
    await chat.getByText(/Course chat 79/).waitFor();
    const input = page.locator("#chatInput");
    await input.fill("Draft while materials load");
    const scroll = await chat.evaluate(node => { node.scrollTop = 180; return node.scrollTop; });
    assert.ok(scroll > 0);
    delayed.release();
    await page.locator(".study-material-open").first().waitFor();
    assert.equal(await input.inputValue(), "Draft while materials load");
    assert.equal(await input.evaluate(node => node === document.activeElement), true);
    assert.equal(await chat.evaluate(node => node.scrollTop), scroll);
    const requested = page.waitForRequest(request => new URL(request.url()).pathname.startsWith(route + "/"));
    await page.locator(".study-material-open").filter({ has: page.getByText("Material 0", { exact: true }) }).click();
    await requested;
    await page.locator(".study-source-dialog .study-source-excerpt").filter({ hasText: "Course material preview" }).waitFor();
    await page.keyboard.press("Escape");
    await page.locator(".study-source-dialog").waitFor({ state: "hidden" });
    assert.equal(await input.inputValue(), "Draft while materials load");
  } finally {
    delayed.release();
    await page.unroute(materialListRoute, materialRoute);
    await page.unroute(history, messagesRoute);
  }
  console.log(`Study: 24 materials and 80 messages preserved typing, focus and scrolling (list ${body.length} B, old ${legacyBytes} B)`);
}

async function checkProfileStartup(page, context, base) {
  const previous = (await (await context.request.get(base + "/api/me")).json()).user;
  const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=", "base64");
  const saved = await context.request.put(base + "/api/me/profile?view=workspace", { data: {
    ...previous.profile, name: previous.name, backgroundUrl: "", avatarUrl:
      "data:image/png;base64," + Buffer.concat([image, Buffer.alloc(264600)]).toString("base64")
  } });
  assert.equal(saved.status(), 200, await saved.text());
  const avatarURL = base + (await saved.json()).user.profile.avatarUrl;
  const avatar = gate();
  const blocked = gate();
  const intercept = route => {
    blocked.release();
    return avatar.wait.then(() => route.continue());
  };
  await page.route(avatarURL, intercept);
  try {
    const response = page.waitForResponse(result => result.url() === base + "/api/me?view=workspace");
    await page.goto(base + "/app?page=grades", { waitUntil: "domcontentloaded" });
    const startup = await response;
    assert.equal(startup.status(), 200);
    const lightBytes = (await startup.body()).length;
    const fullBytes = (await (await context.request.get(base + "/api/me")).body()).length;
    assert.ok(lightBytes < fullBytes / 100);
    await Promise.race([blocked.wait, new Promise((_, reject) => {
      const timer = setTimeout(() => reject(new Error("Avatar was not requested")), 10000);
      blocked.wait.then(() => clearTimeout(timer));
    })]);
    await page.getByRole("heading", { name: /^(成绩规划|Grade planner)$/ }).waitFor();
    assert.ok(await page.locator(".profile-card .cover b").isVisible());
    assert.equal(await page.locator(".profile-card img[data-profile-avatar-loaded]").count(), 0);
    avatar.release();
    await page.locator(".profile-card img[data-profile-avatar-loaded]").waitFor();
    await page.locator("button.profile-card").click();
    await page.locator("#profileName").fill("Owner updated");
    const profileResponse = page.waitForResponse(result => result.url() === base + "/api/me/profile?view=workspace" && result.request().method() === "PUT");
    await page.locator('[data-action="save-profile"]').click();
    const edited = await profileResponse;
    assert.equal(edited.status(), 200);
    assert.ok(!Object.hasOwn(edited.request().postDataJSON(), "avatarUrl"));
    assert.equal(base + (await edited.json()).user.profile.avatarUrl, avatarURL);
    await expectValue(page, "#profileName", "Owner updated");
    console.log(`Startup: Grades visible while avatar blocked; session ${lightBytes} B vs ${fullBytes} B; profile text save retained avatar`);
  } finally {
    avatar.release();
    await page.unroute(avatarURL, intercept);
  }
}

async function checkMobileNavigation(browser, base) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    await signUp(context, base, "Navigation");
    const page = await context.newPage();
    await page.goto(base + "/app");
    const study = page.locator('.sidebar [data-page="study"]');
    const shell = page.locator(".app-shell");
    const workspace = page.locator(".study-workspace");
    const draft = page.locator("#chatInput");
    const back = page.locator('.mobile-page-bar [data-mobile-action="menu"]');
    const menuUrl = url => url.pathname === "/app" && !url.searchParams.has("page");
    await study.tap();
    await draft.waitFor();
    await page.locator(".course-chat-status").waitFor({ state: "hidden" });
    await draft.fill("Draft survives mobile back");
    const input = await draft.elementHandle();
    await shell.evaluate(node => {
      window.studyViewChanges = [];
      new MutationObserver(entries => {
        for (const entry of entries) if (entry.oldValue !== node.dataset.mobileView) window.studyViewChanges.push(node.dataset.mobileView);
      }).observe(node, { attributes: true, attributeOldValue: true, attributeFilter: ["data-mobile-view"] });
    });
    await back.tap();
    await page.waitForURL(menuUrl);
    await study.waitFor();
    assert.deepEqual(await page.evaluate(() => window.studyViewChanges), ["menu"]);
    assert.equal(await workspace.evaluate(node => getComputedStyle(node).transitionDuration), "0s");
    assert.equal(await workspace.evaluate(node => node.inert), true);
    await page.evaluate(() => history.forward());
    await draft.waitFor();
    assert.equal(await input.evaluate(node => node === document.querySelector("#chatInput")), true);
    assert.equal(await draft.inputValue(), "Draft survives mobile back");
    const touch = await context.newCDPSession(page);
    const chat = workspace.locator(".chat-area");
    for (const direction of [-1, 1]) {
      const bounds = await chat.boundingBox();
      const y = Math.round(bounds.y + bounds.height / 2);
      const x = direction === -1 ? 350 : 40;
      await touch.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
      for (const offset of [26, 58, 105]) {
        await touch.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: x + offset * direction, y }] });
      }
      await touch.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
      await page.waitForURL(menuUrl, { timeout: 5000 });
      await study.tap();
      await draft.waitFor();
      assert.equal(await input.evaluate(node => node === document.querySelector("#chatInput")), true);
      assert.equal(await draft.inputValue(), "Draft survives mobile back");
    }
    await page.goBack();
    await page.waitForURL(menuUrl);
    assert.deepEqual(await page.evaluate(() => window.studyViewChanges),
      ["menu", "page", "menu", "page", "menu", "page", "menu"]);

    await page.locator('.sidebar [data-action="settings"]').tap();
    const logout = page.locator(".settings-logout");
    const status = page.locator(".settings-logout-status");
    const slow = gate();
    const retry = route => slow.wait.then(() => route.fulfill({ status: 503, json: { error: "Test connection interruption" } }));
    await page.route("**/api/auth/logout", retry);
    try {
      await logout.tap();
      await status.waitFor();
      assert.equal(await logout.isEnabled(), false);
      slow.release();
      await page.locator(".settings-logout-status.is-error").waitFor();
      assert.equal(await logout.isEnabled(), true);
      assert.equal(await draft.inputValue(), "Draft survives mobile back");
    } finally {
      slow.release();
      await page.unroute("**/api/auth/logout", retry);
    }
    await logout.tap();
    await page.waitForURL(url => url.pathname === "/login");
    console.log("Mobile Study: button, both swipe directions, browser history, retained draft and sign-out retry passed");
  } finally {
    await context.close();
  }
}

async function main() {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "sb-office-browser-"));
  const { child, base } = await startServer(directory);
  let browser;
  try {
    browser = await chromium.launch({ executablePath: process.env.OFFICE_CHROMIUM || undefined });
    const owner = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
    const guest = await browser.newContext({ viewport: { width: 1360, height: 1000 } });
    const ownerUser = await signUp(owner, base, "Owner");
    await signUp(guest, base, "Guest");
    await guest.clearCookies();
    const first = await owner.newPage();
    const second = await guest.newPage();
    const errors = [];
    for (const page of [first, second]) page.on("pageerror", error => errors.push(error.message));

    for (const kind of ["docs", "sheets", "slides"]) {
      const model = Model.fresh(kind);
      if (kind === "sheets") {
        model.sheets[0].rows = 1000;
        model.sheets[0].cols = 100;
      }
      const saved = await owner.request.put(base + routeFor(kind), {
        data: { ownerId: ownerUser.id, kind, name: "Collaboration " + kind, version: 0, model },
      });
      assert.equal(saved.status(), 200, await saved.text());
      await openProject(first, base, kind);
      const name = first.locator("[data-name]");
      await name.click();
      assert.notEqual(await name.evaluate(node => getComputedStyle(node).outlineWidth), "2px");
      const url = await enableSharing(first);
      await second.goto(url);
      if (kind === "docs") {
        await second.locator("#authEmail").fill("guest@example.test");
        await second.locator("#authPassword").fill(password);
        await second.locator('[data-action="login"]').click();
      }
      await second.locator('[data-office="share"]').waitFor();
      assert.equal(new URL(second.url()).hash, new URL(url).hash);

      if (kind === "docs") {
        const body = '[data-doc-editor] [contenteditable="true"]';
        await Promise.all([
          first.locator(body).pressSequentially("Owner text "),
          second.locator(body).pressSequentially("Guest text "),
        ]);
        for (const page of [first, second]) {
          await page.waitForFunction(selector => {
            const text = document.querySelector(selector)?.textContent || "";
            return text.includes("Owner text") && text.includes("Guest text");
          }, body);
        }
        await first.setViewportSize({ width: 390, height: 844 });
        await first.locator(".office-toolbar .office-menu summary").click();
        await first.locator('[data-office="table-insert"]').click();
        await first.setViewportSize({ width: 1360, height: 1000 });
        await second.locator(".tiptap table td").first().waitFor();
        assert.equal(await second.locator(".tiptap table td").count(), 9);
        await second.reload();
        await second.locator(".tiptap table td").first().waitFor();
        assert.match(await second.locator(body).innerText(), /Guest text/);
      } else if (kind === "sheets") {
        assert(await first.locator("[data-cell]").count() <= 6000);
        const address = await first.locator("[data-range-address]").boundingBox();
        const formula = await first.locator("[data-formula]").boundingBox();
        assert.ok(address.x + address.width < formula.x, "Range and formula inputs must not overlap");
        await Promise.all([
          first.locator('[data-cell="A1"]').fill("31"),
          second.locator('[data-cell="B1"]').fill("42"),
        ]);
        await Promise.all([
          first.locator('[data-cell="A1"]').press("Enter"),
          second.locator('[data-cell="B1"]').press("Enter"),
        ]);
        await expectValue(first, '[data-cell="B1"]', "42");
        await expectValue(second, '[data-cell="A1"]', "31");
        await first.locator(".office-grid-scroll").evaluate(node => { node.scrollTop = node.scrollHeight; });
        await first.locator('[data-cell="A1000"]').waitFor({ state: "attached" });
        assert(await first.locator("[data-cell]").count() <= 6000);
      } else {
        const elementText = "[data-stage] [data-element-text]";
        await first.locator(elementText).first().dblclick();
        await first.locator(elementText).first().fill("Shared title");
        await first.locator("[data-name]").click();
        await second.waitForFunction(selector => document.querySelector(selector)?.textContent === "Shared title", elementText);
        await second.locator("[data-notes]").fill("Shared notes");
        await expectValue(first, "[data-notes]", "Shared notes");
      }

      const privateResponse = await guest.request.get(base + routeFor(kind));
      assert.equal(privateResponse.status(), 404);
      await first.locator('[data-office="share"]').click();
      await first.locator("[data-share-disable]").click();
      await first.waitForFunction(() => !document.querySelector("[data-share-result] input"));
      await first.locator("[data-share-close]").click();
      const revoked = await guest.request.post(base + routeFor(kind) + "/sync", {
        data: {
          actorId: (await (await guest.request.get(base + "/api/me")).json()).user.id,
          ownerId: ownerUser.id,
          token: new URLSearchParams(new URL(url).hash.slice(1)).get("token"),
          since: 0,
          initial: true,
          peer: "revoked-test",
        },
      });
      assert.equal(revoked.status(), 403);
      console.log(kind + ": two browser sessions, persisted edits and share revocation passed");
    }
    await checkSlidesOpening(first, base);
    await checkHeavyCourse(first, owner, base);
    await checkProfileStartup(first, owner, base);
    await checkMobileNavigation(browser, base);
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    const exited = once(child, "exit");
    child.kill();
    await exited;
    await fs.rm(directory, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
