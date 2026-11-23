const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), os = require('node:os'), path = require('node:path');
const { StudyBridgeDatabase } = require('../lib/database');
const { memoryDynamo } = require('./helpers/community-dynamo');
const { createAiCosts } = require('../lib/ai-costs');
const { createAiUsage } = require('../lib/ai-usage');
const { mediaEstimate } = require('../lib/ai-media-estimates');
const { streamResult } = require('../lib/ai-provider-result');
const url = 'https://api.openai.com/v1/responses';
const options = {method:'POST',body:JSON.stringify({model:'gpt-6.1-sol',input:'private fixture',max_output_tokens:256})};
const usage = {input_tokens:1000,output_tokens:100};
const day = '2026-11-20';
async function fixture(t,dynamo=false) {
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'sb-controls-')); t.after(()=>fs.rm(dir,{recursive:true,force:true}));
  const db=new StudyBridgeDatabase(); db.dynamo=dynamo?memoryDynamo().store:null; db.local.file=path.join(dir,'db.json');
  return db;
}
for (const dynamo of [false,true]) test(`${dynamo?'Dynamo':'local'} shared paid admission survives restarts and limits duplicate/failing work`, async t=>{
  const db=await fixture(t,dynamo); let time=Date.parse(day),calls=0,release;
  const request=async()=>{calls++;await new Promise(r=>release=r);return Response.json({usage,status:'incomplete'});};
  const config={db,env:{},now:()=>time,request}; const a=createAiCosts(config),b=createAiCosts(config);
  const first=a.fetch(url,options,{userId:'u',source:'study',estimateMicros:3000});
  while(!release) await new Promise(r=>setImmediate(r));
  await assert.rejects(b.fetch(url,options,{userId:'u',source:'study',estimateMicros:3000}),{costGuard:true});
  assert.equal(calls,1); release();await first;
  config.request=async()=>{calls++;return Response.json({usage,status:'incomplete'});};
  const restarted=createAiCosts(config);
  await restarted.fetch(url,options,{userId:'u',source:'study',estimateMicros:3000});
  await restarted.fetch(url,options,{userId:'u',source:'study',estimateMicros:3000});
  await assert.rejects(restarted.fetch(url,options,{userId:'u',source:'study',estimateMicros:3000}),{costGuard:true});
  const report=await restarted.report(day,day); assert.equal(report.calculatedUsd,.009);assert.equal(report.failedUsd,.009);
  assert.equal(report.controls.blocked.duplicate,1);assert.equal(report.controls.blocked['failure-cooldown'],1);
  time+=16*60000;await restarted.fetch(url,options,{userId:'u',source:'study',estimateMicros:3000}); assert.equal(calls,4);
});
for (const dynamo of [false,true]) test(`${dynamo?'Dynamo':'local'} platform and account provider budgets cannot be bypassed by personal refunds`,async t=>{
  const db=await fixture(t,dynamo),env={AI_PLATFORM_DAILY_BUDGET_USD:'.005'};
  let calls=0;
  const c=createAiCosts({db,env,now:()=>Date.parse(day),request:async()=>{calls++;return Response.json({usage});}});
  await c.fetch(url,options,{payer:'platform',source:'help',estimateMicros:3000});
  await assert.rejects(c.fetch(url,options,{payer:'platform',source:'calendar',estimateMicros:3000}),{costGuard:true});
  await c.fetch(url,options,{userId:'a',source:'office',operationId:'job',estimateMicros:3000});
  await c.failedOperation({id:'job',userId:'a',createdAt:day});await c.failedOperation({id:'job',userId:'a',createdAt:day});
  await assert.rejects(c.fetch(url,options,{userId:'a',source:'study',estimateMicros:3000}),{costGuard:true});
  await c.fetch(url,options,{userId:'b',source:'study',estimateMicros:3000});
  assert.equal(calls,3);assert.equal((await c.report(day,day)).controls.spentUsd,.006);
});
test('reported usage on HTTP errors remains an expense, request identity survives a body failure',async t=>{
  const db=await fixture(t);let broken=false;
  const c=createAiCosts({db,env:{},now:()=>Date.parse(day),request:async()=>broken?
    new Response(new ReadableStream({pull(controller){controller.error(Error('disconnected'));}}),{headers:{'x-request-id':'req_broken'}}):
    Response.json({usage},{status:429,headers:{'x-request-id':'req_limited'}})});
  await c.fetch(url,options,{userId:'a'}); broken=true;
  await assert.rejects(c.fetch(url,options,{userId:'a'}));
  const rows=await db.listAiCosts([day]);assert.equal(rows.find(r=>r.providerRequestId==='req_limited').amountMicros,3000);
  assert.equal(rows.find(r=>r.providerRequestId==='req_broken').status,'unknown');
  assert.equal((await c.report(day,day)).failedUsd,.003);
});
test('both ledgers agree on trailing SSE without newline, incomplete chat and cancellation',async t=>{
  const db=await fixture(t);await db.createUser({id:'a',email:'a@example.test'});
  let mode='complete';
  const costs=createAiCosts({db,env:{},now:()=>Date.parse(day),request:async u=>u.endsWith('input_tokens')?Response.json({input_tokens:100}):
    new Response(mode==='complete'?`data: ${JSON.stringify({type:'response.completed',response:{usage,status:'completed'}})}`:
      `data: ${JSON.stringify({choices:[{finish_reason:'length'}],usage})}`)});
  const quota=createAiUsage({db,request:(u,o,m)=>costs.fetch(u,o,{...m,userId:'a'})});
  const send=()=>quota.run('a',()=>quota.fetch(url,{method:'POST',body:JSON.stringify({model:'gpt-6.1-sol',input:'test',stream:true})}));
  await (await send()).text(); assert.equal((await quota.status('a')).usedUsd,.003);
  mode='incomplete';await(await send()).text(); assert.equal((await quota.status('a')).usedUsd,.003);
  assert.equal((await costs.report(day,day)).calculatedUsd,.006);
  const parser=streamResult();parser.line('data: {"usage":{"input_tokens":1,"output_tokens":1}}');assert.equal(parser.failed,true);
  parser.line('data: {"type":"error"}');parser.line('data: [DONE]');assert.equal(parser.failed,true);
});
test('official reads coalesce, survive restart, back off across ranges and retain dated results',async t=>{
  const db=await fixture(t);let time=Date.parse(day),calls=0,rate=false;
  const env={OPENAI_COSTS_ADMIN_KEY:'fixture',OPENAI_COSTS_PROJECT_ID:'proj_fixture',OPENAI_COSTS_HISTORY_START:'2025-01-01'};
  const request=async()=>{calls++;return rate?new Response('',{status:429,headers:{'retry-after':'600'}}):Response.json({data:[{start_time:Date.parse(day)/1000,results:[{amount:{currency:'usd',value:1},line_item:'text'}]}],has_more:false});};
  const config={db,env,now:()=>time,request};let c=createAiCosts(config);
  await Promise.all(Array.from({length:10},()=>c.report(day,day)));assert.equal(calls,1);
  c=createAiCosts(config);await c.report(day,day);assert.equal(calls,1);
  time+=6*60000;rate=true;
  const stale=(await c.report(day,day)).official;assert.equal(stale.stale,true);assert.equal(stale.fetchedAt,new Date(Date.parse(day)).toISOString());
  await c.periodReport('30');assert.equal(calls,2,'429 cooldown applies to every range');
  time+=11*60000;rate=false;
  const all=await c.periodReport('all');assert.equal(all.from,'2025-01-01');assert.equal(all.aiCosts.since,new Date(Date.parse(day)).toISOString());
  assert.equal(all.aiCosts.unallocatedUsd,1);assert.equal(all.aiCosts.cash.balanceUsd,null);
});
test('cost backoff after UTC midnight reuses archived official days and leaves the new day missing', async t => {
  const db = await fixture(t);
  const lastDay = '2026-11-30', today = '2026-12-01';
  const snapshotTime = Date.parse(lastDay + 'T23:59:59Z');
  let time = snapshotTime, calls = 0;
  const c = createAiCosts({db, now: () => time,
    env: {OPENAI_COSTS_ADMIN_KEY: 'fixture', OPENAI_COSTS_PROJECT_ID: 'archive'},
    request: async () => {
      calls++;
      if (calls === 2) return new Response('', {status: 429});
      const row = {start_time: Date.parse(lastDay) / 1000, results: [{amount: {currency: 'usd', value: 3}, line_item: 'text'}]};
      return Response.json({data: [row], has_more: false});
    }
  });
  const initial = (await c.periodReport('7')).aiCosts.official;
  assert.equal(initial.amountUsd, 3);
  time += 2000;
  await db.putAiCost({id: 'today', startedAt: new Date(time).toISOString(), source: 'study', amountMicros: 1e6});
  const {aiCosts} = await c.periodReport('7');
  assert.equal(aiCosts.official.stale, true);
  assert.equal(aiCosts.official.fetchedAt, new Date(snapshotTime).toISOString());
  assert.equal(aiCosts.official.from, '2026-11-25');
  assert.equal(aiCosts.official.through, lastDay);
  assert.equal(aiCosts.official.days.length, 6);
  assert.equal(aiCosts.official.missingDays, 1);
  assert.equal(aiCosts.official.amountUsd, 3);
  assert.equal(aiCosts.reconciliation.outsideCoverageUsd, 1);
  assert.equal(aiCosts.differenceUsd, 3);
  assert.equal(aiCosts.official.days.some(row => row.day === today), false);
  const month = (await c.periodReport('30')).aiCosts.official;
  assert.equal(month.missingDays, 23);
  assert.equal(month.amountUsd, 3);
  assert.equal(calls, 2);
  time += 6 * 60000;
  const recovered = (await c.periodReport('7')).aiCosts.official;
  assert.equal(recovered.missingDays, 0);
  assert.deepEqual(recovered.days.at(-1), {day: today, amountUsd: 0});
  assert.equal(recovered.stale, undefined);
  assert.equal(calls, 3);
});
function wav(seconds) {
  const bytes=Buffer.alloc(44+seconds*8000);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);
  bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(1,22);bytes.writeUInt32LE(8000,24);bytes.writeUInt32LE(8000,28);
  bytes.writeUInt16LE(1,32);bytes.writeUInt16LE(8,34);bytes.write('data',36);bytes.writeUInt32LE(bytes.length-44,40);return bytes;
}
test('audio reserves measured duration before dispatch, long uploads cannot use the old fixed reserve',async t=>{
  const db=await fixture(t);await db.createUser({id:'a',email:'a@example.test'});let calls=0;
  const q=createAiUsage({db,request:async()=>{calls++;return Response.json({text:'test',usage:{seconds:1200}});}});
  const prior=await q.reserve('a',450000);await q.settle(prior,450000);
  const body=new FormData();body.set('model','gpt-transcribe');body.set('file',new Blob([wav(1200)],{type:'audio/wav'}),'test.wav');
  assert.equal(await mediaEstimate('gpt-transcribe',body),90075);
  await assert.rejects(q.run('a',()=>q.fetch('https://api.openai.com/v1/audio/transcriptions',{method:'POST',body})),{statusCode:429});assert.equal(calls,0);
  body.set('file',new Blob(['invalid'],{type:'audio/mpeg'}),'invalid.mp3');await assert.rejects(mediaEstimate('gpt-transcribe',body),{statusCode:400});
});
test('image reservations account for model, quality, geometry and reference inputs',async()=>{
  const rates=[2.5,4,15],body={model:'gpt-image-2',prompt:'test',size:'1024x1024',quality:'low'};
  const low=await mediaEstimate(body.model,body,rates),high=await mediaEstimate(body.model,{...body,quality:'high'},rates);
  assert.ok(low<high);assert.notEqual(high,await mediaEstimate(body.model,{...body,quality:'high',size:'1536x1024'},rates));
  const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a2ioAAAAASUVORK5CYII=';
  assert.ok(await mediaEstimate(body.model,{...body,images:[{image_url:image}]},rates)>low);
  assert.ok(await mediaEstimate('gpt-image-2.6-sunburst',body,[5,8,30])>low);
});
test('server coalesces health checks and only falls back on explicit unsupported tools',async()=>{
  const vm=require('node:vm'),source=await fs.readFile(path.join(__dirname,'../server.js'),'utf8');
  const functionText=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)+start.length));
  let calls=0;const context={Date, process:{env:{OPENAI_API_KEY:"fixture"}}, pendingAiHealth:null,cachedAiHealth:null,simpleAiModel:'mock',complexAiModel:'mock',webSearchEnabled:true,
    requestOpenAiChatHealth:async()=>{calls++;await new Promise(r=>setImmediate(r));return {ok:true};}};
  vm.createContext(context);vm.runInContext(functionText('async function aiHealthStatus(','\nfunction authRedirect'),context);
  await context.aiHealthStatus(); assert.equal(calls,0,"opening admin must not issue paid probes");
  await Promise.all(Array.from({length:10},()=>context.aiHealthStatus(true)));assert.equal(calls,1);
  await context.aiHealthStatus(); assert.equal(calls,1);
  let routes=[],failure=Error('timeout');
  const routing={process:{env:{OPENAI_API_KEY:'fixture'}},simpleAiModel:'mock',webSearchEnabled:true,
    callAiWithResponses:async()=>{routes.push('responses');throw failure;},callAiWithChatCompletions:async()=>{routes.push('chat');return 'ok';}};
  vm.createContext(routing);vm.runInContext(functionText('async function callAi(messages','\nasync function studyAnswerContext'),routing);
  for(const error of [Error('timeout'),Object.assign(Error('limited'),{statusCode:429}),Object.assign(Error('auth'),{statusCode:401})]){
    routes=[];failure=error;await assert.rejects(routing.callAi([]));assert.deepEqual(routes,['responses']);
  }
  routes=[];failure=Object.assign(Error('unsupported'),{unsupportedTool:true});await routing.callAi([]);assert.deepEqual(routes,['responses','chat']);
});
test('official read leases coalesce across separate workers without publishing partial totals',async t=>{
  const db=await fixture(t,true);let release,calls=0;
  const config={db,env:{OPENAI_COSTS_ADMIN_KEY:'fixture',OPENAI_COSTS_PROJECT_ID:'proj'},now:()=>Date.parse(day),request:async()=>{
    calls++;await new Promise(r=>release=r);return Response.json({data:[],has_more:false});}};
  const a=createAiCosts(config),b=createAiCosts(config),first=a.report(day,day);
  while(!release)await new Promise(r=>setImmediate(r));
  assert.equal((await b.report(day,day)).official.status,'unavailable');assert.equal(calls,1);
  release();await first;assert.equal((await b.report(day,day)).official.amountUsd,0);assert.equal(calls,1);
});
test('in-flight duplicate admission remains blocked across UTC midnight',async t=>{
  const db=await fixture(t);let time=Date.parse(day+'T23:59:59Z'),release,calls=0;
  const c=createAiCosts({db,env:{},now:()=>time,request:async()=>{calls++;await new Promise(r=>release=r);return Response.json({usage});}});
  const first=c.fetch(url,options,{userId:'a',source:'study'});
  while(!release)await new Promise(r=>setImmediate(r));
  time+=2000;await assert.rejects(c.fetch(url,options,{userId:'a',source:'study'}),{costGuard:true});assert.equal(calls,1);
  release();await first;
});
for (const dynamo of [false,true]) test(`${dynamo?'Dynamo':'local'} All preserves official daily history beyond provider retention and never doubles overlap`,async t=>{
  const db=await fixture(t,dynamo);let time=Date.parse(day),value=1;
  const c=createAiCosts({db,env:{OPENAI_COSTS_ADMIN_KEY:'fixture',OPENAI_COSTS_PROJECT_ID:'history',OPENAI_COSTS_HISTORY_START:'2025-01-01'},now:()=>time,
    request:async u=>{
      const start=Number(new URL(u).searchParams.get('start_time'));
      const floor=new Date(time);floor.setUTCFullYear(floor.getUTCFullYear()-1);
      assert.ok(start>=Date.parse(floor.toISOString().slice(0,10))/1000,'Never request outside provider retention');
      return Response.json({data:[{start_time:Math.floor(time/86400000)*86400,results:[{amount:{currency:'usd',value},line_item:'text'}]}],has_more:false});
    }});
  const initial=(await c.periodReport('all')).aiCosts.official;assert.equal(initial.amountUsd,1);assert.equal(initial.coverageLimited,true);assert.equal(initial.from,'2025-11-20');
  time+=400*86400000;value=2;
  const later=(await c.periodReport('all')).aiCosts.official;assert.equal(later.amountUsd,3);assert.equal(later.from,'2025-11-20');assert.equal(later.coverageLimited,true);
  time+=6*60000;assert.equal((await c.periodReport('all')).aiCosts.official.amountUsd,3,'Refresh replaces overlapping daily snapshots');
});
