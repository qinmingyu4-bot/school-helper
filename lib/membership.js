"use strict";

// Legacy invitation evidence stays with the account even if its code is deleted.
// A verified, expiring paid entitlement overlays the legacy classification.
// Membership remains independent of administrator permissions; quotas are not feature-gated yet.
function membershipTier(user = {}, now = Date.now()) {
  if (Date.parse(user.paidMembershipExpiresAt) > now) return "plus";
  if (["standard", "plus"].includes(user.membershipTier)) return user.membershipTier;
  return String(user.inviteCode || "").trim() || String(user.inviteId || "").trim()
    ? "plus" : "standard";
}

module.exports = { membershipTier };
