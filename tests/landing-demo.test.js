const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { sendPublicVideo } = require('../lib/public-video');
function page({reduced = false, reject = false} = {}) {
  let observer; const handlers = {}, nodes = {};
  const element = () => ({hidden:true,attrs:{},events:{},style:{setProperty(){}},classList:{toggle(){}},addEventListener(k,f){this.events[k]=f;},setAttribute(k,v){this.attrs[k]=v;}});
  ['video','.demo-film','.demo-float','[data-film-play]','[data-film-replay]','[data-film-fullscreen]','.demo-scrub','.demo-start','[data-film-caption]'].forEach(k=>nodes[k]=element());
  const video = Object.assign(nodes.video,{paused:true,currentTime:0,duration:30.6,ended:false,plays:0,play(){this.plays++;if(reject)return Promise.reject(Error('Autoplay denied'));this.paused=false;this.events.playing();return Promise.resolve();},pause(){this.paused=true;this.events.pause?.();}});
  const root={querySelector:k=>nodes[k],querySelectorAll:()=>[]};
  const doc={hidden:false,querySelector:()=>root,addEventListener:(k,v)=>handlers[k]=v};
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/landing-demo.js'),'utf8'), {document:doc,window:{IntersectionObserver:true},matchMedia:()=>({matches:reduced,addEventListener(){}}),IntersectionObserver:class{constructor(fn){observer=fn;}observe(){}}});
  return {nodes,video,doc,handlers,visible:v=>observer([{isIntersecting:v}]),click:k=>nodes[k].events.click()};
}
test('video waits for visibility, pauses in background, and preserves an explicit pause',async()=>{
  const p=page();assert.equal(p.video.plays,0);p.visible(true);await new Promise(setImmediate);assert.equal(p.video.paused,false);
  p.doc.hidden=true;p.handlers.visibilitychange();assert.equal(p.video.paused,true);
  p.doc.hidden=false;p.handlers.visibilitychange();await new Promise(setImmediate);assert.equal(p.video.paused,false);
  p.click('[data-film-play]');p.visible(false);p.visible(true);assert.equal(p.video.paused,true);
});
test('reduced motion and autoplay denial retain a working manual play entry',async()=>{
  const p=page({reduced:true});p.visible(true);assert.equal(p.video.plays,0);assert.equal(p.nodes['.demo-start'].hidden,false);
  p.click('.demo-start');await new Promise(setImmediate);assert.equal(p.video.paused,false);
  const blocked=page({reject:true});blocked.visible(true);await new Promise(setImmediate);assert.equal(blocked.nodes['.demo-start'].hidden,false);
});
test('seek, replay and errors use native video state',async()=>{
 const p=page();p.visible(true);await new Promise(setImmediate);p.nodes['.demo-scrub'].value=50;p.nodes['.demo-scrub'].events.input();assert.equal(p.video.currentTime,15.3);
 p.click('[data-film-replay]');assert.equal(p.video.currentTime,0);p.video.events.error();assert.equal(p.video.controls,true);assert.equal(p.nodes['.demo-float'].hidden,true);
});
test('public video supports bounded, open and suffix ranges, rejects invalid ranges and honors HEAD',()=>{
 const bytes=Buffer.from('0123456789');
 function get(range,method='GET'){const result={};sendPublicVideo({method,headers:range?{range}:{}},{writeHead:(status,headers)=>Object.assign(result,{status,headers}),end:body=>result.body=body},bytes);return result;}
 assert.equal(get().status,200);assert.equal(get('bytes=2-4').body.toString(),'234');assert.equal(get('bytes=7-').body.toString(),'789');assert.equal(get('bytes=-3').body.toString(),'789');assert.equal(get('bytes=8-99').headers['content-range'],'bytes 8-9/10');
 for(const range of ['bytes=10-','bytes=4-2','bytes=-0','bytes=0-1,3-4','garbage']) assert.equal(get(range).status,416);
 assert.equal(get(undefined,'HEAD').body,undefined);assert.equal(get(undefined,'HEAD').headers['content-length'],10);
});
