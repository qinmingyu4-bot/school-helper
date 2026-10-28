// Isolated OAuth transport for page-entry regression tests; never contacts Google.
const originalFetch = global.fetch;
global.fetch = async function (input, options) {
  const url = String(input);
  if (url === "https://oauth2.googleapis.com/token") {
    return new Response(JSON.stringify({ access_token: "page-entry-fixture-token" }), { status: 200 });
  }
  if (url === "https://www.googleapis.com/oauth2/v3/userinfo") {
    return new Response(JSON.stringify({ sub: "page-entry-fixture", email: "google-entry@example.test", email_verified: true, name: "Google entry" }), { status: 200 });
  }
  return originalFetch(input, options);
};
