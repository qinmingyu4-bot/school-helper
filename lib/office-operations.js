// Stable-id paths let independent worksheet cells and slide elements merge.
// No executable expressions, prototype keys, or arbitrary document paths.
const M = require('../public/office-model');
const copy = value => JSON.parse(JSON.stringify(value));
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const badKey = key => ['__proto__', 'prototype', 'constructor'].includes(key);
function difference(before, after, path = [], result = []) {
  if (equal(before, after)) return result;
  if (Array.isArray(before) && Array.isArray(after) && [...before, ...after].every(v => v && typeof v.id === 'string')) {
    const old = new Map(before.map(v => [v.id, v]));
    const next = new Map(after.map(v => [v.id, v]));
    for (const item of before) if (!next.has(item.id)) result.push({ type: 'remove', path: [...path, { id: item.id }], before: item });
    for (const [index, item] of after.entries()) {
      if (!old.has(item.id)) result.push({ type: 'add', path, value: item, index });
      else difference(old.get(item.id), item, [...path, { id: item.id }], result);
    }
    const retained = after.filter(v => old.has(v.id)).map(v => v.id);
    if (!equal(before.filter(v => next.has(v.id)).map(v => v.id), retained)) result.push({ type: 'order', path, value: after.map(v => v.id) });
  } else if (before && after && !Array.isArray(before) && !Array.isArray(after) && typeof before === 'object' && typeof after === 'object') {
    for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
      if (badKey(key)) throw Error('Invalid field');
      if (!(key in after)) result.push({ type: 'remove', path: [...path, key], before: before[key] });
      else if (!(key in before)) result.push({ type: 'set', path: [...path, key], value: after[key] });
      else difference(before[key], after[key], [...path, key], result);
    }
  } else result.push({ type: 'set', path, value: after, ...(before === undefined ? {} : { before }) });
  return result;
}
function locate(root, path) {
  let value = root;
  for (const part of path) {
    if (typeof part === 'string') { if (badKey(part)) throw Error('Invalid field'); value = value?.[part]; }
    else if (part && typeof part.id === 'string' && Array.isArray(value)) value = value.find(v => v.id === part.id);
    else return undefined;
  }
  return value;
}
function applyOperations(source, operations, { conditional = false } = {}) {
  const result = copy(source);
  if (!Array.isArray(operations) || operations.length > 60000) throw Error('Too many changes');
  for (const op of operations) {
    if (!Array.isArray(op.path) || !op.path.length || op.path.length > 12 || !['name', 'model'].includes(op.path[0])) throw Error('Invalid change path');
    if (op.path.some(p => typeof p === 'string' ? badKey(p) || p.length > 120 : !p || typeof p.id !== 'string' || p.id.length > 100)) throw Error('Invalid change path');
    if (op.type === 'add' || op.type === 'order') {
      const array = locate(result, op.path);
      if (!Array.isArray(array)) continue; // Target deleted by a collaborator.
      if (op.type === 'add') {
        if (!op.value || typeof op.value.id !== 'string') throw Error('Invalid object');
        if (!array.some(v => v.id === op.value.id)) array.splice(Math.max(0, Math.min(array.length, Number(op.index) || 0)), 0, copy(op.value));
      } else {
        if (!Array.isArray(op.value) || op.value.some(v => typeof v !== 'string')) throw Error('Invalid order');
        const rank = new Map(op.value.map((id, i) => [id, i]));
        array.sort((a,b) => (rank.get(a.id) ?? 100000) - (rank.get(b.id) ?? 100000));
      }
      continue;
    }
    const parent = locate(result, op.path.slice(0, -1)), last = op.path.at(-1);
    if (!parent || typeof parent !== 'object') continue;
    const key = typeof last === 'string' ? last : Array.isArray(parent) ? parent.findIndex(v => v.id === last.id) : -1;
    if (key === -1) continue;
    if (conditional && !equal(parent[key], op.before)) continue;
    if (op.type === 'remove') { if (Array.isArray(parent)) parent.splice(key, 1); else delete parent[key]; }
    else if (op.type === 'set') parent[key] = copy(op.value);
    else throw Error('Invalid change');
  }
  return result;
}
function selectionRange(from, to = from) {
  const a = M.address(from), b = M.address(to);
  if (!a || !b) throw Error('Invalid range');
  return { top: Math.min(a.row,b.row), bottom: Math.max(a.row,b.row), left: Math.min(a.col,b.col), right: Math.max(a.col,b.col) };
}
function rangeKeys(range) {
  const keys = [];
  for (let r=range.top;r<=range.bottom;r++) for (let c=range.left;c<=range.right;c++) keys.push(M.col(c)+r);
  return keys;
}
module.exports = { difference, applyOperations, selectionRange, rangeKeys };
