"use strict";
const crypto = require("node:crypto");
const recognition = require("./grade-preview-recognition");
const { renderSource } = require("./study-citations");
const fail = (statusCode,message) => Object.assign(new Error(message),{statusCode});
const MAX_DOCUMENTS = 8;
const placeholder = /No readable (?:document )?text (?:was )?extracted|inspect the original PDF page visuals/i;
const readable = (doc) => typeof doc.text === "string" && !!doc.text.trim() && !placeholder.test(doc.text);
const eligible = (doc) => doc.type !== "Schedule" && !String(doc.title).startsWith("[SCHEDULE_ITEM]");
const revision = (doc) => crypto.createHash("sha256").update(JSON.stringify([doc.id,doc.title,doc.type,doc.text || "",doc.sourcePages || [],!!doc.hasSourcePdf,doc.updatedAt || doc.createdAt || ""])).digest("hex");
const reference = (doc) => ({id:doc.id,name:String(doc.title).slice(0,160),revision:revision(doc)});
function describe(doc) {
  const syllabus = /syllabus|course\s*(?:outline|syllabus)|教学大纲|课程大纲/i.test(doc.title);
  const grading = /(?:homework|assignment|quiz|midterm|final|assessment|作业|小测|期中|期末|评分)[^\n]{0,100}\d+(?:\.\d+)?\s*%|grading\s+(?:scheme|policy|breakdown)|评分(?:规则|构成|标准)/i.test(doc.text || "");
  const lookup = /(?:grades?|marks?|scores?|成绩)[^\n]{0,100}(?:https?:|posted|view|check|查询|查看)/i.test(doc.text || "");
  return { id:doc.id,name:doc.title,type:doc.type,updatedAt:doc.updatedAt || doc.createdAt || "",readable:readable(doc),
    canExtract:readable(doc) || !!doc.hasSourcePdf, suggested:(syllabus || grading || lookup) && (readable(doc) || !!doc.hasSourcePdf),
    reason:syllabus?"syllabus":grading?"grading":lookup?"lookup":"material" };
}
function reviewSources(value) {
  if (!Array.isArray(value) || !value.length || value.length>MAX_DOCUMENTS || new Set(value.map(ref=>ref?.id)).size!==value.length
    || value.some(ref=>!ref || typeof ref.id!=="string" || !ref.id || ref.id.length>100 || !/^[a-f0-9]{64}$/.test(ref.revision) || typeof ref.name!=="string" || ref.name.length>160)) throw fail(400,"资料确认信息无效，请重新提取。");
  return value.map(({id,name,revision})=>({id,name,revision}));
}
function assertCurrent(refs,documents) {
  if (refs.some(ref=>!documents.some(doc=>doc && eligible(doc) && doc.id===ref.id && revision(doc)===ref.revision))) throw fail(409,"课程资料已修改或删除，请刷新页面后重新提取；尚未保存评分规则。");
}
function storedEvidence(value) {
  if(value===undefined) return [];
  if(!Array.isArray(value) || value.length>4 || value.some(ref=>!ref || typeof ref.documentId!=="string" || ref.documentId.length>100 || typeof ref.sourceName!=="string" || ref.sourceName.length>160 || typeof ref.quote!=="string" || !ref.quote.trim() || ref.quote.length>1200)) throw fail(400,"评分原文信息无效。");
  return value.map(ref=>({documentId:ref.documentId,sourceName:ref.sourceName,quote:ref.quote,page:Number.isInteger(ref.page) && ref.page>0?ref.page:null,verified:ref.verified===true}));
}
function passages(doc) {
  if (doc.text.length<=24000) return {text:doc.text,excerpted:false};
  const ranges=[];
  const cue=/grading|assessment|weight(?:ing)?|syllabus|homework|assignment|quiz|midterm|final\s+exam|gradebook|评分|占比|成绩|期中|期末/gi;
  for(const match of doc.text.matchAll(cue)) {
    const start=Math.max(0,match.index-700),end=Math.min(doc.text.length,match.index+1900);
    const previous=ranges.at(-1);
    if(previous && start<=previous.end && end-previous.start<=6000) previous.end=Math.max(previous.end,end);
    else ranges.push({start,end});
  }
  // Score all passages, including the end of long files, instead of clipping to page one.
  const ranked=ranges.map(range=>({...range,score:(doc.text.slice(range.start,range.end).match(/\d+(?:\.\d+)?\s*%|grading|weight|评分|占比|成绩查询/gi)||[]).length})).sort((a,b)=>b.score-a.score || a.start-b.start);
  const selected=[]; let used=0;
  for(const range of ranked) { const end=Math.min(range.end,range.start+6000); if(used+end-range.start>24000) continue; selected.push({...range,end});used+=end-range.start; }
  if(!selected.length) selected.push({start:0,end:6000},{start:Math.max(6000,doc.text.length-6000),end:doc.text.length});
  selected.sort((a,b)=>a.start-b.start);
  return { text:selected.map(range=>renderSource({name:doc.title,text:doc.text,sourcePages:doc.sourcePages,origin:"Saved course material",reference:doc.id},doc.text.slice(range.start,range.end),"selected grading passage",range.start)).join("\n\n"),excerpted:true };
}
async function prepare(documents,readOriginal) {
  const content=[], sources=[]; let nativeBytes=0;
  for(const doc of documents) {
    if(readable(doc)) {
      const part=passages(doc);
      const text=part.excerpted?part.text:renderSource({name:doc.title,text:doc.text,sourcePages:doc.sourcePages,origin:"Saved course material",reference:doc.id},doc.text);
      content.push({type:"input_text",text:`Source documentId: ${doc.id}\n${text}`}); sources.push({...doc,excerpted:part.excerpted,native:false});
    } else if(doc.hasSourcePdf) {
      const original=await readOriginal(doc.id);
      let file; try { file=recognition.upload({kind:"syllabus",name:doc.title,mime:"application/pdf",dataUrl:original?.dataUrl}); }
      catch { throw fail(400,`「${doc.title}」目前没有可读文字，原始 PDF 也无法直接读取。请使用可读资料或手动设置。`); }
      nativeBytes+=original.size || Math.ceil(original.dataUrl.length*3/4);
      if(nativeBytes>24*1024*1024) throw fail(400,"所选扫描件较大，请先选择主要 syllabus，再补充其他资料。");
      content.push({type:"input_text",text:`Source documentId: ${doc.id}\nFile name (untrusted): ${doc.title}\nUse this retained original PDF. No readable extracted text is available.`},file.content);
      sources.push({...doc,native:true,pages:original.pages || null,excerpted:false});
    } else throw fail(400,`「${doc.title}」还没有可读取的内容，请选择其他课程资料。`);
  }
  return {content,sources};
}
function requestBody(prepared,model) {
  const base=recognition.requestBody({kind:"syllabus",name:"Selected saved course materials",content:{type:"input_text",text:""}},model);
  return {...base,instructions:base.instructions+'\nStudyBridge saved-course-grades/v1. Extract one coherent grading plan ONLY from the supplied saved sources. Each category MUST include sourceRefs:[{documentId,quote,page:integer|null}]. documentId must be one of the supplied IDs. quote must be a short verbatim source excerpt supporting the category and weight, preserving original language. Do not assign a page unless given by a verified PDF page marker or inspected original. A source may be excerpted: never claim complete coverage. If sources conflict, do not silently choose or combine incompatible totals; state the conflict in that category specialRule and return warnings:[string]. Do not import actual achieved scores or change existing records. Do not invent missing information. Additional course announcements may explain where to view grades without defining weights.',input:[{role:"user",content:prepared.content}]};
}
function evidence(raw,sources) {
  const refs=Array.isArray(raw.sourceRefs)?raw.sourceRefs:[];
  const result=[];
  for(const ref of refs.slice(0,4)) {
    const doc=sources.find(doc=>doc.id===ref?.documentId);
    const quote=typeof ref?.quote==="string"?ref.quote.trim():"";
    if(!doc || quote.length<3 || quote.length>1200) continue;
    const match=doc.native?null:recognition.matchQuote(doc.text,quote);
    if(!doc.native && !match) continue;
    const page=match?doc.sourcePages?.find(page=>page.start<=match.index && page.end>match.index)?.page
      :Number.isInteger(ref.page) && ref.page>0 && doc.pages && ref.page<=doc.pages?ref.page:null;
    result.push({documentId:doc.id,sourceName:String(doc.title).slice(0,160),page:page || null,quote:match?match[0]:quote,verified:!!match});
  }
  if(!result.length) throw fail(502,"提取结果缺少可核对的评分原文，请重试或手动设置；尚未保存任何规则。");
  return result;
}
function parse(output,prepared) {
  let raw; try { raw=JSON.parse(String(output).trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"")); } catch { throw fail(502,"评分规则提取未完成，请重试。"); }
  const result=recognition.parseRecognition("syllabus",JSON.stringify(raw));
  result.categories.forEach((category,index)=>{category.ruleEvidence=evidence(raw.categories[index],prepared.sources);category.evidence=category.ruleEvidence.map(ref=>ref.quote).join("\n");});
  return {...result,sources:prepared.sources.map(doc=>({...reference(doc),excerpted:doc.excerpted,native:doc.native}))};
}
module.exports={MAX_DOCUMENTS,eligible,readable,revision,reference,describe,reviewSources,assertCurrent,storedEvidence,prepare,requestBody,parse};
