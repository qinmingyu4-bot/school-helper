// Isolated Plus/open-registration tests only; no real credentials or Google requests.
const originalFetch = global.fetch;
global.fetch = async (input, options = {}) => {
  if (String(input) === "https://oauth2.googleapis.com/token") {
    const body = new URLSearchParams(options.body);
    if (!/^[A-Za-z0-9_-]{43}$/.test(body.get("code_verifier") || "")) return Response.json({ error: "fixture-pkce-required" }, { status: 400 });
    return Response.json({ access_token: body.get("code") });
  }
  if (String(input) === "https://www.googleapis.com/oauth2/v3/userinfo") {
    const code = options.headers.authorization.replace("Bearer ", "");
    return Response.json({ sub: `google-${code}`, email: `${code}@example.test`, email_verified: code !== "unverified", name: `Google ${code}` });
  }
  return originalFetch(input, options);
};
