(async function () {
  "use strict";
  const root = document.getElementById('grade-app');
  let english=(navigator.languages||[navigator.language]).find(v=>/^(zh|en)/i.test(v))?.toLowerCase().startsWith('en') || false;try{const language=localStorage.getItem('studybridge.interface-language');if(language)english=language==='en';}catch{}
  const t = (zh,en) => english ? en : zh;
  async function api(url, options={}) { const response = await fetch(url,{...options,headers:{'Content-Type':'application/json',...options.headers}}); const result=await response.json(); if(!response.ok) throw Object.assign(new Error(result.error || 'Request failed'),{status:response.status}); return result; }
  root.textContent=t('正在读取课程成绩…','Loading course grades…');
  try {
    const [me, list, theme] = await Promise.all([api('/api/me'),api('/api/courses'),api('/api/me/appearance')]);
    const courses = list.courses.filter(c=>c.name!=='Schedule & Deadlines' && c.id!=='general');
    if(!courses.length) { root.textContent=t('请先在学习区建立一门课程。','Create a course in Study first.'); const a=document.createElement('a');a.href='/app?page=study';a.textContent=t('返回学习','Back to Study');root.append(a);return; }
    let recognitionConfigured=false;
    const versions=new Map(),pending=new Map(),running=new Set(),messages=new Map(),blocked=new Set();
    const key=`studybridge.grades.draft.${me.user.id}`;
    let saved={};try{saved=JSON.parse(localStorage.getItem(key)||'{}');}catch{}
    for(const c of courses){const {plan,recognitionConfigured:configured}=await api(`/api/courses/${encodeURIComponent(c.id)}/grades`);recognitionConfigured=configured;versions.set(c.id,plan.version);Object.assign(c,plan,{code:c.name});
      const draft=saved?.[c.id]; if(draft && Number.isInteger(draft.version) && Array.isArray(draft.categories) && draft.categories.length<=20 && draft.categories.every(category=>category && typeof category.id==='string' && Array.isArray(category.items) && category.items.length<=100 && category.items.every(item=>item && window.StudyBridgeGrades.validateGrade(item.score,item.max,item.status)))){Object.assign(c,{categories:draft.categories,source:draft.source});pending.set(c.id,c);if(draft.version!==plan.version)blocked.add(c.id);versions.set(c.id,draft.version);messages.set(c.id,t('已恢复本机草稿，尚未同步；请核对后重试或导出。','Local draft restored, not synced. Review, then retry or export.'));}}
    let ui;
    function status(id){return messages.get(id)||t('已同步到账号','Saved to your account');}
    function paint(){for(const el of root.querySelectorAll('[data-save-status]'))el.textContent=status(ui?.course().id);}
    function stash(){try{const out={};for(const [id,c] of pending)out[id]={categories:c.categories,source:c.source,version:versions.get(id)};localStorage.setItem(key,JSON.stringify(out));return true;}catch{return false;}}
    async function flush(id){if(running.has(id)||blocked.has(id)||!pending.has(id))return;running.add(id);
      try{while(pending.has(id)){const c=pending.get(id), snapshot=JSON.stringify({categories:c.categories,source:c.source,version:versions.get(id)});messages.set(id,t('正在同步…','Syncing…'));paint();
        const {plan}=await api(`/api/courses/${encodeURIComponent(id)}/grades`,{method:'PUT',body:snapshot});versions.set(id,plan.version);
        const latest=pending.get(id);if(latest && JSON.stringify({categories:latest.categories,source:latest.source,version:plan.version-1})===snapshot)pending.delete(id);
        stash();messages.set(id,t('已同步到账号','Saved to your account'));paint();}
      }catch(error){if(error.status===409)blocked.add(id);messages.set(id,error.status===409?t('云端已有新版本。请导出本机草稿，再重新打开本页核对。','Cloud version changed. Export your draft, then reopen this page to compare.'):t('同步失败，草稿留在本机。可重试同步。','Sync failed. Your local draft is retained. Retry sync.'));paint();}finally{running.delete(id);}}
    const live=window.StudyBridgeGradeLive={userId:me.user.id,courses,recognitionConfigured,courseId:courses.some(c=>c.id===new URLSearchParams(location.search).get('course'))?new URLSearchParams(location.search).get('course'):courses[0].id,appearance:{palette:theme.appearance.theme,mode:theme.appearance.mode||'light',language:english?'en':'zh'},status,
      save(c){pending.set(c.id,c);const stored=stash();messages.set(c.id,blocked.has(c.id)?t('云端已有新版本。请导出本机草稿，再读取云端版本核对。','Cloud version changed. Export your draft, then reload the cloud version to compare.'):stored?t('草稿已存本机，等待同步','Draft saved locally; waiting to sync'):t('本机保存失败，请保留页面并导出草稿','Local save failed. Keep this page open and export your draft'));paint();void flush(c.id);},attach(value){ui=value;paint();},
      async action(action){const c=ui.course();if(running.has(c.id)&&action==='cloud-reload')return;if(action==='cloud-retry'){if(blocked.has(c.id)){alert(t('请先导出草稿，重新读取云端版本后再核对修改。','Export the draft and reload the cloud version before reconciling changes.'));return;}return flush(c.id);}
        if(action==='cloud-reload'){if(pending.has(c.id)&&!confirm(t('尚有本机修改。建议先导出草稿；继续将用云端版本替换本机修改。','There are local edits. Export first if needed. Continue to replace them with the cloud version?')))return;try{const {plan}=await api(`/api/courses/${encodeURIComponent(c.id)}/grades`);Object.assign(c,plan);versions.set(c.id,plan.version);pending.delete(c.id);blocked.delete(c.id);messages.delete(c.id);stash();ui.render();}catch(e){messages.set(c.id,e.message);paint();}return;}
        if(action==='draft-export'){const blob=new Blob([JSON.stringify(c,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='course-grades-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return;}
        if(action==='course-material'){const courseId=c.id;const dialog=document.createElement('dialog');dialog.className='gp-dialog';const h=document.createElement('h2');h.textContent=t('选择课程大纲','Choose course material');dialog.append(h);const select=document.createElement('select');const {documents}=await api(`/api/courses/${encodeURIComponent(courseId)}/documents`);for(const d of documents.filter(d=>d.type!=='Schedule')){const o=document.createElement('option');o.value=d.id;o.textContent=d.title;select.append(o);}dialog.append(select);const note=document.createElement('p');note.textContent=t('点击识别后将所选资料交给 AI；核对并确认后才保存规则。','Recognition sends the selected material to AI. Review and confirm before saving.');dialog.append(note);const confirm=document.createElement('button');confirm.textContent=t('开始识别','Start recognition');confirm.disabled=!select.options.length;dialog.append(confirm);const close=document.createElement('button');close.textContent=t('取消','Cancel');close.onclick=()=>dialog.close();dialog.append(close);dialog.addEventListener('close',()=>dialog.remove());document.body.append(dialog);dialog.showModal();confirm.onclick=async()=>{confirm.disabled=true;try{const result=await api(`/api/courses/${encodeURIComponent(courseId)}/grades/recognize`,{method:'POST',body:JSON.stringify({documentId:select.value})});if(!dialog.isConnected||ui.course().id!==courseId)return;const name=select.selectedOptions[0].textContent;dialog.close();ui.openUpload('syllabus');ui.beginRuleReview(result.categories,name);}catch(e){note.textContent=e.message;confirm.disabled=false;}};}
      }};
    window.addEventListener('beforeunload',e=>{if(pending.size){stash();e.preventDefault();e.returnValue='';}});
    const script=document.createElement('script');script.src='/grade-planner-preview.js?v=product-completion';document.body.append(script);
  }catch(e){root.textContent=e.message;}
})();
