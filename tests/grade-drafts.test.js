"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm"), {randomUUID} = require("node:crypto");
const drafts = require("../public/local-drafts");
const source = fs.readFileSync(require.resolve("../public/grade-planner.js"), "utf8");
const plan = {categories:[{id:"category", name:"Final", weight:100, method:"equal", plannedCount:1, items:[{id:"exam", name:"Exam", score:0, max:100, status:"graded"}]}],source:"",ruleSources:[]};
function storage() { const values = new Map(); return {getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)}; }
async function mount(store, {userId="alice",version=1,save=async()=>({ok:true,plan:{version:2}})}={}) {
  const handlers = {}, status = {textContent:""};
  const root = {innerHTML:"",addEventListener:(type,fn)=>{handlers[type]=fn;},querySelector:()=>null,querySelectorAll:selector=>selector==="[data-save-status]"?[status]:[]};
  const dialog = {addEventListener(){},close(){},querySelectorAll:()=>[]};
  const toast = {textContent:"",hidden:true};
  const scope = {getElementById:key=>({"grade-app":root,"grade-dialog":dialog,"grade-toast":toast})[key]||null,addEventListener(){}};
  const host = {isConnected:true,dataset:{},attachShadow:()=>scope};
  const puts = [];
  const context = {console,URL,Blob,crypto:{randomUUID},setTimeout:()=>1,clearTimeout(){},localStorage:store,MutationObserver:class{observe(){} disconnect(){}},document:{documentElement:{dataset:{},lang:"zh"},getElementById:()=>null},addEventListener(){},removeEventListener(){},StudyBridgeDrafts:drafts,StudyBridgeGrades:require("../public/grade-planner-model"),StudyBridgeGradeLocations:require("../public/grade-locations"),fetch:async(url,options={})=>{
    if(options.method==="PUT") { const body=JSON.parse(options.body); puts.push(body); const result=await save(body); return {ok:result.ok,status:result.status||200,json:async()=>result}; }
    return {ok:true,status:200,json:async()=>url.endsWith("/locations")?{locations:[],checkedCount:0,partialCount:0}:{userId,csrfToken:"token",courses:[{id:"course",name:"Course",code:"C",term:"",version,...structuredClone(plan)}]}};
  }};
  context.window=context;
  vm.runInNewContext(source,context);
  await context.StudyBridgeGradePlanner.mount(host);
  const click = async action => { handlers.click({target:{closest:()=>({dataset:{action}})}}); await host.gradePlanner.flush(); };
  return {root,status,puts,click};
}
test("failed grade synchronization survives reload; explicit recovery uses account version and retains a real zero", async()=>{
  const store=storage(),d=drafts.create(store);
  d.write("alice","grades:course",{version:1,plan});
  const failed=await mount(store,{save:async()=>({ok:false,status:503,error:"offline"})});
  assert.match(failed.root.innerHTML,/restore-draft/);
  await failed.click("restore-draft");
  assert.match(failed.status.textContent,/已保留本机草稿/);
  assert.equal(d.read("alice","grades:course").plan.categories[0].items[0].score,0);
  const recovered=await mount(store); await recovered.click("restore-draft");
  assert.equal(recovered.puts[0].version,1);
  assert.equal(recovered.puts[0].categories[0].items[0].score,0);
  assert.equal(d.read("alice","grades:course"),null);
});
test("stale or another account's grade draft cannot overwrite newer records",async()=>{
  const store=storage(),d=drafts.create(store);d.write("alice","grades:course",{version:1,plan});
  const newer=await mount(store,{version:2});assert.doesNotMatch(newer.root.innerHTML,/data-action="restore-draft"/);assert.match(newer.root.innerHTML,/download-draft/);
  await newer.click("restore-draft");assert.equal(newer.puts.length,0);assert.ok(d.read("alice","grades:course"));
  const other=await mount(store,{userId:"bob"});assert.doesNotMatch(other.root.innerHTML,/download-draft/);
  await newer.click("discard-draft");assert.equal(d.read("alice","grades:course"),null);
});
test("a completing grade save preserves a newer draft from another tab and reports quota failures",async()=>{
  const store=storage(),d=drafts.create(store);d.write("alice","grades:course",{version:1,plan});
  const tab=await mount(store,{save:async()=>{d.write("alice","grades:course",{version:1,plan,writer:"other-tab"});return {ok:true,plan:{version:2}};}});
  await tab.click("restore-draft");assert.equal(d.read("alice","grades:course").writer,"other-tab");
  store.setItem=()=>{throw Error("quota");};
  const full=await mount(store,{save:async()=>({ok:false,status:503,error:"offline"})});await full.click("restore-draft");assert.match(full.status.textContent,/本机草稿也未保存/);
});
