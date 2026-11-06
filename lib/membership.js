"use strict";

// Legacy invitation evidence stays with the account even if its code is deleted.
// A verified, expiring paid entitlement overlays the legacy classification.
// Effective membership determines weekly AI allowance independently of administrator permissions.
function membershipTier(user = {}, now = Date.now()) {
  if (Date.parse(user.paidMembershipExpiresAt) > now) return "plus";
  if (["standard", "plus"].includes(user.membershipTier)) return user.membershipTier;
  return String(user.inviteCode || "").trim() || String(user.inviteId || "").trim()
    ? "plus" : "standard";
}

module.exports = { membershipTier };
