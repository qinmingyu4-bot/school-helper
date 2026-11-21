const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { StudyBridgeDatabase } = require('../lib/database');
const { createOfficeService } = require('../lib/office-service');
const { schema } = require('../lib/office-doc-schema');
const { EditorState } = require('@tiptap/pm/state');
const { history, undo } = require('@tiptap/pm/history');
const M = require('../public/office-model');
const { difference, applyOperations } = require('../lib/office-operations');
const { changeAxis, pasteGrid, serializeGrid, shiftCopy } = require('../lib/office-grid');
const { exportOffice } = require('../lib/office-export');
const { importOffice } = require('../lib/office-import');
const clone = v => JSON.parse(JSON.stringify(v));

async function setup(t,kind) {
  const directory=await fs.mkdtemp(path.join(os.tmpdir(),'sb-office-collab-'));
  const db=new StudyBridgeDatabase();db.dynamo=null;db.local.file=path.join(directory,'db.json');
  t.after(()=>fs.rm(directory,{recursive:true,force:true}));
  const service=createOfficeService(db),id='office_shared';
  await service.save('alice',id,{kind,version:0,name:'Project',model:M.fresh(kind)});
  const shared=await service.sharing('alice',id,true);
  return {service,db,id,shared,request:(who,body)=>service.sync({id:who,name:who},id,{ownerId:'alice',token:shared.token,peer:who,since:shared.project.version,...body})};
}
test('shared editing requires a valid link and owner-only sharing; tokens never appear in project metadata; revoke survives restart',async t=>{
  const {service,db,id,shared,request}=await setup(t,'docs');
  assert.equal(shared.token.length,64);
  assert(!JSON.stringify(await service.list('alice')).includes(shared.token));
  await assert.rejects(service.sharing('bob',id,false),e=>e.statusCode===404);
  await assert.rejects(request('bob',{token:'bad'}),e=>e.statusCode===403);
  assert.equal((await request('bob',{initial:true})).model.content.type,'doc');
  await assert.rejects(service.save('alice',id,{...shared.project,version:shared.project.version}),e=>e.statusCode===409);
  await service.sharing('alice',id,false);
  const reopened=createOfficeService(db);
  await assert.rejects(reopened.sync({id:'bob'},id,{ownerId:'alice',token:shared.token,peer:'bob',since:2}),e=>e.statusCode===403);
  assert.equal((await service.get('alice',id)).sharing,false);
});
test('two document editors rebase concurrent inserts, confirm retries once, and undo only their own edits',async t=>{
  const {request,service,id,shared}=await setup(t,'docs');
  const {DocSync,pendingSteps,receiveSteps}=await import('../client/office-doc-sync.mjs');
  const make=()=>{const e={state:EditorState.create({schema,doc:schema.nodeFromJSON(shared.project.model.content),plugins:[history(),...DocSync.config.addProseMirrorPlugins()]})};e.view={dispatch:tr=>e.state=e.state.apply(tr)};return e;};
  const a=make(),b=make();a.view.dispatch(a.state.tr.insertText('Alice',1));b.view.dispatch(b.state.tr.insertText('Bob',1));
  const aBatch={batch:'a1',steps:pendingSteps(a).map(s=>s.step.toJSON())};
  const first=await request('alice',aBatch);assert(first.accepted);receiveSteps(a,first.entries,'a1',1);
  assert.equal(pendingSteps(a).length,0);
  const retry=await request('alice',aBatch);assert(retry.accepted);assert.equal(retry.project.version,first.project.version);
  const second=await request('bob',{batch:'b1',steps:pendingSteps(b).map(s=>s.step.toJSON())});
  assert.equal(second.accepted,false);receiveSteps(b,second.entries,'',1);
  assert.equal(b.state.doc.textContent,'AliceBob');
  const accepted=await request('bob',{since:second.project.version,batch:'b2',steps:pendingSteps(b).map(s=>s.step.toJSON())});
  receiveSteps(b,accepted.entries,'b2',1);
  const remote=await request('alice',{since:first.project.version});receiveSteps(a,remote.entries,'',0);
  assert.equal(a.state.doc.textContent,b.state.doc.textContent);
  assert(undo(a.state,a.view.dispatch));
  assert.equal(a.state.doc.textContent,'Bob');
  assert.equal((await service.get('alice',id)).model.content.content[0].content[0].text,'AliceBob');
});
test('document rebasing preserves later typing during an in-flight acknowledgement and cursor positions',async()=>{
  const {DocSync,pendingSteps,receiveSteps}=await import('../client/office-doc-sync.mjs');
  const e={state:EditorState.create({schema,plugins:[history(),...DocSync.config.addProseMirrorPlugins()]})};e.view={dispatch:tr=>e.state=e.state.apply(tr)};
  e.view.dispatch(e.state.tr.insertText('A'));const first=pendingSteps(e)[0].step.toJSON();
  e.view.dispatch(e.state.tr.insertText('B'));
  receiveSteps(e,[{batch:'first',steps:[first]}],'first',1);
  assert.equal(e.state.doc.textContent,'AB');assert.equal(pendingSteps(e).length,1);assert.equal(e.state.selection.from,3);
});
test('parallel cell edits merge durably across service instances; duplicate batches and rejected changes never overwrite work',async t=>{
  const {request,service,db,id,shared}=await setup(t,'sheets');
  const before={name:shared.project.name,model:shared.project.model};
  const a=clone(before),b=clone(before);a.model.sheets[0].cells.A1={value:'10',style:{}};b.model.sheets[0].cells.B1={value:'20',style:{}};
  const second=createOfficeService(db);
  const [one,two]=await Promise.all([request('alice',{batch:'a1',changes:difference(before,a)}),second.sync({id:'bob',name:'Bob'},id,{ownerId:'alice',token:shared.token,peer:'bob',since:2,batch:'b1',changes:difference(before,b)})]);
  assert(one.accepted&&two.accepted);
  const value=await createOfficeService(db).get('alice',id);
  assert.equal(value.model.sheets[0].cells.A1.value,'10');assert.equal(value.model.sheets[0].cells.B1.value,'20');
  await assert.rejects(request('bob',{since:value.version,batch:'bad',changes:[{type:'set',path:['model','__proto__','x'],value:1}]}),e=>e.statusCode===422);
  assert.equal((await service.get('alice',id)).version,value.version);
});
test('stable-id operations preserve unrelated slide edits and reject prototype mutations',()=>{
  const base={name:'Deck',model:M.fresh('slides')},a=clone(base),b=clone(base);
  a.model.slides[0].elements.reverse();b.model.slides[0].elements[0].text='New text';
  const merged=applyOperations(b,difference(base,a));
  assert.equal(merged.model.slides[0].elements[1].text,'New text');
  assert.throws(()=>applyOperations(base,[{type:'set',path:['model','__proto__','x'],value:1}]));
});
test('row/column operations update formulas across sheets, preserve literals and styles, and reject boundary loss',()=>{
  const model=M.fresh('sheets'),s=model.sheets[0];
  s.cells={A1:{value:'2'},A2:{value:'4'},B3:{value:'=SUM($A$1:A2)'},C1:{value:'=IF(A1="A2",A2,0)'}};
  model.sheets.push({id:'second',name:'Other',rows:40,cols:12,cells:{A1:{value:'=Sheet1!A2'}}});
  const inserted=changeAxis(model,0,'row','insert',2,1);
  assert.equal(inserted.sheets[0].cells.B4.value,'=SUM($A$1:A3)');
  assert.equal(inserted.sheets[0].cells.C1.value,'=IF(A1="A2",A3,0)');
  assert.equal(inserted.sheets[1].cells.A1.value,'=Sheet1!A3');
  const removed=changeAxis(inserted,0,'row','delete',3,1);
  assert.equal(removed.sheets[1].cells.A1.value,'=#REF!');
  assert.throws(()=>changeAxis(model,0,'row','delete',1,40));
});
test('TSV paste handles quoted line breaks and formula translation; invalid paste is atomic',()=>{
  const model=M.fresh('sheets');model.sheets[0].cells.A1={value:'=B1+$C$2',style:{bold:true}};
  const range={top:1,bottom:1,left:1,right:1},text=serializeGrid(model.sheets[0],range);
  const next=pasteGrid(model,0,'A2',text,{range,cells:model.sheets[0].cells});
  assert.equal(next.sheets[0].cells.A2.value,'=B2+$C$2');assert(next.sheets[0].cells.A2.style.bold);
  assert.equal(shiftCopy('=IF(A1="B2",$B1,C$2)',1,1),'=IF(B2="B2",$B2,D$2)');
  assert.equal(pasteGrid(model,0,'A3','"a\nb"\t2').sheets[0].cells.A3.value,'a\nb');
  const before=JSON.stringify(model);assert.throws(()=>pasteGrid(model,0,'CV1000','1\t2\n3\t4'));assert.equal(JSON.stringify(model),before);
});
test('document tables and paragraph spacing round-trip through DOCX; worksheet dimensions through XLSX',async()=>{
  const model=M.fresh('docs');model.content.content=[{type:'table',content:[{type:'tableRow',content:[{type:'tableCell',attrs:{colspan:1,rowspan:1},content:[{type:'paragraph',attrs:{spaceBefore:6,spaceAfter:12,firstLine:2},content:[{type:'text',text:'Cell'}]}]}]}]}];
  schema.nodeFromJSON(M.normalize('docs',model).content).check();
  const file=await exportOffice('docs',model,'Table');const imported=await importOffice('docs','table.docx','data:'+file.mime+';base64,'+file.bytes.toString('base64'));
  const p=imported.model.content.content[0].content[0].content[0].content[0];assert.equal(p.content[0].text,'Cell');assert.equal(p.attrs.spaceAfter,12);assert.equal(p.attrs.firstLine,2);
  const sheets=M.fresh('sheets');sheets.sheets[0].columnWidths={1:180};sheets.sheets[0].rowHeights={1:60};sheets.sheets[0].cells.A1={value:'x'};
  const x=await exportOffice('sheets',sheets,'Sizes');const roundtrip=await importOffice('sheets','sizes.xlsx','data:'+x.mime+';base64,'+x.bytes.toString('base64'));
  assert.equal(roundtrip.model.sheets[0].columnWidths[1],180);assert.equal(roundtrip.model.sheets[0].rowHeights[1],60);
});

