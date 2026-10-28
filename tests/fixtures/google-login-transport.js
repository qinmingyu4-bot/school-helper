// Only used by isolated tests. No real Google credentials or network requests.
const originalFetch = global.fetch;
global.fetch = async (input, options = {}) => {
  if (String(input) === "https://oauth2.googleapis.com/token") {
    const body = new URLSearchParams(options.body);
    if (!/^[A-Za-z0-9_-]{43}$/.test(body.get("code_verifier") || "")) {
      return new Response(JSON.stringify({ error_description: "Missing PKCE verifier" }), { status: 400 });
    }
    return Response.json({ access_token: body.get("code") });
  }
  if (String(input) === "https://www.googleapis.com/oauth2/v3/userinfo") {
    const code = String(options.headers.authorization).replace("Bearer ", "");
    const profile = { sub: code === "different-account" ? "other-sub" : "fixture-sub", email: code === "new-account" ? "new-google@example.test" : "google-owner@example.test", email_verified: true, name: "Google fixture" };
    if (code === "unverified") profile.email_verified = false;
    if (code === "missing-verification") delete profile.email_verified;
    if (code === "missing-sub") delete profile.sub;
    return Response.json(profile);
  }
  return originalFetch(input, options);
};
