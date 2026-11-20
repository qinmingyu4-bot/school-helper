const {test}=require('node:test');
const assert=require('node:assert/strict');
const model=require('../public/course-notes-model');
const size={width:1000,height:600};
const pen={type:'pen',width:.003,color:'#24344a',points:[[.2,.5],[.8,.5]]};
test('eraser sweeps hit crossed and near strokes, dots and text, including zoomed landscape pages',()=>{
 assert.equal(model.hit(pen,[.5,.1],[.5,.9],size),true);
 assert.equal(model.hit(pen,[.1,.1],[.9,.1],size),false);
 assert.equal(model.hit(pen,[.5,.51],[.5,.51],size),true);
 assert.equal(model.hit({...pen,points:[[.5,.5]]},[.4,.5],[.6,.5],size),true);
 assert.equal(model.hit(pen,[.5,.51],[.5,.51],{width:3000,height:1800}),false);
 const text={type:'text'},box={x:100,y:100,width:200,height:40};
 assert.equal(model.hit(text,[0,.2],[1,.2],size,box),true);
 assert.equal(model.hit(text,[0,.5],[1,.5],size,box),false);
});
test('annotation serialization preserves Chinese/multiline notes, highlight alpha and single-point ink safely',()=>{
 const svg=model.markup([{type:'text',x:.1,y:.2,width:.02,color:'#123456',text:'中文 <script>\n第二行'}, {...pen,type:'highlight'},{...pen,points:[[.5,.5]]}],1.5);
 assert.match(svg,/中文 &lt;script&gt;/);assert.match(svg,/第二行/);
 assert.match(svg,/dy="25"/);assert.match(svg,/stroke-opacity="0.3"/);
 assert.match(svg,/500,750 500.01,750/);
 assert.doesNotMatch(svg,/<script>/);
 assert.notEqual(model.cursor('eraser','#123456'),model.cursor('pen','#123456'));
 assert.equal(model.cursor('hand'),'grab');assert.equal(model.cursor('text'),'text');
});
test('export overlay placement inverts cropped/rotated PDF.js viewports without moving the marks',()=>{
 // Four orthogonal rotations plus scaled UserUnit and a nonzero crop origin.
 for(const transform of [[1,0,0,-1,-20,420],[0,1,1,0,-30,-20],[-1,0,0,1,620,-30],[0,-1,-1,0,430,620],[2,0,0,-2,-40,840]]) {
   const viewport={transform,width:600,height:400};
   const p=model.placement(viewport),angle=p.angle*Math.PI/180;
   const pdfCorners=[[p.x,p.y],[p.x+p.width*Math.cos(angle),p.y+p.width*Math.sin(angle)],[p.x-p.height*Math.sin(angle),p.y+p.height*Math.cos(angle)]];
   const [a,b,c,d,e,f]=transform,expected=[[0,400],[600,400],[0,0]];
   pdfCorners.forEach(([x,y],i)=>{assert.ok(Math.abs(a*x+c*y+e-expected[i][0])<1e-8);assert.ok(Math.abs(b*x+d*y+f-expected[i][1])<1e-8);});
 }
});
