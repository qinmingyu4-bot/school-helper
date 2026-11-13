'use strict';
const {test}=require('node:test'), assert=require('node:assert/strict');
const {prioritize,slots}=require('../lib/review-planner');
const changes=require('../lib/mailbox-changes');
const {parseAnalysis}=require('../lib/mailbox-service');
const drafts=require('../public/local-drafts');
test('review priorities use repeated errors and same-course exams; available slots avoid overlap and exam time',()=>{
 const now=Date.parse('2026-11-13T08:00:00Z');
 const topics=[{id:'weak',title:'Weak',sources:[{}],status:'needs_review'},{id:'strong',title:'Strong',sources:[{}],status:'answered_correct',nextReviewAt:'2026-11-16T09:00:00Z'}];
 const events=[{courseId:'a',title:'Final exam',startsAt:'2026-11-14T09:00',timeZone:'UTC'},{courseId:'b',title:'Meeting',startsAt:'2026-11-13T09:00',endsAt:'2026-11-13T10:00',timeZone:'UTC'}];
 const list=prioritize(topics,[{topicId:'weak',submittedAt:'today',score:1},{topicId:'weak',submittedAt:'today',score:2}],events,'a',now);
 assert.equal(list[0].topicId,'weak');assert.equal(list[0].mistakes,2);
 const proposed=slots(list[0],events,{now,timeZone:'UTC',from:'09:00',to:'12:00',minutes:30});assert.equal(proposed[0],'2026-11-13T10:00');assert.ok(proposed.every(s=>s<'2026-11-14T09:00'));
 assert.deepEqual(slots({...list[0],planned:{}},events,{now}),[]);
 assert.throws(()=>slots(list[0],events,{from:'22:00',to:'09:00'}));
 assert.equal(prioritize(topics,[],events,'other',now)[0].exam,null);
});
test('mailbox changes never add a replacement; enforce ownership, version and one target per confirmation',()=>{
 const courses=[{id:'a',userId:'alice',name:'Math'}],doc={id:'event',courseId:'a',userId:'alice',type:'Schedule',updatedAt:'v1',text:JSON.stringify({title:'Final exam',kind:'DDL',course:'Math',startsAt:'2026-11-20T09:00',timeZone:'UTC',completedAt:''})};
 const item={changeAction:'update',targetId:doc.id,targetVersion:changes.version(doc),title:'Final exam',kind:'DDL',startsAt:'2026-11-21T09:00',timeZone:'UTC'};
 const result=changes.prepare('alice',[item],courses,[doc]);assert.equal(result.records.length,1);assert.equal(result.records[0].id,'event');assert.equal(JSON.parse(result.records[0].text).startsAt,item.startsAt);
 assert.throws(()=>changes.prepare('bob',[item],courses,[doc]));assert.throws(()=>changes.prepare('alice',[{...item,targetVersion:'old'}],courses,[doc]));assert.throws(()=>changes.prepare('alice',[item,item],courses,[doc]));
 const canceled=changes.prepare('alice',[{...item,changeAction:'cancel'}],courses,[doc]);assert.equal(canceled.records.length,0);assert.equal(canceled.deleted[0].id,doc.id);assert.equal(canceled.changed[0].before.title,'Final exam');
 const parsed=parseAnalysis(JSON.stringify({relevant:true,summary:'Canceled',items:[{title:'Final exam',kind:'DDL',changeAction:'cancel',evidence:'Final exam canceled.'}]}),'UTC');assert.equal(parsed.items[0].changeAction,'cancel');
});
test('local drafts isolate accounts and scopes, survive recreation and surface unavailable storage',()=>{
 const values=new Map(),storage={getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};
 const first=drafts.create(storage);assert.equal(first.write('alice','quiz:a:q',{answers:[0,2,1]}),true);
 assert.deepEqual(drafts.create(storage).read('alice','quiz:a:q'),{answers:[0,2,1]});assert.equal(first.read('bob','quiz:a:q'),null);assert.equal(first.read('alice','quiz:b:q'),null);
 first.remove('alice','quiz:a:q');assert.equal(first.read('alice','quiz:a:q'),null);
 assert.equal(drafts.create({setItem(){throw Error('quota');}}).write('alice','schedule',{}),false);
});
