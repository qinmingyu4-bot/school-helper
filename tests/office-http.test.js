const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { once } = require("node:events");
const M = require("../public/office-model");
test(
  "office HTTP APIs authenticate, isolate projects, protect versions, export native files and preview AI changes",
  { timeout: 20000 },
  async (t) => {
    const directory = await fs.mkdtemp(
      path.join(os.tmpdir(), "studybridge-office-http-"),
    );
    const child = spawn(
      process.execPath,
      ["--require", "./tests/fixtures/office-ai.js", "server.js"],
      {
        cwd: path.resolve(__dirname, ".."),
        env: {
          ...process.env,
          PORT: "0",
          NODE_ENV: "test",
          STUDYBRIDGE_DB: "local",
          LOCAL_DB_FILE: path.join(directory, "db.json"),
          LOCAL_DB_BACKUP_DISABLED: "true",
          OWNER_INVITE_CODE: "office-owner",
          REQUIRE_INVITE_CODE: "true",
          REQUIRE_EMAIL_VERIFICATION: "false",
          OPENAI_API_KEY: "test-office-key",
          OPENAI_WEB_SEARCH: "false",
          ADMIN_EMAILS: "owner@example.test",
          GOOGLE_CLIENT_ID: "",
          GOOGLE_CLIENT_SECRET: "",
          SMTP_HOST: "",
          SMTP_USER: "",
          SMTP_PASS: "",
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    child.stderr.on("data", (chunk) => t.diagnostic(String(chunk)));
    t.after(async () => {
      const exited = once(child, "exit");
      child.kill();
      await exited;
      assert(
        path
          .resolve(directory)
          .startsWith(path.resolve(os.tmpdir()) + path.sep),
      );
      await fs.rm(directory, { recursive: true, force: true });
    });
    const base = await new Promise((resolve, reject) => {
      let output = "";
      const timeout = setTimeout(
        () => reject(Error("Startup timed out")),
        10000,
      );
      child.stdout.on("data", (chunk) => {
        output += chunk;
        const match = output.match(/http:\/\/localhost:(\d+)/);
        if (match) {
          clearTimeout(timeout);
          resolve("http://127.0.0.1:" + match[1]);
        }
      });
      child.on("error", reject);
    });
    const request = (route, { method = "GET", cookie = "", body } = {}) =>
      fetch(base + route, {
        method,
        headers: { cookie, "content-type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    const register = (email, inviteCode) => ({
      name: email,
      email,
      inviteCode,
      password: "Office-Test-Password1!",
      passwordConfirm: "Office-Test-Password1!",
    });
    assert.equal((await request("/api/office")).status, 401);
    assert.equal(
      (
        await request("/api/office/export", {
          method: "POST",
          body: { kind: "docs", model: M.fresh("docs") },
        })
      ).status,
      401,
    );
    const alice = await request("/api/auth/register", {
      method: "POST",
      body: register("owner@example.test", "office-owner"),
    });
    const cookie = alice.headers.get("set-cookie").split(";")[0],
      user = (await alice.json()).user;
    const invite = await (
      await request("/api/admin/invites", {
        method: "POST",
        cookie,
        body: { label: "Office Bob" },
      })
    ).json();
    const bob = await request("/api/auth/register", {
        method: "POST",
        body: register("bob@example.test", invite.invite.code),
      }),
      foreign = bob.headers.get("set-cookie").split(";")[0];
    for (const kind of M.kinds) {
      const id = "office_http-" + kind,
        model = M.fresh(kind);
      const body = {
        ownerId: user.id,
        kind,
        name: "My " + kind,
        version: 0,
        model,
      };
      const response = await request("/api/office/" + id, {
        method: "PUT",
        cookie,
        body,
      });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).project.version, 1);
      assert.equal(
        (await request("/api/office/" + id, { cookie: foreign })).status,
        404,
      );
      assert.equal(
        (await request("/api/office/" + id, { method: "PUT", cookie, body }))
          .status,
        409,
      );
      assert.equal(
        (
          await request("/api/office/" + id, {
            method: "PUT",
            cookie: foreign,
            body,
          })
        ).status,
        403,
      );
      const file = await request("/api/office/export", {
        method: "POST",
        cookie,
        body,
      });
      assert.equal(file.status, 200);
      assert.match(file.headers.get("content-disposition"), /^attachment/);
      assert.equal(
        Buffer.from(await file.arrayBuffer()).toString("ascii", 0, 2),
        "PK",
      );
      const suggestion = await request("/api/office/assist", {
        method: "POST",
        cookie,
        body: {
          ownerId: user.id,
          kind,
          prompt: "Please help with this work",
          context: "User material",
        },
      });
      assert.equal(suggestion.status, 200);
      const result = await suggestion.json();
      assert(kind === "slides" ? result.slides[0].title : result.text);
      const saved = await (
        await request("/api/office/" + id, { cookie })
      ).json();
      assert.deepEqual(
        saved.project.model,
        M.normalize(kind, model),
        "AI suggestions must not overwrite the saved project",
      );
    }
    assert.equal(
      (await (await request("/api/office", { cookie: foreign })).json())
        .projects.length,
      0,
    );
    const bad = M.fresh("docs");
    bad.content.content = [
      { type: "image", attrs: { src: "javascript:alert(1)" } },
    ];
    assert.equal(
      (
        await request("/api/office/office_bad", {
          method: "PUT",
          cookie,
          body: { kind: "docs", version: 0, model: bad },
        })
      ).status,
      400,
    );
  },
);