test('client retries a lost save response without duplication and retains edits made while that request was in flight',async t=>{
  const {service,shared,id}=await setup(t,'sheets');
  global.document={hidden:false,activeElement:null,documentElement:{style:{}}};
  const {CollaborationSession}=await import('../client/office-collaboration.mjs');
  let loseResponse=true;
  const w={kind:'sheets',current:{...clone(shared.project),dirty:false},host:{isConnected:true,querySelector:()=>null},undo:[],redo:[],t:v=>v,capture(){},updateStatus(){},refreshRemote(){},clearBackup:async()=>{},storeBackup:async()=>{},
    ctx:{userId:'alice',api:async(_url,{body})=>{const result=await service.sync({id:'alice',name:'Alice'},id,body);if(loseResponse){loseResponse=false;throw Error('lost response');}return result;}}};
  const session=new CollaborationSession(w,{id,ownerId:'alice'});t.after(()=>session.stop());
  w.current.model.sheets[0].cells.A1={value:'first',style:{}};w.current.dirty=true;
  await session.exchange();assert(session.flight);const version=(await service.get('alice',id)).version;
  w.current.model.sheets[0].cells.B1={value:'later',style:{}};
  await session.exchange();assert.equal((await service.get('alice',id)).version,version);assert.equal(w.current.model.sheets[0].cells.B1.value,'later');assert(w.current.dirty);
  await session.exchange();assert.equal((await service.get('alice',id)).model.sheets[0].cells.B1.value,'later');assert.equal(w.current.dirty,false);
  const model=w.current.model;await session.exchange();assert.equal(w.current.model,model,'idle heartbeat must not rebuild the model');
  w.current.dirty=true;await session.exchange();assert.equal(w.current.dirty,false,'no-op edits must not remain unsaved');
});

test('worksheet structure changes reject stale coordinate edits instead of writing into the wrong cell',async t=>{
  const {request,shared}=await setup(t,'sheets');const base={name:shared.project.name,model:shared.project.model};
  const changed={...base,model:changeAxis(base.model,0,'row','insert',1)};
  await request('alice',{batch:'structure',changes:difference(base,changed)});
  const edit=clone(base);edit.model.sheets[0].cells.A1={value:'stale'};
  await assert.rejects(request('bob',{batch:'edit',changes:difference(base,edit)}),e=>e.statusCode===409);
});
