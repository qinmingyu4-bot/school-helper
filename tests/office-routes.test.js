const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');
const os=require('node:os');
const {Module}=require('node:module');
const {Readable}=require('node:stream');
const {SESSION_COOKIE,hashToken}=require('../lib/security');
const M=require('../public/office-model');

test('Office routes enforce login, actor identity and sharing ownership without starting a network listener',async t=>{
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'sb-office-routes-'));
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const filename=path.resolve(__dirname,'../server.js');
  const source=(await fs.readFile(filename,'utf8')).split('\nconst server = http.createServer(')[0].replace('loadEnvFile();','');
  const loaded=new Module(filename,module);loaded.filename=filename;loaded.paths=module.paths;
  loaded._compile(source+'\nmodule.exports={routeApi,db};',filename);
  const {routeApi,db}=loaded.exports;db.dynamo=null;db.local.file=path.join(directory,'db.json');
  for(const id of ['alice','bob']){
    await db.createUser({id,name:id,email:id+'@example.test',profile:{},passwordVersion:0});
    await db.createSession({tokenHash:hashToken(id),userId:id,expiresAt:Date.now()+60000,passwordVersion:0});
  }
  const request=async(url,{who,body,headers={}}={})=>{
    const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);req.url=url;req.method=body?'POST':'GET';req.headers={'content-type':'application/json',...(who?{cookie:`${SESSION_COOKIE}=${who}`}:{ }),...headers};
    const result = { headers: {} };
    const res = {
      setHeader(name, value) { result.headers[name.toLowerCase()] = value; },
      getHeader(name) { return result.headers[name.toLowerCase()]; },
      writeHead(status, headers) { result.status = status; Object.assign(result.headers, headers); },
      end(body) { result.body = body ? JSON.parse(body) : null; },
    };
    try{await routeApi(req,res);}catch(error){result.status=error.statusCode||500;result.body={error:error.message};}
    return result;
  };
  const unsigned = await request('/api/office/office_route/sync',{body:{}});
  assert.equal(unsigned.status, 401, unsigned.body?.error);
  const {createOfficeService}=require('../lib/office-service');await createOfficeService(db).save('alice','office_route',{kind:'docs',version:0,model:M.fresh('docs')});
  assert.equal((await request('/api/office/office_route/sharing',{who:'alice',body:{actorId:'bob',enabled:true}})).status,403);
  assert.equal((await request('/api/office/office_route/sharing',{who:'alice',body:{actorId:'alice',enabled:true},headers:{'sec-fetch-site':'cross-site'}})).status,403);
  assert.equal((await request('/api/office/office_route/sharing',{who:'bob',body:{actorId:'bob',enabled:true}})).status,404);
  const shared=await request('/api/office/office_route/sharing',{who:'alice',body:{actorId:'alice',enabled:true}});assert.equal(shared.status,200);
  const body={actorId:'bob',ownerId:'alice',token:shared.body.token,since:0,initial:true,peer:'bob'};
  const joined=await request('/api/office/office_route/sync',{who:'bob',body});assert.equal(joined.status,200);assert.equal(joined.headers['cache-control'],'private, no-store');
  await request('/api/office/office_route/sharing',{who:'alice',body:{actorId:'alice',enabled:false}});
  assert.equal((await request('/api/office/office_route/sync',{who:'bob',body})).status,403);
});
