'use strict';
const {createHash}=require('node:crypto');
const batch=require('./schedule-batch');
const version=doc=>createHash('sha256').update(JSON.stringify([doc.updatedAt,doc.text])).digest('hex');
const fail=(message)=>Object.assign(new Error(message),{statusCode:409});
function candidates(item,courses,documents,userId){
  const normalized=s=>String(s||'').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
  return batch.storedItems(courses,documents,userId).filter(e=>!e.completedAt).map(e=>{
    const doc=documents.find(d=>d.id===e.docId);const score=(item.course&&normalized(e.course)===normalized(item.course)?5:0)+(normalized(e.title).includes(normalized(item.title))?3:0);
    return {docId:e.docId,title:e.title,startsAt:e.startsAt,endsAt:e.endsAt,timeZone:e.timeZone,course:e.course,version:version(doc),score};
  }).sort((a,b)=>b.score-a.score||a.startsAt.localeCompare(b.startsAt)).slice(0,100);
}
function prepare(userId,items,courses,documents){
  const additions=items.filter(i=>!i.changeAction || i.changeAction==='add');
  const result=additions.length?batch.prepareBatch(userId,additions,courses,documents):{saved:0,duplicates:0,records:[],courses:[]};
  result.changed=[];result.deleted=[];result.originals=[];
  const used=new Set();
  for(const item of items.filter(i=>i.changeAction&&i.changeAction!=='add')){
    const doc=documents.find(d=>d.id===item.targetId&&d.userId===userId&&courses.some(c=>c.id===d.courseId&&c.userId===userId));
    if(!doc||doc.type!=='Schedule'||used.has(doc.id)||version(doc)!==item.targetVersion)throw fail('原日程已变化或不存在，请刷新邮件通知并重新核对。');
    used.add(doc.id);const old=JSON.parse(doc.text);if(old.completedAt)throw fail('原日程已经完成，请重新核对。');
    result.originals.push(doc);
    if(item.changeAction==='cancel'){result.deleted.push(doc);result.changed.push({action:'cancel',before:old,docId:doc.id});}
    else if(item.changeAction==='update'){
      const clean=batch.normalizeBatch({items:[item]})[0];
      const next={...old,...clean,course:old.course,mailboxUpdatedAt:new Date().toISOString()};
      result.records.push({...doc,title:`[SCHEDULE_ITEM] ${clean.title}`,text:JSON.stringify(next),updatedAt:new Date().toISOString()});
      result.changed.push({action:'update',before:old,after:next,docId:doc.id});
    }else throw fail('邮件变更操作无效。');
    result.saved++;
  }
  return result;
}
module.exports={version,candidates,prepare};
