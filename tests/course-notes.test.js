'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validate,create}=require('../lib/course-notes');
const item={type:'pen',color:'#123456',width:.003,points:[[.1,.2],[.3,.4]]};
test('annotation validation rejects unbounded geometry, markup colors and excessive data',()=>{
  assert.deepEqual(validate({version:0,items:[item]}),[item]);
  for(const invalid of [{...item,color:'red" onclick="x'}, {...item,points:[[NaN,0]]}, {...item,width:2}, {...item,type:'script'}]) assert.throws(()=>validate({version:0,items:[invalid]}));
  assert.throws(()=>validate({version:-1,items:[]}));
  assert.throws(()=>validate({version:0,items:[{type:'text',color:'#000000',width:.02,x:0,y:0,text:'a'.repeat(4001)}]}));
});
test('local notes isolate pages and reject stale saves without overwriting content',async()=>{
 const state={documents:{d:{userId:'u',courseId:'c',hasSourcePdf:true}}};
 const service=create({local:{read:async fn=>fn(state),write:async fn=>fn(state)}});
 assert.equal((await service.read('u','c','d',1)).version,0);
 const saved=await service.save('u','c','d',1,{version:0,items:[item]});assert.equal(saved.version,1);
 await assert.rejects(service.save('u','c','d',1,{version:0,items:[]}),e=>e.statusCode===409);
 assert.deepEqual((await service.read('u','c','d',1)).items,[item]);
 assert.deepEqual((await service.read('u','c','d',2)).items,[]);
 await service.save('u','c','d',2,{version:0,items:[]});
 assert.deepEqual((await service.readAll('u','c','d')).pages.map(p=>p.page),[1,2]);
 assert.deepEqual((await service.readAll('other','c','d')).pages,[]);
 assert.deepEqual((await service.readAll('u','other','d')).pages,[]);
 await assert.rejects(service.save('other','c','d',1,{version:0,items:[]}),e=>e.statusCode===404);
});
test('all-page snapshots use the exact account/document prefix and numeric page order',async()=>{
 const service=create({dynamo:{query:async(pk,prefix)=>{
   assert.equal(pk,'USER#u');assert.equal(prefix,'COURSE#c#NOTES#d#');
   return [{page:10,version:1,items:[item]},{page:2,version:3,items:[]}];
 }}});
 assert.deepEqual((await service.readAll('u','c','d')).pages.map(p=>p.page),[2,10]);
});
test('Dynamo saves use conditional transactions and document guards',async()=>{
 let writes;
 const service=create({dynamo:{get:async(_pk,sk)=>sk.includes('#DOC#')?{hasSourcePdf:true}:null,transactPut:async w=>{writes=w;}}});
 await service.save('u','c','d',2,{version:0,items:[item]});
 assert.equal(writes[0].createOnly,true);assert.equal(writes[1].checkOnly,true);assert.equal(writes[0].data.kind,'courseNotes');
 const conflicting=create({dynamo:{get:async(_pk,sk)=>sk.includes('#DOC#')?{hasSourcePdf:true}:null,transactPut:async()=>{throw Object.assign(new Error(),{code:'TransactionCanceledException'});}}});
 await assert.rejects(conflicting.save('u','c','d',2,{version:0,items:[]}),e=>e.statusCode===409);
});

test('sticky notes validate nested ink and reject malformed, recursive or oversized content',()=>{
 const note={type:'sticky',x:.1,y:.2,w:.3,h:.25,background:'#fff2a8',text:'中文便签',ink:[item]};
 assert.deepEqual(validate({version:0,items:[note]}),[note]);
 for(const bad of [{...note,w:1},{...note,h:-1},{...note,background:'url(x)'},{...note,ink:[note]},{...note,text:'x'.repeat(4001)},{...note,ink:Array(501).fill(item)}])assert.throws(()=>validate({version:0,items:[bad]}));
});
