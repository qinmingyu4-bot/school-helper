"use strict";
const { validate } = require("../public/course-notes-model");
const fail = (statusCode, message) => Object.assign(new Error(message), { statusCode });
const isNoteSource = doc => Boolean(doc?.blankNote || doc?.hasSourcePdf);
const blankPdfBytes = new Map();
async function blankPdf(orientation) {
  const landscape = orientation === 'landscape';
  if (!blankPdfBytes.has(landscape)) {
    const { PDFDocument, PageSizes } = require('pdf-lib');
    const pdf = await PDFDocument.create();
    const [width, height] = PageSizes.A4;
    pdf.addPage(landscape ? [height, width] : [width, height]);
    blankPdfBytes.set(landscape, Buffer.from(await pdf.save()));
  }
  return blankPdfBytes.get(landscape);
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
      const doc = s.documents[d];
      if (!isNoteSource(doc) || doc.userId !== u || doc.courseId !== c) throw fail(404,'Note source not found.');
      s.courseNotes ||= {};
      const k = `${u}#${key(u,c,d,p)}`;
      return s.courseNotes[k] = prepare(s.courseNotes[k]);
    });
    const pk = `USER#${u}`, sk = key(u,c,d,p);
    const previous = await db.dynamo.get(pk,sk,{consistent:true});
    const result = prepare(previous);
    const doc = await db.dynamo.get(pk,`COURSE#${c}#DOC#${d}`,{consistent:true});
    if (!isNoteSource(doc)) throw fail(404,'Note source not found.');
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
module.exports = {create,validate,isNoteSource,blankPdf};
