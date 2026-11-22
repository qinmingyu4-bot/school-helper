const { createHash } = require("node:crypto");
const { publicUser } = require("./security");

const fields = { avatar: "avatarUrl", cover: "backgroundUrl" };
const dataImage = /^data:(image\/(?:jpeg|jpg|png|webp|gif|avif|bmp|x-icon|vnd\.microsoft\.icon));base64,([A-Za-z\d+/]+={0,2})$/i;

function embeddedImage(user, kind) {
  const value = user.profile?.[fields[kind]];
  const match = typeof value === "string" && value.match(dataImage);
  if (!match || match[2].length % 4 === 1) return null;
  const type = match[1].toLowerCase().replace(/^image\/jpg$/, "image/jpeg");
  const version = createHash("sha256").update(JSON.stringify([user.id, kind, type])).update(match[2]).digest("hex").slice(0, 24);
  return { type, version, base64: match[2] };
}

function workspaceUser(user) {
  const result = publicUser(user);
  const profile = { ...result.profile };
  for (const [kind, field] of Object.entries(fields)) {
    if (typeof profile[field] !== "string" || !/^data:/i.test(profile[field])) continue;
    const image = embeddedImage(user, kind);
    profile[field] = image ? `/api/me/profile-images/${kind}/${image.version}` : "";
  }
  return { ...result, profile };
}

module.exports = { embeddedImage, workspaceUser };
