"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), vm = require("node:vm");

// Mount the account component, with a small DOM stand-in for its rendered controls.
async function planner() {
  const handlers = {}, nodes = new Map(); let html = "", writes = 0;
  const root = {
    set innerHTML(value) {
      html = value; nodes.clear();
      for (const [,id] of value.matchAll(/\bid="([^"]+)"/g)) nodes.set(id, {
        id, dataset:{}, value:"", style:{setProperty(k,v){this[k]=v;}}, classList:{toggle(){}},
        setAttribute(k,v){this[k]=v;}, removeAttribute(k){delete this[k];}
      });
      for (const [tag] of value.matchAll(/<input\b[^>]*>/g)) {
        const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m=>[m[1],m[2]]));
        if (nodes.has(attrs.id)) Object.assign(nodes.get(attrs.id), attrs);
      }
    }, get innerHTML(){return html;},
    addEventListener:(type,fn)=>{handlers[type]=fn;}, querySelector:()=>null, querySelectorAll:()=>[]
  };
  const dialog={addEventListener(){},querySelectorAll:()=>[]};
  const scope={getElementById:id=>id==="grade-app"?root:id==="grade-dialog"?dialog:nodes.get(id),addEventListener(){}};
  const host={isConnected:true,dataset:{},attachShadow:()=>scope};
  const categories=[["hw",20,80],["mid",40,65],["final",40,null]].map(([id,weight,score])=>({id,name:id,weight,method:"equal",plannedCount:1,items:[{id:id+"1",name:id,max:100,score,status:score===null?"pending":"graded"}]}));
  const original=JSON.stringify(categories);
  const context={console,URL,crypto:require("node:crypto"),setTimeout:()=>1,clearTimeout(){},MutationObserver:class{observe(){}},addEventListener(){},removeEventListener(){},document:{documentElement:{dataset:{},lang:"zh"},getElementById:()=>null},StudyBridgeGrades:require("../public/grade-planner-model"),StudyBridgeGradeLocations:require("../public/grade-locations"),fetch:async(url,options={})=>{
    if (options.method && options.method!=="GET") writes++;
    return {ok:true,status:200,json:async()=>url.endsWith("/locations")?{locations:[]}:{userId:"test",csrfToken:"test",courses:[{id:"course",name:"Course",code:"C",term:"",version:0,categories}]}};
  }};
  context.window=context;
  vm.runInNewContext(fs.readFileSync(require.resolve("../public/grade-planner.js"),"utf8"),context);
  await context.StudyBridgeGradePlanner.mount(host);
  handlers.click({target:{closest:()=>({dataset:{tab:"prediction"}})}});
  return {get:id=>nodes.get(id), edit(id,value,event="input") {const el=nodes.get(id);el.value=value;handlers[event]({target:el});}, unchanged(){assert.equal(writes,0);assert.equal(JSON.stringify(categories),original);}};
}
test("account sliders keep independent 0–100 scales, hundredths and bidirectional values without saving grades",async()=>{
  const p=await planner();
  for(const id of ["assessment-slider","total-slider"]) {assert.equal(p.get(id).min,"0");assert.equal(p.get(id).max,"100");assert.equal(p.get(id).step,"0.01");}
  p.edit("assessment-slider","10.47");
  assert.equal(p.get("assessment-number").value,"10.47");assert.equal(p.get("total-number").value,"46.19");
  assert.equal(p.get("assessment-slider").style["--range-progress"],"10.47%");assert.equal(p.get("total-slider").style["--range-progress"],"46.19%");
  p.edit("total-slider","75.25");assert.equal(p.get("assessment-number").value,"83.13");assert.equal(p.get("total-number").value,"75.25");
  p.unchanged();
});
test("account number edits retain partial input then format on commit and recover empty/invalid input",async()=>{
  const p=await planner();
  p.edit("assessment-number","10.");assert.equal(p.get("assessment-number").value,"10.");
  p.edit("assessment-number","10.","change");assert.equal(p.get("assessment-number").value,"10.00");
  p.edit("assessment-number","");p.edit("assessment-number","","focusout");assert.equal(p.get("assessment-number").value,"10.00");
  p.edit("assessment-number","101");assert.equal(p.get("assessment-number")["aria-invalid"],"true");
  p.edit("assessment-number","101","focusout");assert.equal(p.get("assessment-number").value,"10.00");
  p.edit("assessment-number","100");p.edit("assessment-number","100","change");assert.equal(p.get("assessment-number").value,"100.00");
  p.unchanged();
});
test("unattainable account targets remain explicit and inverse requirements round upward only to hundredths",async()=>{
  const p=await planner();
  p.edit("total-slider","100");assert.equal(p.get("assessment-number").value,"145.00");assert.equal(p.get("assessment-slider").value,"100.00");assert.match(p.get("linked-result").innerHTML,/145.00%/);assert.match(p.get("linked-result").innerHTML,/82.00/);
  p.edit("total-slider","20");assert.equal(p.get("assessment-number").value,"0.00");assert.equal(p.get("total-number").value,"20.00");assert.match(p.get("linked-result").innerHTML,/42.00/);
  p.edit("assessment-slider","80.01");assert.equal(p.get("total-number").value,"74.00");
  p.unchanged();
});
