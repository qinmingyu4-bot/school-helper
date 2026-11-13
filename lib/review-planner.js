'use strict';
const schedule=require('../public/schedule-import');
function prioritize(topics, recent, events, courseId, now=Date.now()) {
  const exams=events.filter(e=>e.courseId===courseId && !e.completedAt && /exam|midterm|final|考试|期中|期末/i.test(e.title||'') && schedule.instant(e,'startsAt',e.timeZone||'UTC')>now).sort((a,b)=>schedule.instant(a,'startsAt',a.timeZone||'UTC')-schedule.instant(b,'startsAt',b.timeZone||'UTC'));
  const exam=exams[0];
  return topics.filter(t=>!t.sourceStale && t.sources?.length).map(t=>{
    const mistakes=recent.filter(r=>r.topicId===t.id && r.submittedAt && r.score<3).length;
    const existing=events.find(e=>e.courseId===courseId && e.learningTopicId===t.id && !e.completedAt && schedule.instant(e,'startsAt',e.timeZone||'UTC')>now);
    const due=Date.parse(t.nextReviewAt)||now;
    const examSoon=exam && schedule.instant(exam,'startsAt',exam.timeZone||'UTC')-now<=7*86400000;
    const priority=(t.status==='needs_review'?50:0)+Math.min(mistakes,5)*10+(due<=now?20:0)+(examSoon?25:0);
    return {topicId:t.id,title:t.title,mistakes,priority,dueAt:new Date(due).toISOString(),exam:exam?{title:exam.title,startsAt:exam.startsAt,timeZone:exam.timeZone}:null,planned:existing?{startsAt:existing.startsAt,timeZone:existing.timeZone,docId:existing.docId}:null,reason:mistakes>1?'反复答错，优先复习':t.status==='needs_review'?'上次练习需要巩固':examSoon?'近期有考试，建议检查理解':due<=now?'已到建议复习时间':'按学习节奏复习'};
  }).sort((a,b)=>Number(!!a.planned)-Number(!!b.planned)||b.priority-a.priority||a.dueAt.localeCompare(b.dueAt));
}
function slots(recommendation,events,{now=Date.now(),timeZone='UTC',minutes=15,from='09:00',to='21:00'}={}){
  if(!Number.isInteger(minutes)||minutes<5||minutes>120||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(from)||!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(to)||from>=to||to>'23:59')throw Object.assign(new Error('请选择有效的可用时段与时长。'),{statusCode:400});
  try { new Intl.DateTimeFormat('en',{timeZone}).format(); } catch { throw Object.assign(new Error('安排时区无效。'),{statusCode:400}); }
  if(recommendation.planned)return [];
  const exam=recommendation.exam ? schedule.instant(recommendation.exam,'startsAt',recommendation.exam.timeZone||timeZone) : null;
  const deadline=Math.min(now+7*86400000,exam || Infinity);
  const start=Math.max(now+5*60000,Math.min(Date.parse(recommendation.dueAt), deadline-86400000));
  const result=[];
  for(let instant=Math.ceil(start/900000)*900000;instant+minutes*60000<=deadline && result.length<3;instant+=900000){
    const wall=schedule.wallTime(new Date(instant).toISOString(),timeZone),end=schedule.wallTime(new Date(instant+minutes*60000).toISOString(),timeZone);
    if(wall.slice(11,16)<from||end.slice(11,16)>to||wall.slice(0,10)!==end.slice(0,10))continue;
    if(events.some(e=>!e.completedAt && schedule.instant(e,'startsAt',e.timeZone||timeZone)<instant+minutes*60000 && (schedule.instant(e,'endsAt',e.timeZone||timeZone)||schedule.instant(e,'startsAt',e.timeZone||timeZone)+30*60000)>instant))continue;
    result.push(wall.slice(0,16));instant+=Math.max(0,minutes-15)*60000;
  }
  return result;
}
module.exports={prioritize,slots};
