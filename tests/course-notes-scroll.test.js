const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../public/course-notes.js'), 'utf8');
const bind = source.slice(source.indexOf('  function bindPaperWheel('), source.indexOf('  function bind()'));

function fixture(initialTop = 90) {
  let wheel;
  const root = {scrollTop:400, clientHeight:600};
  const viewport = {
    parentElement:root, scrollTop:initialTop, closest:()=>null,
    addEventListener(type, listener) { assert.equal(type, 'wheel'); wheel = listener; }
  };
  vm.runInNewContext(bind + ';bindPaperWheel(viewport)', {viewport, document:{scrollingElement:root}, getComputedStyle:()=>({lineHeight:'20px', overflowY:'auto'})});
  function scroll(timeStamp, deltaY, options = {}) {
    let prevented = false;
    wheel({timeStamp, deltaY, deltaX:0, deltaMode:0, cancelable:true, ...options, preventDefault(){prevented = true;}});
    if (!prevented && !options.ctrlKey) viewport.scrollTop = Math.max(0, viewport.scrollTop + deltaY);
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
  viewport.parentElement = {parentElement:root,scrollTop:35,clientHeight:180};
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
