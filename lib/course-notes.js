"use strict";
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
function validate(body) {
  if (!body || !Number.isSafeInteger(body.version) || body.version < 0 || !Array.isArray(body.items) || body.items.length > 2000) throw fail(400, 'Invalid notes.');
  const unit = n => Number.isFinite(n) && n >= 0 && n <= 1;
  const items = body.items.map(item => {
    if (!item || !['pen', 'highlight', 'text'].includes(item.type) || !/^#[0-9a-f]{6}$/i.test(item.color) || !Number.isFinite(item.width) || item.width < .0005 || item.width > .1) throw fail(400, 'Invalid annotation.');
    if (item.type === 'text') {
      if (!unit(item.x) || !unit(item.y) || typeof item.text !== 'string' || item.text.length > 4000) throw fail(400, 'Invalid text.');
      return { type: item.type, color: item.color, width: item.width, x: item.x, y: item.y, text: item.text };
    }
    if (!Array.isArray(item.points) || !item.points.length || item.points.length > 12000 || item.points.some(p => !Array.isArray(p) || p.length !== 2 || !p.every(unit))) throw fail(400, 'Invalid stroke.');
    return { type: item.type, color: item.color, width: item.width, points: item.points };
  });
  if (Buffer.byteLength(JSON.stringify(items)) > 260000) throw fail(413, 'This page is full. Please remove some annotations.');
  return items;
}
function create(db) {
  const key = (u,c,d,p) => `COURSE#${c}#NOTES#${d}#${p}`;
  async function read(u,c,d,p) {
    return (db.dynamo ? await db.dynamo.get(`USER#${u}`, key(u,c,d,p), {consistent:true}) : await db.local.read(s => s.courseNotes?.[`${u}#${key(u,c,d,p)}`])) || {version:0,items:[]};
  }
  async function save(u,c,d,p,body) {
    const items = validate(body);
    const prepare = previous => {
      if ((previous?.version || 0) !== body.version) throw fail(409, 'This page changed on another device. Your draft is preserved.');
      return {version:body.version+1,items,updatedAt:new Date().toISOString(),kind:"courseNotes",userId:u,courseId:c,documentId:d,page:p,sk:key(u,c,d,p)};
    };
    if (!db.dynamo) return db.local.write(s => {
      if (!s.documents[d] || s.documents[d].userId !== u || s.documents[d].courseId !== c || !s.documents[d].hasSourcePdf) throw fail(404,'PDF not found.');
      s.courseNotes ||= {};
      const k = `${u}#${key(u,c,d,p)}`;
      return s.courseNotes[k] = prepare(s.courseNotes[k]);
    });
    const pk = `USER#${u}`, sk = key(u,c,d,p);
    const previous = await db.dynamo.get(pk,sk,{consistent:true});
    const result = prepare(previous);
    const doc = await db.dynamo.get(pk,`COURSE#${c}#DOC#${d}`,{consistent:true});
    if (!doc?.hasSourcePdf) throw fail(404,'PDF not found.');
    try { await db.dynamo.transactPut([
      {pk,sk,type:'courseNotes',data:result,...(previous ? {expectedData:previous} : {createOnly:true})},
      {pk,sk:`COURSE#${c}#DOC#${d}`,type:'document',data:doc,expectedData:doc,checkOnly:true}
    ]); } catch(e) { if (['TransactionCanceledException','ConditionalCheckFailedException','TransactionConflictException'].includes(e.code)) throw fail(409,'This page changed on another device. Your draft is preserved.'); throw e; }
    return result;
  }
  async function readAll(u,c,d) {
    const prefix = key(u,c,d,'');
    const rows = db.dynamo ? await db.dynamo.query(`USER#${u}`,prefix)
      : await db.local.read(s => Object.entries(s.courseNotes || {}).filter(([k]) => k.startsWith(`${u}#${prefix}`)).map(([,v])=>v));
    const pages = rows.map(({page,version,items})=>({page,version,items})).sort((a,b)=>a.page-b.page);
    if (Buffer.byteLength(JSON.stringify(pages)) > 16*1024*1024) throw fail(413,'Notes are too large to export together. Export individual pages instead.');
    return {pages};
  }
  return {read,save,readAll};
}
module.exports = {create,validate};
