const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function demo() {
  const html = fs.readFileSync(require.resolve('../public/landing.html'), 'utf8');
  const inputs = [...html.matchAll(/<input\b[^>]*data-grade="(?:final|total)"[^>]*>/g)].map(([tag]) => {
    const attrs = Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], m[2]]));
    return {
      ...attrs, dataset: { grade: attrs['data-grade'] }, events: {},
      style: { setProperty(key, value) { this[key] = value; } },
      get valueAsNumber() { return this.value === '' ? NaN : Number(this.value); },
      addEventListener(event, handler) { this.events[event] = handler; }
    };
  });
  const controls = { querySelectorAll: () => inputs, closest: () => ({ classList: { add() {} } }) };
  vm.runInNewContext(fs.readFileSync(require.resolve('../public/landing-grades.js'), 'utf8'), {
    document: { querySelector: selector => selector === '[data-grade-demo]' ? controls : {} }
  });
  const get = (grade, type = 'number') => inputs.find(x => x.dataset.grade === grade && x.type === type);
  return { get, set(grade, type, value, event = 'input') { const field = get(grade, type); field.value = value; field.events[event](); } };
}

test('both tracks represent scores out of 100 and follow each other in both directions', () => {
  const p = demo();
  for (const grade of ['final', 'total']) {
    assert.equal(p.get(grade, 'range').min, '0');
    assert.equal(p.get(grade, 'range').max, '100');
  }
  p.set('final', 'range', '10.47');
  assert.equal(p.get('final').value, '10.47');
  assert.equal(p.get('total').value, '46.19');
  assert.equal(p.get('final', 'range').style['--grade-progress'], '10.47%');
  assert.equal(p.get('total', 'range').style['--grade-progress'], '46.19%');
  p.set('total', 'range', '75.25');
  assert.equal(p.get('final').value, '83.13');
  assert.equal(p.get('total').value, '75.25');
});

test('full-scale total track respects the possible course totals at both extremes', () => {
  const p = demo();
  p.set('total', 'range', '0');
  assert.equal(p.get('final').value, '0.00');
  assert.equal(p.get('total', 'range').value, '42.00');
  p.set('total', 'range', '100');
  assert.equal(p.get('final').value, '100.00');
  assert.equal(p.get('total', 'range').value, '82.00');
});

test('number editing permits partial decimals, formats on commit and restores empty input', () => {
  const p = demo();
  assert.equal(p.get('final').value, '80.00');
  assert.equal(p.get('total').value, '74.00');
  p.set('final', 'number', '10.');
  assert.equal(p.get('final').value, '10.');
  assert.equal(p.get('total').value, '46.00');
  p.set('final', 'number', '10.4', 'change');
  assert.equal(p.get('final').value, '10.40');
  p.set('final', 'number', '', 'change');
  assert.equal(p.get('final').value, '10.40');
  p.set('total', 'number', '99', 'change');
  assert.equal(p.get('total').value, '82.00');
  assert.equal(p.get('final').value, '100.00');
  p.set('final', 'number', '100', 'blur');
  assert.equal(p.get('final').value, '100.00');
});
