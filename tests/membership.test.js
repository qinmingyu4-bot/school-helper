const assert = require("node:assert/strict");
const { test } = require("node:test");
const { membershipTier } = require("../lib/membership");
const { publicUser } = require("../lib/security");
const { StudyBridgeDatabase } = require("../lib/database");
const { memoryDynamo } = require("./helpers/community-dynamo");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawn } = require("node:child_process");
const { once } = require("node:events");

test("historical invitation evidence classifies Plus without changing records or admin permissions", () => {
  for (const evidence of [{ inviteCode: "DELETED-CODE" }, { inviteId: "legacy-deleted-invite" }, { membershipTier: "plus" }]) {
    const user = { id: "legacy", email: "legacy@example.test", role: "student", passwordHash: "private-hash", googleSub: "private-sub", profile: { sbId: "1" }, ...evidence };
    const before = JSON.stringify(user), value = publicUser(user);
    assert.equal(membershipTier(user), "plus"); assert.equal(value.membershipTier, "plus");
    assert.equal(value.role, "student"); assert.equal(value.profile.sbId, "1");
    assert.ok(!JSON.stringify(value).includes("private-")); assert.equal(JSON.stringify(user), before);
  }
  assert.equal(membershipTier({}), "standard");
  assert.equal(membershipTier({ inviteCode: "  ", membershipTier: "untrusted" }), "standard");
  assert.equal(membershipTier({ role: "admin" }), "standard", "Admin permission is independent of membership");
  assert.equal(publicUser({ id: "admin", role: "admin", inviteCode: "OLD" }).role, "admin");
});

for (const mode of ["local", "dynamodb"]) test(`${mode}: new membership is server-owned and invitation-free creation preserves email uniqueness`, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-membership-store-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase();db.local.file = path.join(directory, "db.json");
  const cloud = mode === "dynamodb" ? memoryDynamo() : null;db.dynamo = cloud?.store || null;
  if (cloud) cloud.store.scanType = async (type) => [...cloud.rows.values()].filter(row => row.type.S === type).map(row => JSON.parse(row.data.S));
  const plain = await db.createUser({ id: "ordinary", email: "plain@example.test", membershipTier: "plus" });
  assert.equal(plain.membershipTier, "standard");
  const invite = await db.createInvite({ id: "plus-invite", code: "PLUS-CODE", active: true, uses: 0 });
  const plus = await db.createUser({ id: "invited", email: "plus@example.test", inviteCode: invite.code, inviteId: invite.id }, invite);
  assert.equal(plus.membershipTier, "plus");assert.equal((await db.findInviteByCode(invite.code)).uses, 1);
  const races = await Promise.allSettled(["a", "b"].map(id => db.createUser({ id, email: "same@example.test" })));
  assert.equal(races.filter(x => x.status === "fulfilled").length, 1);
  assert.equal(races.find(x => x.status === "rejected").reason.statusCode, 409);
  assert.equal((await db.listUsers()).filter(x => x.email === "same@example.test").length, 1);
  assert.equal((await db.findUserByEmail("same@example.test")).id, races.find(x => x.status === "fulfilled").value.id);
  if (cloud) {
    await db.findUserByEmail("same@example.test", { consistent: true });
    assert.ok(cloud.calls.slice(-2).every(call => call.target === "GetItem" && call.body.ConsistentRead === true), "Concurrent Google recovery must see both email ownership and the fresh account");
  }
  const unused = await db.createInvite({ id: "unused-plus", code: "UNUSED-PLUS", active: true, uses: 0 });
  await assert.rejects(db.createUser({ id: "duplicate-invited", email: plain.email, inviteCode: unused.code }, unused));
  assert.equal((await db.findInviteByCode(unused.code)).uses, 0, "A duplicate email must not consume the Plus code");
  assert.equal(await db.getUser("duplicate-invited"), null, "A rejected signup must not leave a ghost account");
  await db.deleteInvite(invite.id);
  assert.equal(publicUser(await db.getUser(plus.id)).membershipTier, "plus");
});

