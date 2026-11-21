const { normalizeEmail } = require("./security");

function inviteRole({ role, label } = {}) {
  const requested = String(role || "").trim().toLowerCase();
  if (["admin", "co-admin", "coadmin"].includes(requested)) return "co-admin";
  if (!requested && /^\s*\[co-admin\]/i.test(String(label || ""))) return "co-admin";
  return "student";
}

function effectiveRole(user, creatorEmails) {
  if (creatorEmails.includes(normalizeEmail(user.email))) return "admin";
  // Invitations previously stored both the creator and Co-admin as "admin".
  return inviteRole({ role: user.role });
}

module.exports = { effectiveRole, inviteRole };
