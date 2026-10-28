"use strict";

// Legacy invitation evidence stays with the account even if its code is deleted.
// Membership is independent of administrator permissions and has no feature gates yet.
function membershipTier(user = {}) {
  if (["standard", "plus"].includes(user.membershipTier)) return user.membershipTier;
  return String(user.inviteCode || "").trim() || String(user.inviteId || "").trim()
    ? "plus" : "standard";
}

module.exports = { membershipTier };