test("email and Google registrations assign standard/Plus, preserve old users, and reject invalid or reused codes", { timeout: 30000 }, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-open-plus-http-"));
  const secret = "isolated-membership-session";
  const oldToken = "fixture-only-legacy-plus-session", oldId = "legacy-invited";
  const tokenHash = crypto.createHmac("sha256", secret).update(oldToken).digest("hex");
  const file = path.join(directory, "database.json");
  const legacy = { id: oldId, email: "legacy@example.test", name: "Legacy invited", passwordHash: "unchanged-private-hash", googleSub: "unchanged-sub", inviteCode: "DELETED-OLD-CODE", profile: { sbId: "Legacy01" }, preferences: { customInstruction: "Keep" } };
  await fs.writeFile(file, JSON.stringify({ users: { [oldId]: legacy }, emailIndex: { [legacy.email]: oldId }, sessions: { [tokenHash]: { tokenHash, userId: oldId, expiresAt: Date.now()+3600000 } }, courses: { kept: { id:"kept",userId:oldId,name:"Kept course" } }, documents: {}, messages: {}, invites: {} }));
  const child = spawn(process.execPath, ["--require", "./tests/fixtures/membership-google.js", "server.js"], {
    cwd: path.resolve(__dirname,".."), env: { ...process.env, NODE_ENV:"test",PORT:"0",STUDYBRIDGE_DB:"local",LOCAL_DB_FILE:file,LOCAL_DB_BACKUP_DISABLED:"true",
      REQUIRE_INVITE_CODE:"true", REQUIRE_EMAIL_VERIFICATION:"false",ADMIN_EMAILS:"admin@example.test",OWNER_INVITE_CODE:"bootstrap-plus-owner", SESSION_SECRET:secret,
      GOOGLE_CLIENT_ID:"fixture-client",GOOGLE_CLIENT_SECRET:"fixture-secret",GOOGLE_REDIRECT_URI:"http://localhost/api/auth/google/callback",APP_BASE_URL:"http://localhost",
      OPENAI_API_KEY:"",SMTP_HOST:"",SMTP_USER:"",SMTP_PASS:"" },stdio:["ignore","pipe","pipe"]
  });
  t.after(async()=>{ if(child.exitCode===null){ const done=once(child,"exit");child.kill();await done; } await fs.rm(directory,{recursive:true,force:true}); });
  const base = await new Promise((resolve,reject)=>{
    let output="";const timer=setTimeout(()=>reject(new Error("Membership server startup timed out")),10000);
    child.once("error",error=>{clearTimeout(timer);reject(error);});child.once("exit",()=>{clearTimeout(timer);reject(new Error("Membership server exited"));});
    child.stdout.on("data",chunk=>{output+=chunk;const match=output.match(/http:\/\/localhost:(\d+)/);if(match){clearTimeout(timer);resolve(`http://127.0.0.1:${match[1]}`);}});
  });
  async function request(route, body, cookie="", method=body===undefined?"GET":"POST", headers={}) {
    const response=await fetch(base+route,{redirect:"manual",method,headers:{"content-type":"application/json",cookie,...headers},...(body===undefined?{}:{body:JSON.stringify(body)})});
    const data=await response.json().catch(()=>({}));
    const nextCookie=response.headers.getSetCookie().find(x=>x.startsWith("sb_session="))?.split(";")[0];
    return {status:response.status,data,cookie:nextCookie,response};
  }
  const credentials=(email,inviteCode="")=>({name:"Fixture user",email,password:"Fixture-Password-2026!",passwordConfirm:"Fixture-Password-2026!",inviteCode,membershipTier:"plus",role:"admin"});
  async function google(code,{mode="register",inviteCode=""}={}){
    const params=new URLSearchParams({mode,inviteCode});
    const started=await request(`/api/auth/google/start?${params}`);assert.equal(started.status,302);
    const state=new URL(started.response.headers.get("location")).searchParams.get("state");assert.ok(state);
    return request(`/api/auth/google/callback?code=${code}&state=${encodeURIComponent(state)}`,undefined,started.response.headers.get("set-cookie").split(";")[0]);
  }
  const config=await request("/api/auth/config");assert.equal(config.data.inviteRequired,false);assert.equal(config.data.inviteGrantsPlus,true);
  const admin=await request("/api/auth/register",credentials("admin@example.test","bootstrap-plus-owner"));assert.equal(admin.status,201);assert.equal(admin.data.user.membershipTier,"plus");
  const makeInvite=async()=>{const created=await request("/api/admin/invites",{label:"Plus fixture"},admin.cookie);assert.equal(created.status,201);return created.data.invite;};

  await t.test("legacy invited users immediately resolve Plus and retain session, credentials and learning data",async()=>{
    const result=await request("/api/me",undefined,`sb_session=${oldToken}`);assert.equal(result.status,200);assert.equal(result.data.user.membershipTier,"plus");assert.equal(result.data.user.profile.sbId,"Legacy01");
    assert.equal((await request("/api/courses",undefined,`sb_session=${oldToken}`)).data.courses[0].name,"Kept course");
    const saved=JSON.parse(await fs.readFile(file,"utf8"));assert.deepEqual(saved.users[oldId],legacy);
  });
  const plain=await request("/api/auth/register",credentials("plain@example.test"));
  await t.test("blank invitations create ordinary accounts and do not accept client-supplied membership or admin rights",async()=>{
    assert.equal(plain.status,201);assert.equal(plain.data.user.membershipTier,"standard");assert.equal(plain.data.user.role,"student");
    assert.equal((await request("/api/admin/overview",undefined,plain.cookie)).status,403);
    const edited=await request("/api/me/profile",{name:plain.data.user.name,...plain.data.user.profile,membershipTier:"plus",role:"admin"},plain.cookie,"PUT");
    assert.equal(edited.status,200);assert.equal(edited.data.user.membershipTier,"standard");assert.equal(edited.data.user.role,"student");

    assert.equal((await request("/api/courses",{name:"Same available features"},plain.cookie)).status,201);
    const login=await request("/api/auth/login",credentials("plain@example.test"));assert.equal(login.data.user.id,plain.data.user.id);assert.equal(login.data.user.membershipTier,"standard");
    const raw=JSON.parse(await fs.readFile(file,"utf8"));assert.equal(raw.users[plain.data.user.id].membershipTier,"standard");
  });
  await t.test("valid email invitation creates Plus once; invalid, inactive and spent codes cannot create users",async()=>{
    const invite=await makeInvite();const plus=await request("/api/auth/register",credentials("invited@example.test",invite.code));assert.equal(plus.status,201);assert.equal(plus.data.user.membershipTier,"plus");assert.equal(plus.data.user.role,"student");
    for(const code of ["INVALID-CODE",invite.code]) assert.equal((await request("/api/auth/register",credentials("rejected@example.test",code))).status,403);
    const disabled=await makeInvite();await request(`/api/admin/invites/${disabled.id}`,{active:false},admin.cookie,"PATCH");assert.equal((await request("/api/auth/register",credentials("disabled@example.test",disabled.code))).status,403);
    const overview=await request("/api/admin/overview",undefined,admin.cookie);assert.equal(overview.data.users.find(x=>x.id===oldId).membershipTier,"plus");assert.equal(overview.data.users.find(x=>x.id===plain.data.user.id).membershipTier,"standard");
  });
  await t.test("Google signup without an invitation creates standard and adding a password keeps both sign-ins on that account",async()=>{
    const result=await google("google-plain");assert.equal(new URL(result.response.headers.get("location")).searchParams.get("googleAuth"),"ok");
    const me=(await request("/api/me",undefined,result.cookie)).data.user;assert.equal(me.membershipTier,"standard");assert.equal(me.email,"google-plain@example.test");
    const security=(await request("/api/me/security",undefined,result.cookie)).data.security;
    const saved=await request("/api/me/password",{userId:me.id,password:"Added-Password-2026!",passwordConfirm:"Added-Password-2026!"},result.cookie,"POST");assert.equal(saved.status,403,"Password security still requires its CSRF header");
    assert.equal(security.hasPassword,false);
    const password=await request("/api/me/password",{userId:me.id,password:"Added-Password-2026!",passwordConfirm:"Added-Password-2026!"},result.cookie,"POST",{"x-csrf-token":security.csrfToken});
    assert.equal(password.status,200);
    const login=await request("/api/auth/login",{email:me.email,password:"Added-Password-2026!"});assert.equal(login.status,200);assert.equal(login.data.user.id,me.id);assert.equal(login.data.user.membershipTier,"standard");
    const signedIn=await google("google-plain",{mode:"login"});const signedInUser=(await request("/api/me",undefined,signedIn.cookie)).data.user;
    assert.equal(signedInUser.id,me.id);assert.equal(signedInUser.membershipTier,"standard");

  });
  await t.test("Google signup validates and consumes Plus invitations, while existing sign-in does not alter membership",async()=>{
    const invite=await makeInvite();const result=await google("google-plus",{inviteCode:invite.code});assert.equal(new URL(result.response.headers.get("location")).searchParams.get("googleAuth"),"ok");
    const me=(await request("/api/me",undefined,result.cookie)).data.user;assert.equal(me.membershipTier,"plus");
    const reuse=await google("google-reuse",{inviteCode:invite.code});assert.ok(new URL(reuse.response.headers.get("location")).searchParams.get("authError"));
    const invalid=await google("google-invalid",{inviteCode:"INVALID"});assert.ok(new URL(invalid.response.headers.get("location")).searchParams.get("authError"));
    const fresh=await makeInvite();const existing=await google("plain",{inviteCode:fresh.code});const existingMe=(await request("/api/me",undefined,existing.cookie)).data.user;
    assert.equal(existingMe.id,plain.data.user.id);assert.equal(existingMe.membershipTier,"standard");
    const overview=await request("/api/admin/overview",undefined,admin.cookie);assert.equal(overview.data.invites.find(x=>x.id===fresh.id).uses,0);
    for(const email of ["google-reuse@example.test","google-invalid@example.test"]) assert.ok(!overview.data.users.some(x=>x.email===email));
    const newLogin=await google("not-registered",{mode:"login"});assert.equal(new URL(newLogin.response.headers.get("location")).searchParams.get("googleAuth"),"ok");assert.equal((await request("/api/me",undefined,newLogin.cookie)).data.user.membershipTier,"standard");
  });
  await t.test("new Google login enters directly, then setting redemption upgrades the same account without changing its session or role",async()=>{
    const entered=await google("login-then-upgrade",{mode:"login"});
    assert.equal(new URL(entered.response.headers.get("location")).searchParams.get("googleAuth"),"ok");
    const account=(await request("/api/me",undefined,entered.cookie)).data.user;
    assert.equal(account.membershipTier,"standard");
    assert.equal((await request("/api/courses",{name:"Retained after Plus"},entered.cookie)).status,201);
    const status=await request("/api/me/membership",undefined,entered.cookie);assert.equal(status.data.membership.tier,"standard");assert.equal(status.response.headers.get("cache-control"),"private, no-store");
    const invite=(await request("/api/admin/invites",{label:"Redeem fixture",role:"admin"},admin.cookie)).data.invite;
    const redeem=(values={},csrf=status.data.membership.csrfToken,cookie=entered.cookie,headers={})=>request("/api/me/membership/redeem",{userId:account.id,inviteCode:invite.code,...values},cookie,"POST",{"x-csrf-token":csrf,...headers});
    assert.equal((await request("/api/me/membership")).status,401);
    assert.equal((await redeem({},"","")).status,401);
    assert.equal((await redeem({},"bad-token")).status,403);
    assert.equal((await redeem({},status.data.membership.csrfToken,entered.cookie,{"content-type":"text/plain"})).status,403);
    assert.equal((await redeem({userId:admin.data.user.id})).status,409);
    for(const code of ["","INVALID-REDEEM"]) assert.equal((await redeem({inviteCode:code})).status,400);
    const concurrent=await Promise.all([redeem(),redeem()]);assert.ok(concurrent.every(value=>value.status===200));assert.equal(concurrent.filter(value=>value.data.redeemed).length,1);
    const result=concurrent.find(value=>value.data.redeemed);assert.equal(result.status,200);assert.equal(result.data.redeemed,true);
    assert.equal(result.data.user.id,account.id);assert.equal(result.data.user.membershipTier,"plus");assert.equal(result.data.user.role,"student");assert.equal(result.data.user.profile.sbId,account.profile.sbId);
    assert.equal(result.response.headers.get("set-cookie"),null);
    assert.equal((await request("/api/admin/overview",undefined,entered.cookie)).status,403);
    assert.equal((await request("/api/courses",undefined,entered.cookie)).data.courses[0].name,"Retained after Plus");
    assert.equal((await redeem()).data.redeemed,false);
    const fresh=await makeInvite();assert.equal((await redeem({inviteCode:fresh.code})).data.redeemed,false);
    const overview=await request("/api/admin/overview",undefined,admin.cookie);assert.equal(overview.data.invites.find(x=>x.id===fresh.id).uses,0);
    const other=await request("/api/auth/register",credentials("cannot-reuse@example.test"));
    const otherStatus=await request("/api/me/membership",undefined,other.cookie);
    const reused=await request("/api/me/membership/redeem",{userId:other.data.user.id,inviteCode:invite.code},other.cookie,"POST",{"x-csrf-token":otherStatus.data.membership.csrfToken});assert.equal(reused.status,400);
    const signedIn=await google("login-then-upgrade",{mode:"login"});const after=(await request("/api/me",undefined,signedIn.cookie)).data.user;assert.equal(after.id,account.id);assert.equal(after.membershipTier,"plus");
  });
  await t.test("concurrent Google first logins share one newly created ordinary account",async()=>{
    const flows=await Promise.all([google("simultaneous",{mode:"login"}),google("simultaneous",{mode:"login"})]);
    const users=await Promise.all(flows.map(async flow=>{assert.equal(new URL(flow.response.headers.get("location")).searchParams.get("googleAuth"),"ok");return(await request("/api/me",undefined,flow.cookie)).data.user;}));
    assert.equal(users[0].id,users[1].id);assert.equal(users[0].membershipTier,"standard");
    const overview=await request("/api/admin/overview",undefined,admin.cookie);assert.equal(overview.data.users.filter(x=>x.email==="simultaneous@example.test").length,1);
  });
});

