(() => {
  const VERSION = "20261008-invite-role-submit-guard-1.0.92";
  if (window.__studybridgeInviteRoleSubmitGuardVersion === VERSION) return;
  window.__studybridgeInviteRoleSubmitGuardVersion = VERSION;

  const originalFetch = window.fetch?.bind(window);
  if (!originalFetch) return;

  function normalizeRole(value) {
    const role = String(value || "").trim().toLowerCase();
    if (role === "admin" || role === "co-admin" || role === "coadmin") return "co-admin";
    return "student";
  }

  function markAdminLabel(label, role) {
    const text = String(label || "Friend invite").trim().slice(0, 80);
    if (normalizeRole(role) !== "co-admin") return text.replace(/^\[co-admin\]\s*/i, "") || "Friend invite";
    return /^\[co-admin\]/i.test(text) ? text : `[co-admin] ${text || "Co-admin invite"}`.slice(0, 80);
  }

  function normalizeInviteBody(body) {
    if (!body || typeof body !== "object" || Array.isArray(body)) return body;
    const role = normalizeRole(body.role);
    return {
      ...body,
      role,
      label: markAdminLabel(body.label, role)
    };
  }

  window.fetch = function patchedFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init?.method || "").toUpperCase();
    if (url.includes("/api/admin/invites") && method === "POST" && init?.body) {
      try {
        if (typeof init.body === "string") {
          init = { ...init, body: JSON.stringify(normalizeInviteBody(JSON.parse(init.body))) };
        } else if (init.body && typeof init.body === "object" && !(init.body instanceof FormData)) {
          init = { ...init, body: normalizeInviteBody(init.body) };
        }
      } catch {
        // Keep the original request if it is not JSON.
      }
    }
    return originalFetch(input, init);
  };
})();
