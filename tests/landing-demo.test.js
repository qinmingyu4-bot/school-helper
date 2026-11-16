const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
function setup(reduce = false) {
  const events = {}, frames = new Map(); let id = 0, intersect;
  const element = () => ({ hidden: false, dataset: {}, textContent: '', value: 0, attrs: {}, handlers: {}, setAttribute(k,v) {this.attrs[k]=v;}, removeAttribute(k) {delete this.attrs[k];}, addEventListener(k,v) {this.handlers[k]=v;}, matches: () => false, animate() {return {pause(){},effect:{target:this},currentTime:0};} });
  const scenes = [element(),element(),element()], chapters = [element(),element(),element()];
  const nodes = Object.fromEntries(['play','seek','replay','time'].map(k=>[k,element()]));
  const root = {querySelector: s => nodes[s.match(/data-demo-(\w+)/)?.[1]] || element(), querySelectorAll: s => s==='[data-scene]' ? scenes : s==='[data-demo-chapter]' ? chapters : []};
  const doc = {hidden:false,querySelector:()=>root,addEventListener:(k,v)=>events[k]=v};
  const preference = {matches:reduce,addEventListener:(k,v)=>events.reduce=v};
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/landing-demo.js'),'utf8'), {
    document:doc,Element:{prototype:{animate(){}}},matchMedia:()=>preference,
    window:{IntersectionObserver:true},IntersectionObserver:class {constructor(fn){intersect=fn;} observe(){}},
    requestAnimationFrame:fn=>{frames.set(++id,fn);return id;},cancelAnimationFrame:n=>frames.delete(n)
  });
  return {nodes,scenes,chapters,doc,events,frames,visible:v=>intersect([{isIntersecting:v}]), tick:t=>{const work=[...frames.values()];frames.clear();work.forEach(fn=>fn(t));}};
}
test('playback stops offscreen, preserves elapsed position and stops at the end',()=>{
  const p=setup();assert.equal(p.frames.size,0);p.visible(true);p.tick(0);p.tick(5000);assert.equal(p.nodes.seek.value,5);
  p.visible(false);assert.equal(p.frames.size,0);p.visible(true);p.tick(100000);assert.equal(p.nodes.seek.value,5);
  p.doc.hidden=true;p.events.visibilitychange();assert.equal(p.frames.size,0);p.doc.hidden=false;p.events.visibilitychange();p.tick(200000);p.tick(230000);assert.equal(p.nodes.seek.value,28);assert.equal(p.frames.size,0);
  p.nodes.replay.handlers.click();assert.equal(p.nodes.seek.value,0);assert.equal(p.frames.size,1);
});
test('reduced motion begins paused and chapters remain navigable while paused',()=>{
  const p=setup(true);p.visible(true);assert.equal(p.frames.size,0);
  p.chapters[1].handlers.click();assert.equal(p.scenes[1].hidden,false);assert.equal(p.scenes[0].hidden,true);assert.equal(p.frames.size,0);
  p.nodes.seek.value=26;p.nodes.seek.handlers.input();assert.equal(p.scenes[2].hidden,false);
});
