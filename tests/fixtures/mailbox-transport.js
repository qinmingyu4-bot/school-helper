"use strict";
if (process.env.NODE_ENV !== "test") throw new Error("Mailbox fixture is test-only.");
const original = global.fetch;
const gmailScope = "https://www.googleapis.com/auth/gmail.readonly";
global.fetch = async (input, options = {}) => {
  const url = new URL(String(input));
  if (url.hostname === "oauth2.googleapis.com" || url.hostname === "login.microsoftonline.com") {
    const form = new URLSearchParams(options.body);
    if (form.get("code") === "bad") return Response.json({ error: "invalid_grant" }, { status: 400 });
    return Response.json({ access_token: "fixture-private-access", refresh_token: "fixture-private-refresh", expires_in: 3600,
      scope: url.hostname === "oauth2.googleapis.com" ? gmailScope : "Mail.Read User.Read" });
  }
  if (url.hostname === "gmail.googleapis.com") {
    if (url.pathname.endsWith("/profile")) return Response.json({ emailAddress: "linked-gmail@example.test", historyId: "100" });
    if (url.pathname.endsWith("/history")) return Response.json({ historyId: "102", history: [] });
    if (url.pathname.endsWith("/messages")) return Response.json({ messages: [{ id: "academic" }, { id: "advert" }, { id: "date-only" }] });
    const id = url.pathname.split("/").at(-1);
    return Response.json({ id, labelIds: ["INBOX"], internalDate: String(Date.now()), payload: { mimeType: "text/plain", headers: [
      { name: "Subject", value: id === "advert" ? "Shop sale" : id === "date-only" ? "MAT135 office hours" : "STA437 assignment" }, { name: "From", value: "Professor <prof@university.test>" }
    ], body: { data: Buffer.from(id === "advert" ? "Buy now sale" : id === "date-only" ? "Office hours November 15, 2026. Time to follow." : "Assignment due November 16, 2026 at 18:00 Toronto time.").toString("base64url") } } });
  }
  if (url.hostname === "graph.microsoft.com") {
    if (url.pathname === "/v1.0/me") return Response.json({ id: "fixture-outlook", mail: "linked-outlook@example.test" });
    if (url.pathname.endsWith("/delta")) return Response.json({ value: url.searchParams.has("$deltatoken") ? [] : [{ id: "officehours" }], "@odata.deltaLink": "https://graph.microsoft.com/v1.0/me/mailFolders/inbox/messages/delta?$deltatoken=fixture" });
    return Response.json({ id: "officehours", subject: "Professor office hours", from: { emailAddress: { name: "Professor", address: "prof@university.test" } }, receivedDateTime: new Date().toISOString(),
      body: { contentType: "text", content: "Office hours November 17, 2026 at 14:00 Toronto time." }, webLink: "https://outlook.office.com/mail/inbox/id/officehours" });
  }
  if (url.hostname === "api.openai.com" && url.pathname === "/v1/chat/completions") {
    const body = JSON.parse(options.body), source = JSON.parse(body.messages[1].content);
    const relevant = !source.body.includes("Buy now"), dateOnly = source.body.includes("Time to follow");
    const content = JSON.stringify({ relevant, summary: relevant ? "教授发来学习安排，请核对时间。" : "促销", items: !relevant ? [] : [{ kind: source.subject.includes("STA437") ? "DDL" : "EVENT", title: source.subject, course: source.subject.includes("STA437") ? "STA437" : "MAT135", startsAt: dateOnly ? "" : source.subject.includes("STA437") ? "2026-11-16T18:00" : "2026-11-17T14:00", date: dateOnly ? "2026-11-15" : "", evidence: source.body, warning: dateOnly ? "请补充具体时间。" : "" }] });
    return Response.json({ choices: [{ message: { content } }] });
  }
  if (["localhost", "127.0.0.1"].includes(url.hostname)) return original(input, options);
  throw new Error(`Unexpected mailbox fixture host: ${url.hostname}`);
};