for (const mode of ["local", "dynamodb"]) test(`${mode}: redeeming Plus is atomic, idempotent and preserves credentials, roles and concurrent profile edits`, async (t) => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "studybridge-plus-redeem-"));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const db = new StudyBridgeDatabase(); db.local.file = path.join(directory, "database.json");
  const cloud = mode === "dynamodb" ? memoryDynamo() : null; db.dynamo = cloud?.store || null;
  if (cloud) cloud.store.scanType = async (type) => [...cloud.rows.values()].filter(row => row.type.S === type).map(row => JSON.parse(row.data.S));
  const original = { id:"ordinary",email:"ordinary@example.test",name:"Ordinary",role:"student",passwordHash:"saved-hash",passwordVersion:2,googleSub:"saved-google",profile:{sbId:"Keep01"},preferences:{customInstruction:"Keep"},legacy:{keep:true} };
  await db.createUser(original);
  const invite = await db.createInvite({ id:"upgrade",code:"UPGRADE",role:"admin",active:true,uses:0 });
  await Promise.all([db.updateUser(original.id,{name:"Updated name"}),db.redeemMembershipInvite(original.id,invite)]);
  const saved = await db.getUser(original.id);
  assert.equal(saved.membershipTier,"plus");assert.equal(saved.name,"Updated name");assert.equal(saved.role,"student");
  for(const key of ["passwordHash","passwordVersion","googleSub","profile","preferences","legacy"]) assert.deepEqual(saved[key],original[key]);
  assert.equal((await db.findInviteByCode(invite.code)).uses,1);
  assert.equal((await db.redeemMembershipInvite(original.id,invite)).redeemed,false);
  const unused = await db.createInvite({id:"unused",code:"UNUSED",active:true,uses:0});
  assert.equal((await db.redeemMembershipInvite(original.id,unused)).redeemed,false);
  assert.equal((await db.findInviteByCode(unused.code)).uses,0);
  for(const id of ["a","b"]) await db.createUser({id,email:`${id}@example.test`,role:"student"});
  const single = await db.createInvite({id:"single",code:"SINGLE-REDEEM",active:true,uses:0});
  const race = await Promise.allSettled(["a","b"].map(id=>db.redeemMembershipInvite(id,single)));
  assert.equal(race.filter(x=>x.status==="fulfilled").length,1);assert.equal(race.find(x=>x.status==="rejected").reason.statusCode,403);
  assert.equal((await db.findInviteByCode(single.code)).usedBy.length,1);
  await db.createUser({id:"same",email:"same-redeem@example.test"});
  const other = await db.createInvite({id:"other",code:"OTHER",active:true,uses:0});
  const double = await Promise.all([db.redeemMembershipInvite("same",unused),db.redeemMembershipInvite("same",other)]);
  assert.equal(double.filter(x=>x.redeemed).length,1);
  assert.equal((await db.findInviteByCode(unused.code)).uses+(await db.findInviteByCode(other.code)).uses,1);
  const disabled = await db.createInvite({id:"disabled",code:"DISABLED-REDEEM",active:false,uses:0});
  await db.createUser({id:"blocked",email:"blocked-redeem@example.test"});
  await assert.rejects(db.redeemMembershipInvite("blocked",disabled),{statusCode:403});
  assert.equal((await db.getUser("blocked")).membershipTier,"standard");
  if(mode==="local") {
    const fresh = await db.createInvite({id:"failure",code:"FAILED-PERSISTENCE",active:true,uses:0});
    const before = await fs.readFile(db.local.file,"utf8");
    db.local.save=async()=>{throw new Error("disk full");};
    await assert.rejects(db.redeemMembershipInvite("blocked",fresh),/disk full/);
    assert.equal((await db.getUser("blocked")).membershipTier,"standard");assert.equal((await db.findInviteByCode(fresh.code)).uses,0);
    assert.equal(await fs.readFile(db.local.file,"utf8"),before);
  }
});
