const {test}=require('node:test');
const assert=require('node:assert/strict');
const M=require('../public/office-model');
const ui=require('../public/i18n');
global.window={StudyBridgeI18n:ui,addEventListener(){}};
global.document={activeElement:null,documentElement:{style:{}}};

test('editor table schema supports merged cells and literal find across styled text',async()=>{
  const {getSchema}=require('@tiptap/core');const StarterKit=require('@tiptap/starter-kit').default;
  const {Table,TableRow,TableCell,TableHeader,ParagraphLayout,findText}=await import('../client/office-basics.mjs');
  const schema=getSchema([StarterKit,ParagraphLayout,Table,TableRow,TableCell,TableHeader]);
  assert.equal(schema.nodes.table.spec.tableRole,'table');assert.equal(schema.nodes.tableCell.spec.tableRole,'cell');
  const doc=schema.nodeFromJSON({type:'doc',content:[{type:'paragraph',content:[{type:'text',text:'Hello '},{type:'text',text:'world',marks:[{type:'bold'}]}]}]});
  assert.deepEqual(findText(doc,'lo wor'),[{from:4,to:10}]);
  const table={type:'table',content:[{type:'tableRow',content:[{type:'tableCell',attrs:{colspan:1,rowspan:2},content:[{type:'paragraph'}]}]},{type:'tableRow'}]};
  schema.nodeFromJSON(M.normalize('docs',{...M.fresh('docs'),content:{type:'doc',content:[table]}}).content).check();
});
test('large worksheet rendering mounts at most 60 rows and never creates 100000 inputs',async()=>{
  const {Workspace}=await import('../client/office-editor.mjs');
  const w=new Workspace({userId:'test'},'sheets');w.newProject();
  w.sheet().rows=1000;w.sheet().cols=100;
  let html='';const tbody={set innerHTML(value){html=value;}};
  const grid={querySelector:key=>key==='tbody'?tbody:null},scroll={scrollTop:0};
  w.host={querySelector:key=>key==='.office-grid'?grid:key==='.office-grid-scroll'?scroll:null};
  w.refreshCells=()=>{};w.paintRange=()=>{};
  w.renderGrid();assert.equal((html.match(/data-cell=/g)||[]).length,6000);assert.match(html,/height:28200px/);
  scroll.scrollTop=29000;w.renderGrid();assert((html.match(/data-cell=/g)||[]).length<=6000);assert.match(html,/data-cell="A1000"/);
});
test('slide multi-selection aligns, reorders and pastes fresh editable elements as undoable changes',async()=>{
  const {Workspace}=await import('../client/office-editor.mjs');
  const w=new Workspace({userId:'test'},'slides');w.newProject();w.changed=()=>{};w.paintSlides=()=>{};
  const [a,b]=w.slide().elements;a.x=10;b.x=40;w.elementId=a.id;w.selectedElements=new Set([a.id,b.id]);
  await w.basicsAction('elements-align-left');assert.equal(b.x,10);assert.equal(w.undo.length,1);
  await w.basicsAction('elements-copy');await w.basicsAction('elements-paste');assert.equal(w.slide().elements.length,4);
  assert.equal(new Set(w.slide().elements.map(e=>e.id)).size,4);
  const ids=[...w.selectedElements];await w.basicsAction('elements-back');assert.deepEqual(w.slide().elements.slice(0,2).map(e=>e.id),ids);
  await w.basicsAction('element-delete');assert.equal(w.slide().elements.length,2);
});
test('bulk styles retain cell values, validate capacity before mutation, and clear only the selected contents',async()=>{
  const {Workspace}=await import('../client/office-editor.mjs');const w=new Workspace({userId:'test'},'sheets');w.newProject();w.changed=()=>{};w.refreshCells=()=>{};w.paintRange=()=>{};
  w.sheet().cells={A1:{value:'12'},B1:{value:'=A1*2'},C1:{value:'keep'}};w.cell='A1';w.selectionEnd='B2';w.bulkStyle('bold',true);
  assert.equal(w.sheet().cells.B1.value,'=A1*2');assert(w.sheet().cells.B2.style.bold);
  await w.basicsAction('range-clear');assert.equal(w.sheet().cells.C1.value,'keep');assert.equal(w.sheet().cells.A1.value,'');assert(w.sheet().cells.A1.style.bold);
  w.sheet().rows=1000;w.sheet().cols=100;w.selectionEnd='CV1000';const before=JSON.stringify(w.current.model);
  assert.throws(()=>w.bulkStyle('color','#000000'));assert.equal(JSON.stringify(w.current.model),before);
});
