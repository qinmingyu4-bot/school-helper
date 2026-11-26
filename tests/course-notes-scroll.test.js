const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../public/course-notes.js'), 'utf8');
const bind = source.slice(source.indexOf('  function bindPaperWheel('), source.indexOf('  function bind()'));

function fixture(initialTop = 90) {
  let wheel;
  const root = {scrollTop:400, clientHeight:600, scrollHeight:1100};
  const viewport = {
    parentElement:root, scrollTop:initialTop, clientHeight:200, scrollHeight:500, closest:()=>null,
    addEventListener(type, listener) { assert.equal(type, 'wheel'); wheel = listener; }
  };
  vm.runInNewContext(bind + ';bindPaperWheel(viewport)', {viewport, document:{scrollingElement:root}, getComputedStyle:()=>({lineHeight:'20px', overflowY:'auto'})});
  function scroll(timeStamp, deltaY, options = {}) {
    let prevented = false;
    wheel({timeStamp, deltaY, deltaX:0, deltaMode:0, cancelable:true, ...options, preventDefault(){prevented = true;}});
    if (!prevented && !options.ctrlKey) viewport.scrollTop = Math.max(0, Math.min(300,viewport.scrollTop + deltaY));
    return prevented;
  }
  return {root, viewport, scroll};
}

test('upward momentum stays on paper until the user pauses and scrolls again', () => {
  const {root, viewport, scroll} = fixture();
  scroll(0,-120);
  assert.equal(viewport.scrollTop,0);
  for(const time of [16,55,110,170,245]) scroll(time,-30);
  assert.equal(root.scrollTop,400);
  assert.equal(scroll(500,-60),true);
  assert.equal(root.scrollTop,340);
  scroll(516,-20);
  assert.equal(root.scrollTop,320);
  scroll(530,15);
  assert.equal(viewport.scrollTop,15);
  scroll(555,-30);scroll(570,-10);
  assert.equal(root.scrollTop,320);
});

test('already at top: honor wheel units and the nearest scrolling ancestor', () => {
  const {root, viewport, scroll} = fixture(0);
  viewport.parentElement = {parentElement:root,scrollTop:35,clientHeight:180,scrollHeight:300};
  scroll(300,-1);
  scroll(600,-1,{deltaMode:1});
  assert.equal(viewport.parentElement.scrollTop,15);
  assert.equal(root.scrollTop,400);
  scroll(650,-1,{deltaMode:2});
  assert.equal(viewport.parentElement.scrollTop,0);
  scroll(680,-1,{deltaMode:1});
  assert.equal(root.scrollTop,380);
});

test('zoom, horizontal movement and focused writing leave the outer page in place', () => {
  const {root, viewport, scroll} = fixture(0);
  for(const opts of [{ctrlKey:true},{metaKey:true},{deltaX:50},{shiftKey:true}]) {
    assert.equal(scroll(500,-1,opts),false);
  }
  viewport.closest=()=>({});
  scroll(800,-120);
  assert.equal(root.scrollTop,400);
});

test('bottom edge retains downward momentum, then hands a new downward gesture to the page', () => {
  const {root, viewport, scroll} = fixture(240);
  scroll(0,100); scroll(16,50); scroll(70,15);
  assert.equal(viewport.scrollTop,300);
  assert.equal(root.scrollTop,400);
  assert.equal(scroll(320,60),true);
  assert.equal(root.scrollTop,460);
  scroll(336,70);
  assert.equal(root.scrollTop,500);
  assert.equal(scroll(355,-30),false);
  assert.equal(viewport.scrollTop,270);
});

test('bottom handoff uses the nearest scrollable ancestor before the outer page', () => {
  const {root, viewport, scroll} = fixture(300);
  const panel = {scrollTop:70,clientHeight:100,scrollHeight:200,parentElement:root};
  viewport.parentElement = panel;
  scroll(0,1);
  scroll(200,1,{deltaMode:2});
  assert.equal(panel.scrollTop,100);
  assert.equal(root.scrollTop,400);
  scroll(216,1,{deltaMode:1});
  assert.equal(root.scrollTop,420);
});

for (const direction of [-1,1]) {
  for (const shortGap of [39,48,59]) {
    test('recognize renewed motion at the edge after '+shortGap+' ms, direction '+direction,()=>{
      const {root,scroll}=fixture(direction<0 ? 15 : 285);
      const move=(time,amount)=>scroll(time,amount*direction);
      move(0,24);
      move(8,18);move(24,10);move(40,7);move(56,4);move(72,2);
      assert.equal(move(72+shortGap,6),false);
      assert.equal(move(82+shortGap,9),true);
      assert.equal(root.scrollTop,400+9*direction);
    });
  }
  test('a long pause starts on the paper; a separate renewed impulse can hand off',()=>{
    const {root,scroll}=fixture(direction<0?0:300);
    const move=(t,d)=>scroll(t,d*direction);
    move(0,10); move(250,12);
    const before=root.scrollTop;
    move(2239,8);move(2247,16);move(2255,11);move(2271,6);move(2287,2);move(2303,1);move(2319,1);
    assert.equal(root.scrollTop,before);
    move(2335,6);move(2351,9);
    assert.equal(root.scrollTop,before+9*direction);
  });
}
