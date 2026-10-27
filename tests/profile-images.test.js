const assert = require("node:assert/strict");
const { test } = require("node:test");
const { dimensions, prepareImage, readInput, maxSourceBytes, limits } = require("../public/profile-images");

function environment(sizes = [70000], decodeFailure = false) {
  const log = { draws: [], revoked: [], qualities: [] };
  const canvas = { width: 0, height: 0,
    getContext: () => ({ fillRect() {}, drawImage: (...args) => log.draws.push(args.slice(1)) }),
    toBlob(callback, type, quality) {
      log.qualities.push(quality);
      const size = sizes.length > 1 ? sizes.shift() : sizes[0];
      callback(size === null ? null : new Blob([Buffer.alloc(size)], { type }));
    } };
  class Picture {
    naturalWidth = 4032;
    naturalHeight = 3024;
    set src(value) { queueMicrotask(() => decodeFailure ? this.onerror() : this.onload()); }
  }
  class Reader {
    async readAsDataURL(blob) { this.result = `data:${blob.type};base64,${Buffer.from(await blob.arrayBuffer()).toString("base64")}`; this.onload(); }
  }
  return { log, canvas, api: { Image: Picture, FileReader: Reader, document: { createElement: () => canvas },
    URL: { createObjectURL: () => "blob:test-photo", revokeObjectURL: (url) => log.revoked.push(url) } } };
}

test("profile dimensions preserve orientation/aspect ratio, never enlarge and reject invalid/decode-sized inputs", () => {
  assert.deepEqual(dimensions(4032, 3024, 512), { width: 512, height: 384 });
  assert.deepEqual(dimensions(3024, 4032, 512), { width: 384, height: 512 });
  assert.deepEqual(dimensions(100, 80, 512), { width: 100, height: 80 });
  assert.throws(() => dimensions(0, 100, 512));
  assert.throws(() => dimensions(10000, 10000, 512));
});

test("photos above the old 2 MiB cap are resized, compressed and bounded before upload", async () => {
  const { api, log, canvas } = environment([200000, 120000, 70000]);
  const result = await prepareImage({ name: "phone.jpg", type: "image/jpeg", size: 8 * 1024 * 1024 }, "avatar", api);
  assert.equal(Buffer.from(result.split(",")[1], "base64").length, 70000);
  assert.equal(canvas.width, 512);
  assert.equal(canvas.height, 384);
  assert.deepEqual(log.qualities, [0.88, 0.74, 0.6]);
  assert.deepEqual(log.revoked, ["blob:test-photo"]);
  assert.ok(result.length + Math.ceil(limits.cover.bytes / 3) * 4 + 5000 < 400000);
});

test("difficult photos are reduced further and covers have an independent size budget", async () => {
  const avatar = environment([300000, 300000, 300000, 50000]);
  await prepareImage({ name: "noise.png", type: "image/png", size: 5000000 }, "avatar", avatar.api);
  assert.equal(avatar.canvas.width, 384);
  assert.equal(avatar.canvas.height, 288);
  const cover = environment([120000]);
  await prepareImage({ name: "cover.webp", type: "image/webp", size: 5000000 }, "cover", cover.api);
  assert.equal(cover.canvas.width, 1600);
  assert.equal(cover.canvas.height, 1200);
});

test("empty, unsupported and oversized files fail clearly while absent replacements preserve saved images", async () => {
  assert.equal(await readInput(null, "saved-avatar"), "saved-avatar");
  await assert.rejects(prepareImage({ name: "empty.jpg", type: "image/jpeg", size: 0 }), /为空/);
  await assert.rejects(prepareImage({ name: "notes.txt", type: "text/plain", size: 20 }), /照片/);
  await assert.rejects(prepareImage({ name: "huge.jpg", type: "image/jpeg", size: maxSourceBytes + 1 }), /25 MB/);
  const broken = environment([], true);
  await assert.rejects(prepareImage({ name: "photo.heic", type: "image/heic", size: 100 }, "avatar", broken.api), /HEIC/);
  assert.deepEqual(broken.log.revoked, ["blob:test-photo"]);
  const failed = environment([null]);
  await assert.rejects(prepareImage({ name: "photo.png", type: "image/png", size: 100 }, "avatar", failed.api), /压缩失败/);
  assert.deepEqual(failed.log.revoked, ["blob:test-photo"]);
});
