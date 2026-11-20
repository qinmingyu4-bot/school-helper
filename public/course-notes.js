(function () {
  'use strict';
  const t = (zh,en) => window.StudyBridgeI18n.getLanguage() === 'en' ? en : zh;
  let host, ctx, owner, pdf, course = '', doc = '', page = 1, version = 0, items = [], undo = [], redo = [];
  let mode = 'pen', color = '#24344a', width = .003, zoom = 1, dirty = false, saving, timer, busy = false, stroke, penOnly = false, renderTask, language = '', epoch = 0;
  const model = window.StudyBridgeNoteModel;
  let finishGesture = () => {}, exportJob, erasePreview, selectedSticky=-1;
  const $ = s => host.querySelector(s);
  const esc = s => String(s).replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const route = kind => `/api/courses/${encodeURIComponent(course)}/${kind}/${encodeURIComponent(doc)}?page=${page}`;
  const draftKey = () => `studybridge.notes.${owner}.${course}.${doc}.${page}`;
  function status(s) { if (host) { $('[role=status]').textContent = s; syncPickers(); } }
  function backup() {
    try { localStorage.setItem(draftKey(),JSON.stringify({version,items})); }
    catch { status(t('本机空间不足，请及时保存到云端。','Local storage full. Save to cloud now.')); }
  }
  function changed() {
    dirty = true; backup(); paint(); status(t('未同步 · 正在保存…','Unsynced · Saving…'));
    clearTimeout(timer); timer = setTimeout(() => void save().catch(() => {}),800);
  }
  function remember() { undo.push(JSON.stringify(items)); if (undo.length > 60) undo.shift(); redo = []; }
  // Serialize saves and retain newer local edits while a snapshot is in flight.
  async function save() {
    clearTimeout(timer);
    if (saving) { await saving; if (saving) return save(); }
    if (!dirty) return;
    const snapshot = JSON.stringify(items), key = draftKey(), oldOwner = owner;
    const pending = ctx.api(route('notes'),{method:'PUT',body:{version,items:JSON.parse(snapshot)}}).then(result => {
      if (owner !== oldOwner) return;
      version = result.version;
      dirty = JSON.stringify(items) !== snapshot;
      if (dirty) backup(); else { try { localStorage.removeItem(key); } catch {} status(t('已保存到云端','Saved to cloud')); }
    }).catch(error => { if (owner === oldOwner) status(t('未同步，草稿已保留：','Unsynced; draft preserved: ') + error.message); throw error; }).finally(() => { if (saving === pending) saving = null; });
    saving = pending; await pending;
    if (owner !== oldOwner) return;
    if (dirty) return save();
  }
  // A fixed SVG viewBox keeps annotations aligned across viewport sizes and zoom.
  function paint() {
    const svg = $('svg.note-ink'); if (!svg) return;
    const ratio = Number(svg.dataset.ratio || 1);
    $('[data-color]').value=color; for (const option of $('[data-width]').options) option.selected=Number(option.value)===width; $('[data-pen-only]').checked=penOnly;
    svg.innerHTML = model.markup([...(erasePreview || items),...(stroke ? [stroke] : [])],ratio);
    const selected=(erasePreview || items)[selectedSticky];
    const stickySelected=selected?.type==='sticky';
    $('[data-sticky-tools]').style.visibility=stickySelected?'visible':'hidden';
    $('[data-sticky-tools]').inert=!stickySelected;
    if(stickySelected) {
      $('[data-sticky-color]').value=selected.background;
      const x=selected.x*1000,y=selected.y*1000*ratio,w=selected.w*1000,h=selected.h*1000*ratio;
      const handle=Math.min(w,h,44*1000/Math.max(1,svg.getBoundingClientRect().width));
      svg.insertAdjacentHTML('beforeend',`<g data-sticky-control="true" data-index="${selectedSticky}"><rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="${model.contrast(selected.background)}" stroke-width="1" stroke-dasharray="4 3" pointer-events="none"/><rect data-resize="true" x="${x+w-handle}" y="${y+h-handle}" width="${handle}" height="${handle}" fill="transparent" style="cursor:nwse-resize"/><rect pointer-events="none" x="${x+w-24}" y="${y+h-24}" width="24" height="24" rx="4" fill="${model.contrast(selected.background)}" fill-opacity=".15" style="cursor:nwse-resize"/><path d="M${x+w-17} ${y+h-5}l12-12m-5 12 5-5" stroke="${model.contrast(selected.background)}" stroke-width="1.5" pointer-events="none"/></g>`);
    }
    $('[data-note=undo]').disabled = !undo.length;
    $('[data-note=redo]').disabled = !redo.length;
    svg.style.touchAction = mode === 'hand' || (penOnly && ['pen','highlight','eraser'].includes(mode)) ? 'pan-x pan-y' : 'none';
    svg.style.cursor = busy ? 'progress' : model.cursor(mode,mode==='highlight'&&color==='#24344a'?'#ffd447':color);
    $('[data-color]').disabled=busy || ['hand','eraser','sticky'].includes(mode);
    $('[data-width]').disabled=busy || ['hand','eraser','text','sticky'].includes(mode);
    $('[data-tool-status]').textContent=({sticky:t('便签 · 点击添加，拖动移动，右下角调整大小','Sticky note · Click to add, drag to move, drag corner to resize'),hand:t('浏览 · 拖动移动课件','Browse · Drag to pan'),pen:t('画笔','Pen'),highlight:t('高亮','Highlight'),text:t('文字 · 点击添加或编辑','Text · Click to add or edit'),eraser:t('橡皮 · 拖动擦除整条标注','Eraser · Drag to erase annotations')})[mode];
    syncControls();
    host.querySelectorAll('[data-mode]').forEach(b => b.setAttribute('aria-pressed',b.dataset.mode === mode));
  }
  async function drawPage() {
    if (!pdf) return;
    if (renderTask) { renderTask.cancel(); try { await renderTask.promise; } catch {} }
    const token = epoch, currentHost = host;
    const source = await pdf.getPage(page); if (token !== epoch || currentHost !== host) return;
    const natural = source.getViewport({scale:1});
    const pixels = Math.min(1800,Math.max(800,$('.note-scroll').clientWidth * Math.min(devicePixelRatio || 1,2)));
    const viewport = source.getViewport({scale:pixels/natural.width});
    const canvas = $('canvas'); canvas.width = viewport.width; canvas.height = viewport.height;
    const sheet = $('.note-sheet'); sheet.style.width = `${zoom*100}%`; sheet.style.aspectRatio = `${natural.width}/${natural.height}`;
    const svg = $('svg.note-ink'); svg.setAttribute('viewBox',`0 0 1000 ${1000*natural.height/natural.width}`); svg.dataset.ratio = natural.height/natural.width;
    renderTask = source.render({canvasContext:canvas.getContext('2d'),viewport});
    await renderTask.promise; renderTask = null;
    $('[data-page]').value = page; $('[data-page]').max = pdf.numPages;
    $('[data-total]').textContent = `/ ${pdf.numPages}`;
    paint();
  }
  async function loadPage(next,loaded) {
    const token = epoch; await save(); if (token !== epoch) return; stroke = null;
    try {
      const result = loaded || await ctx.api(`/api/courses/${course}/notes/${doc}?page=${next}`);
      if (token !== epoch) return;
      selectedSticky=-1; page = next; version = result.version; items = result.items; undo = []; redo = []; dirty = false;
      let local; try { local = localStorage.getItem(draftKey()); } catch { /* Cloud notes remain available without browser storage. */ }
      if (local) { const draft = JSON.parse(local); items = draft.items; version = draft.version; dirty = true; }
      await drawPage();
      status(local ? t('已恢复本机草稿，请保存；若有冲突可导出草稿后读取云端。','Local draft restored. Save, or export the draft before reloading cloud notes.') : t('已保存到云端','Saved to cloud'));
    } finally { syncControls(); }
  }
  async function openDocument(id) {
    const token = epoch; await save(); if (token !== epoch) return;
    try {
      const lib = await import('/vendor/pdfjs/pdf.min.mjs');
      if (token !== epoch) return;
      lib.GlobalWorkerOptions.workerSrc = '/vendor/pdfjs/pdf.worker.min.mjs';
      const next = await lib.getDocument({url:`/api/courses/${course}/note-source/${id}`,cMapUrl:'/vendor/pdfjs/cmaps/',cMapPacked:true,standardFontDataUrl:'/vendor/pdfjs/standard_fonts/',wasmUrl:'/vendor/pdfjs/wasm/'}).promise;
      if (token !== epoch) { await next.destroy(); return; }
      let first;
      try {first=await ctx.api(`/api/courses/${course}/notes/${id}?page=1`);} catch(error) {await next.destroy();throw error;}
      if(token!==epoch){await next.destroy();return;}
      if (pdf) await pdf.destroy(); pdf = next; doc = id; dirty = false; page = 1; zoom = 1;items=[];undo=[];redo=[];
      $('.note-work').hidden = false;
      await loadPage(1,first);
    } finally { syncControls(); }
  }
  async function listDocuments() {
    const token = epoch, selectedCourse = course;
    const data = await ctx.api(`/api/courses/${course}/documents`);
    if (token !== epoch || selectedCourse !== course) return;
    const documents = data.documents.filter(d => d.hasSourcePdf);
    $('[data-document]').innerHTML = `<option value="">${t('选择 PDF 课件','Choose a PDF')}</option>` + documents.map(d => `<option value="${esc(d.id)}">${esc(d.title)}</option>`).join('');
    $('[data-document]').value=doc;
    status(documents.length ? t('选择课件开始笔记。','Choose a PDF to start.') : t('还没有 PDF 课件，请上传。PPT 请先导出为 PDF。','Upload a PDF to start. Export PowerPoint to PDF first.'));
  }
  async function switchCourse(id) {
    await save(); selectedSticky=-1; course = id; doc = ''; items = []; dirty = false;
    if (pdf) { await pdf.destroy(); pdf = null; }
    $('.note-work').hidden = true;
    if (course) await listDocuments();
  }
  function download(content,name,type) {
    const url = URL.createObjectURL(new Blob([content],{type})); const a = document.createElement('a'); a.href=url; a.download=name; a.click(); setTimeout(() => URL.revokeObjectURL(url),60000);
  }
  function syncControls() {
    if(!host)return;
    host.setAttribute('aria-busy',String(busy));
    host.querySelectorAll('[data-note],[data-mode],[data-upload],[data-page],[data-pen-only],[data-picker-toggle],[data-sticky-color]').forEach(el=>{
      el.disabled=busy;
      if(el.dataset.note==='cancel-export') {el.disabled=false;el.hidden=!exportJob;}
    });
    $('[data-note=undo]').disabled=busy || !undo.length;
    $('[data-note=redo]').disabled=busy || !redo.length;
    $('[data-note=prev]').disabled=busy || !pdf || page<=1;
    $('[data-note=next]').disabled=busy || !pdf || page>=pdf.numPages;
    $('[data-note=zoom-out]').disabled=busy || zoom<=1;
    $('[data-note=zoom-in]').disabled=busy || zoom>=3;
    $('[data-picker-toggle="document"]').disabled=busy || $('[data-document]').options.length<2;
    $('[data-color]').disabled=busy || ['hand','eraser','sticky'].includes(mode);
    $('[data-width]').disabled=busy || ['hand','eraser','text','sticky'].includes(mode);
  }
  async function exportFullPdf() {
    const job={canceled:false,token:epoch,source:pdf,host,course,doc,owner};
    exportJob=job;syncControls();
    const check=()=>{if(job.canceled || epoch!==job.token || pdf!==job.source)throw new Error(t('已取消导出，笔记未改变。','Export canceled. Notes are unchanged.'));};
    try {
      status(t('正在准备完整 PDF…','Preparing the complete PDF…'));
      // A save conflict must not prevent taking a copy of the student's own draft.
      await save().catch(()=>{});check();
      const saved=await ctx.api(`/api/courses/${job.course}/notes/${job.doc}?all=true`);check();
      const pages=new Map(saved.pages.map(p=>[p.page,p]));
      let includesDraft=dirty;
      const prefix=`studybridge.notes.${job.owner}.${job.course}.${job.doc}.`;
      for(let i=0;i<localStorage.length;i++) {
        const key=localStorage.key(i);if(!key?.startsWith(prefix))continue;
        const n=Number(key.slice(prefix.length));
        if(!Number.isInteger(n)||n<1||n>job.source.numPages)continue;
        const draft=JSON.parse(localStorage.getItem(key));
        if(!Array.isArray(draft?.items))throw new Error(t('本机草稿无法读取，请先检查对应页面。','A local draft could not be read. Check that page before exporting.'));
        pages.set(n,{page:n,items:draft.items});includesDraft=true;
      }
      pages.set(page,{page,items:JSON.parse(JSON.stringify(items))});
      const exporter=await import('/course-notes-export.mjs?v=notes-feedback-20261120');check();
      const bytes=await exporter.exportPdf({source:job.source,pages:[...pages.values()],check,
        progress:(current,total)=>{check();status(t('正在导出标注页 ','Exporting annotated pages ')+`${current} / ${total}`);}});
      check();
      const title=$('[data-document]').selectedOptions[0]?.textContent || 'course-notes';
      download(bytes,title.replace(/\.pdf$/i,'')+'-notes.pdf','application/pdf');
      status(includesDraft?t('完整 PDF 已导出，包含本机未同步草稿；云端笔记未被覆盖。','Complete PDF exported, including unsynced local drafts; cloud notes were not overwritten.'):t('完整 PDF 已导出，包含全部页面和笔记。','Complete PDF exported with all pages and notes.'));
    } finally {if(exportJob===job)exportJob=null;syncControls();}
  }
  function editText(point,index) {
    const dialog = $('[data-text-dialog]'), input = dialog.querySelector('textarea');
    dialog.querySelector('label').firstChild.textContent=items[index]?.type==='sticky'?t('便签文字','Sticky note text'):t('文字笔记（清空可删除）','Text note (empty to delete)');
    input.value = index === undefined ? '' : items[index].text;
    dialog.returnValue='cancel'; dialog.showModal(); input.focus();
    dialog.onclose = () => {
      if (dialog.returnValue !== 'save') return;
      if(index===undefined && !input.value.trim())return;
      if(index!==undefined && input.value===items[index]?.text)return;
      remember();
      if (items[index]?.type==='sticky') items[index].text=input.value;
      else if (index !== undefined) { if (input.value.trim()) items[index].text = input.value; else items.splice(index,1); }
      else if (input.value.trim()) items.push({type:'text',x:point[0],y:point[1],text:input.value,color,width:.022});
      changed();
    };
  }
  async function chooseFiling(match) {
    const token = epoch;
    const data = await ctx.api('/api/courses');
    if (token !== epoch) return null;
    const courses = data.courses.filter(c => c.chatType !== 'general' && c.name !== 'Schedule & Deadlines');
    if (!courses.length) throw new Error(t('请先在学习区建立课程，再上传课件。','Create a course in Study first, then upload your PDF.'));
    const dialog = $('[data-filing-dialog]'), select = dialog.querySelector('select');
    select.innerHTML = `<option value="">${t('请选择归属课程','Choose the destination course')}</option>` + courses.map(c => `<option value="${esc(c.id)}">${esc(c.name)}${c.term ? ' · ' + esc(c.term) : ''}</option>`).join('');
    dialog.querySelector('p').textContent = match.reason === 'ambiguous'
      ? t('识别到多个课程或学期，请选择归属。','Multiple courses or terms match. Choose the destination.')
      : t('未能明确匹配已有课程，请选择归属。','No clear course match. Choose the destination.');
    dialog.returnValue = 'cancel'; dialog.showModal(); select.focus();
    return new Promise(resolve => { dialog.onclose = () => resolve(token === epoch && dialog.returnValue === 'save' ? select.value : null); });
  }
  function bind() {
    host.addEventListener('click',async event => {
      const button = event.target.closest('button'); if (!button) return;
      const action = button.dataset.note;
      if(action==='cancel-export') {if(exportJob)exportJob.canceled=true;return;}
      if(busy || (!action && !button.dataset.mode && !button.dataset.pickerToggle && !button.dataset.pickerOption))return;
      let locked=false;const operationEpoch=epoch;
      try {
        if (button.dataset.pickerToggle) {
          const open=button.getAttribute('aria-expanded')==='true';
          if (open) closePickers(); else openPicker(button.dataset.pickerToggle);
          return;
        }
        if (button.dataset.pickerOption) {
          const key=button.dataset.pickerOption, select=$(`[data-${key}]`);
          select.value=button.dataset.value; closePickers(); syncPickers();
          $(`[data-picker-toggle="${key}"]`).focus();
          select.dispatchEvent(new Event('change',{bubbles:true})); return;
        }
        finishGesture(false);busy=true;locked=true;syncControls();
        if (button.dataset.mode) { mode = button.dataset.mode; paint(); }
        const sticky=items[selectedSticky];
        if(action==='sticky-text' && sticky?.type==='sticky') editText(null,selectedSticky);
        if(action==='sticky-copy' && sticky?.type==='sticky') {remember();items.push(model.transformSticky(JSON.parse(JSON.stringify(sticky)),.025,.025));selectedSticky=items.length-1;changed();}
        if(action==='sticky-delete' && sticky?.type==='sticky') {remember();items.splice(selectedSticky,1);selectedSticky=-1;changed();}
        if (action === 'pdf') await exportFullPdf();
        if (action === 'save') await save();
        if (action === 'study' && course) { await save(); await ctx.openStudyCourse(course); }
        if (action === 'focus') { host.classList.toggle('note-focus'); button.textContent=host.classList.contains('note-focus')?t('退出专注','Exit focus'):t('专注书写','Focus'); }
        if (action === 'undo' && undo.length) { selectedSticky=-1; redo.push(JSON.stringify(items)); items=JSON.parse(undo.pop()); changed(); }
        if (action === 'redo' && redo.length) { selectedSticky=-1; undo.push(JSON.stringify(items)); items=JSON.parse(redo.pop()); changed(); }
        if (action === 'prev' && page>1) await loadPage(page-1);
        if (action === 'next' && page<pdf.numPages) await loadPage(page+1);
        if (action === 'zoom-in' || action === 'zoom-out') { zoom=Math.max(1,Math.min(3,zoom+(action==='zoom-in' ? .25 : -.25))); await drawPage(); }
        if (action === 'backup') download(JSON.stringify({course,document:doc,page,version,items},null,2),`notes-${page}.json`,'application/json');
        if (action === 'reload' && confirm(t('读取云端将替换本机这一页草稿。请先导出草稿备份。继续？','Reloading replaces this local draft. Export a backup first. Continue?'))) { dirty=false; try { localStorage.removeItem(draftKey()); } catch {} await loadPage(page); }
        if (action === 'image') {
          const canvas = document.createElement('canvas'), base=$('canvas'); canvas.width=base.width; canvas.height=base.height;
          const g=canvas.getContext('2d'); g.drawImage(base,0,0);
          const svg=$('svg.note-ink').cloneNode(true); svg.querySelectorAll('[data-sticky-control]').forEach(el=>el.remove()); svg.setAttribute('xmlns','http://www.w3.org/2000/svg'); svg.setAttribute('width',canvas.width); svg.setAttribute('height',canvas.height);
          const url=URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(svg)],{type:'image/svg+xml'}));
          try { const img=new Image(); img.src=url; await img.decode(); g.drawImage(img,0,0); canvas.toBlob(blob => { if(blob) download(blob,`notes-page-${page}.png`,'image/png'); }); } finally { URL.revokeObjectURL(url); }
        }
      } catch(e) { if(epoch===operationEpoch)status(e.message); } finally {if(locked && epoch===operationEpoch){busy=false;paint();}}
    });
    host.addEventListener('change', async event => {
      const el=event.target; if (busy) return;
      const operationEpoch=epoch;finishGesture(false); busy=true; syncControls();
      try {
        if (el.matches('[data-course]')) { try { await switchCourse(el.value); } finally { el.value=course; syncPickers(); } }
        if (el.matches('[data-document]') && el.value) { try { await openDocument(el.value); } finally { el.value=doc; syncPickers(); } }
        if (el.matches('[data-page]')) { const n=Number(el.value); if (Number.isInteger(n) && n>=1 && n<=pdf.numPages) await loadPage(n); else el.value=page; }
        if (el.matches('[data-sticky-color]') && items[selectedSticky]?.type==='sticky') {remember();items[selectedSticky].background=el.value;changed();}
        if (el.matches('[data-color]')) { color=el.value; paint(); }
        if (el.matches('[data-width]')) { width=Number(el.value); paint(); }
        if (el.matches('[data-pen-only]')) { penOnly=el.checked; paint(); }
        if (el.matches('[data-upload]') && el.files[0]) {
          const token = epoch;
          await save(); const file=el.files[0]; if (!/\.pdf$/i.test(file.name) || file.size>50*1024*1024) throw new Error(t('请选择不超过 50 MB 的 PDF','Choose a PDF up to 50 MB'));
          if (token !== epoch) return;
          el.disabled=true; status(t('正在识别课号并归档…','Identifying the course and filing…'));
          const [body]=await ctx.readFiles([file],50*1024*1024);
          if (token !== epoch) return;
          let result=await ctx.api('/api/course-materials',{method:'POST',body});
          if (token !== epoch) return;
          if (result.needsCourse) {
            const selected = await chooseFiling(result);
            if (!selected) { status(t('已取消上传，未归档文件。','Upload canceled. No file was filed.')); return; }
            result = await ctx.api('/api/course-materials',{method:'POST',body:{...body,courseId:selected}});
          }
          if (token !== epoch) return;
          await switchCourse(result.courseId); $('[data-course]').value=course;
          await openDocument(result.document.id); $('[data-document]').value=doc;
          status(t('已归档到学习区 · ','Filed in Study · ') + result.courseName);
        }
      } catch(e) { if(epoch===operationEpoch)status(e.message); } finally { if(epoch===operationEpoch) { busy=false; if (el.matches('[data-upload]')) { el.value=''; el.disabled=false; } syncControls(); paint(); } }
    });
    const svg=$('svg.note-ink'); let pointer,gesture,last,initial,pan,stickyStart,stickyOrigin,stickyStroke;
    const point = e => { const r=svg.getBoundingClientRect(); return [Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))].map(n=>Math.round(n*100000)/100000); };
    function erase(from,to) {
      const size=svg.getBoundingClientRect();
      const remaining=erasePreview.filter((item,i)=>{
        if(item.type==='sticky')return true;
        let box;
        if(item.type==='text') {
          const rect=svg.querySelector(`[data-index="${i}"]`)?.getBoundingClientRect();
          if(rect)box={x:rect.left-size.left,y:rect.top-size.top,width:rect.width,height:rect.height};
        }
        return !model.hit(item,from,to,size,box);
      });
      if(remaining.length!==erasePreview.length){erasePreview=remaining;paint();}
    }
    function eraseSticky(from,to) {
      const note=erasePreview[selectedSticky],r=svg.getBoundingClientRect();
      const local=p=>[(p[0]-note.x)/note.w,(p[1]-note.y)/note.h];
      note.ink=note.ink.filter(ink=>!model.hit(ink,local(from),local(to),{width:r.width*note.w,height:r.height*note.h}));
    }
    finishGesture=cancel=>{
      if(pointer===undefined)return;
      const id=pointer;pointer=undefined;
      if(svg.hasPointerCapture(id))svg.releasePointerCapture(id);
      if(gesture==='eraser' || gesture?.startsWith('sticky-')) {
        const remaining=erasePreview;erasePreview=null;
        if(!cancel && JSON.stringify(remaining)!==initial) {items=remaining;undo.push(initial);if(undo.length>60)undo.shift();redo=[];changed();}
      } else if(stroke && !cancel) {remember();items.push(stroke);stroke=null;changed();}
      stroke=null;gesture=null;pan=null;stickyStroke=null;paint();
    };
    svg.addEventListener('pointerdown',e=>{
      if(busy || !pdf || pointer!==undefined || e.button>0)return;
      // Finger panning remains native, including pinch zoom; stylus/mouse can draw.
      if(e.pointerType==='touch' && penOnly && ['pen','highlight','eraser'].includes(mode))return;
      if(e.pointerType==='touch' && mode==='hand' && !e.target.closest('[data-sticky],[data-sticky-control]'))return;
      e.preventDefault();
      const p=point(e),target=e.target.closest('[data-index]'),index=target?Number(target.dataset.index):undefined;
      const sticky=items[index]?.type==='sticky'?items[index]:null;
      if(sticky) {
        selectedSticky=index;
        if(mode==='text'){editText(null,index);paint();return;}
        pointer=e.pointerId;svg.setPointerCapture(pointer);initial=JSON.stringify(items);erasePreview=JSON.parse(initial);
        last=p;stickyOrigin=p;stickyStart=JSON.parse(JSON.stringify(sticky));
        if(mode==='eraser'){gesture='sticky-erase';eraseSticky(p,p);}
        else if(e.target.closest('[data-resize]'))gesture='sticky-resize';
        else if(['pen','highlight'].includes(mode)) {
          gesture='sticky-ink';
          stickyStroke={type:mode,color:mode==='highlight'&&color==='#24344a'?'#ffd447':color,width:Math.min(.1,width*(mode==='highlight'?7:1)/sticky.w),points:[[(p[0]-sticky.x)/sticky.w,(p[1]-sticky.y)/sticky.h]]};
          if(sticky.ink.length>=500){pointer=undefined;svg.releasePointerCapture(e.pointerId);erasePreview=null;status(t('便签笔画已满，请新建便签。','This note is full. Add another sticky note.'));return;}
          erasePreview[index].ink.push(stickyStroke);
        } else gesture='sticky-move';
        paint();return;
      }
      selectedSticky=-1;
      if(mode==='sticky') {remember();items.push(model.sticky(p));selectedSticky=items.length-1;changed();return;}
      if(mode==='text'){editText(p,items[index]?.type==='text'?index:undefined);return;}
      pointer=e.pointerId;gesture=mode;last=p;svg.setPointerCapture(pointer);
      if(mode==='hand') {
        const scroll=$('.note-scroll');pan={x:e.clientX,y:e.clientY,left:scroll.scrollLeft,top:scroll.scrollTop};svg.style.cursor='grabbing';return;
      }
      if(mode==='eraser'){initial=JSON.stringify(items);erasePreview=items.slice();erase(p,p);return;}
      stroke={type:mode,color:mode==='highlight'&&color==='#24344a'?'#ffd447':color,width:mode==='highlight'?width*7:width,points:[p]};paint();
    });
    svg.addEventListener('pointermove',e=>{
      if(e.pointerId!==pointer)return;e.preventDefault();
      if(gesture==='hand') {
        const scroll=$('.note-scroll');scroll.scrollLeft=pan.left+pan.x-e.clientX;scroll.scrollTop=pan.top+pan.y-e.clientY;return;
      }
      if(gesture==='sticky-move'||gesture==='sticky-resize') {
        const p=point(e);erasePreview[selectedSticky]=model.transformSticky(stickyStart,p[0]-stickyOrigin[0],p[1]-stickyOrigin[1],gesture==='sticky-resize');paint();return;
      }
      for(const sample of e.getCoalescedEvents?.().length?e.getCoalescedEvents():[e]) {
        const p=point(sample);
        if(gesture==='sticky-erase')eraseSticky(last,p);
        else if(gesture==='sticky-ink') {
          if(stickyStroke.points.length<12000)stickyStroke.points.push([Math.max(0,Math.min(1,(p[0]-stickyStart.x)/stickyStart.w)),Math.max(0,Math.min(1,(p[1]-stickyStart.y)/stickyStart.h))]);
        } else if(gesture==='eraser')erase(last,p);
        else if(stroke && stroke.points.length<12000)stroke.points.push(p);
        last=p;
      }
      if(gesture!=='eraser')paint();
    });
    svg.addEventListener('pointerup',e=>{if(e.pointerId===pointer)finishGesture(false);});
    svg.addEventListener('pointercancel',e=>{if(e.pointerId===pointer)finishGesture(true);});
    svg.addEventListener('lostpointercapture',e=>{if(e.pointerId===pointer)finishGesture(false);});
    host.addEventListener('keydown',e=>{if(e.key==='Escape'&&pointer!==undefined){e.preventDefault();finishGesture(true);}});
    host.addEventListener('focusout',e=>{ const field=e.target.closest('.note-field'); if(field && !field.contains(e.relatedTarget))closePickers(); });
    host.addEventListener('keydown',e=>{
      const field=e.target.closest('.note-field'); if(!field)return;
      const trigger=field.querySelector('[data-picker-toggle]'), menu=field.querySelector('.note-picker-menu');
      if(e.key==='Escape'){e.preventDefault();closePickers();trigger.focus();return;}
      if(!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;
      e.preventDefault();
      if(menu.hidden){openPicker(field.dataset.picker,true);return;}
      const options=[...menu.querySelectorAll('button')], index=options.indexOf(document.activeElement);
      const next=e.key==='Home'?0:e.key==='End'?options.length-1:(index+(e.key==='ArrowDown'?1:-1)+options.length)%options.length;
      options[next]?.focus();
    });
    host.addEventListener('keydown',e=> { if (!(e.ctrlKey||e.metaKey) || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return; if(e.key.toLowerCase()==='z') {e.preventDefault();$(`[data-note=${e.shiftKey?'redo':'undo'}]`).click();} if(e.key.toLowerCase()==='s'){e.preventDefault();$('[data-note=save]').click();} });
  }
  function picker(key, label, placeholder) {
    return `<div class="note-field" data-picker="${key}"><span class="note-field-label">${label}</span><button type="button" class="note-picker-trigger" data-picker-toggle="${key}" aria-haspopup="listbox" aria-expanded="false" aria-controls="note-${key}-menu" aria-label="${label}"><span>${placeholder}</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="m5 6 3 3 3-3"/></svg></button><select data-${key} hidden tabindex="-1" aria-hidden="true"><option value="">${placeholder}</option></select><div id="note-${key}-menu" class="note-picker-menu" role="listbox" aria-label="${label}" hidden></div></div>`;
  }
  function closePickers() {
    if (!host) return;
    host.querySelectorAll('[data-picker-toggle]').forEach(button => button.setAttribute('aria-expanded','false'));
    host.querySelectorAll('.note-picker-menu').forEach(menu => { menu.hidden=true; });
  }
  function syncPickers() {
    if (!host) return;
    for (const key of ['course','document']) {
      const select=$(`[data-${key}]`), trigger=$(`[data-picker-toggle="${key}"]`), menu=$(`#note-${key}-menu`);
      if (!select || !trigger) continue;
      trigger.querySelector('span').textContent=select.selectedOptions[0]?.textContent || select.options[0]?.textContent || '';
      trigger.disabled=busy || key==='document' && select.options.length<2;
      trigger.setAttribute('aria-label',`${key==='course'?t('课程','Course'):t('课件','Material')}: ${trigger.textContent}`);
      if (menu.hidden) menu.innerHTML=[...select.options].filter(option=>option.value).map(option=>`<button type="button" role="option" tabindex="-1" data-picker-option="${key}" data-value="${esc(option.value)}" aria-selected="${option.selected}"><span>${esc(option.textContent)}</span><span class="note-picker-check" aria-hidden="true">${option.selected?'✓':''}</span></button>`).join('') || `<p>${t('暂无可选项目','Nothing to select yet')}</p>`;
    }
  }
  function openPicker(key, focus=false) {
    closePickers(); syncPickers();
    const trigger=$(`[data-picker-toggle="${key}"]`), menu=$(`#note-${key}-menu`);
    if (trigger.disabled) return;
    menu.hidden=false; trigger.setAttribute('aria-expanded','true');
    if (focus) (menu.querySelector('[aria-selected="true"]') || menu.querySelector('button'))?.focus();
  }
  document.addEventListener('click',event=>{if(host && !event.target.closest('.note-field'))closePickers();});
  function build() {
    host=document.createElement('section'); host.className='course-notes';
    const icons={
      sticky:'<path d="M4 3h16v12l-5 6H4V3Zm11 18v-6h5M8 8h8M8 12h5"/>',
      hand:'<path d="M8 13V6a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-6a2 2 0 0 1 4 0v9c0 4-2.5 6-6 6h-1c-2 0-3.5-1-5-3l-4-5a2 2 0 0 1 3-2l1 1"/>',
      pen:'<path d="m15 5 4 4M4 20l5-1L20 8a2.8 2.8 0 0 0-4-4L5 15l-1 5Z"/>',
      highlight:'<path d="m13 4 7 7-7 7-7-7 7-7ZM6 11l-2 5 4 4 5-2M4 16l-2 5h6M14 7l3 3"/>',
      text:'<path d="M5 7V4h14v3M12 4v16M8 20h8"/>',
      eraser:'<path d="m15 3 6 6a1.5 1.5 0 0 1 0 2l-9 9H7l-5-5a1.5 1.5 0 0 1 0-2L13 3a1.5 1.5 0 0 1 2 0ZM7 8l9 9M12 20h9"/>',
      undo:'<path d="m8 4-5 5 5 5M3 9h11a6 6 0 0 1 0 12h-3"/>',
      redo:'<path d="m16 4 5 5-5 5M21 9H10a6 6 0 0 0 0 12h3"/>'
    };
    const icon=id=>`<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">${icons[id]}</svg>`;
    const button=(id,zh,en)=>`<button type="button" data-note="${id}"${icons[id]?` class="note-icon-button" aria-label="${t(zh,en)}" title="${t(zh,en)}"`:''}>${icons[id]?icon(id):t(zh,en)}</button>`;
    host.innerHTML=`<div class="note-picker"><div class="note-location">${picker('course',t('课程','Course'),t('选择课程','Choose a course'))}<span class="note-location-divider" aria-hidden="true">/</span>${picker('document',t('课件','Material'),t('选择 PDF 课件','Choose a PDF'))}</div><div class="note-picker-actions"><label class="note-upload"><span aria-hidden="true">＋</span>${t('上传 PDF','Upload PDF')}<input data-upload type="file" accept="application/pdf,.pdf"></label>${button('study','在学习区查看','View in Study')}</div></div>
    <p role="status" aria-live="polite"></p><div class="note-work" hidden><div class="note-toolbar" role="toolbar" aria-label="${t('笔记工具','Note tools')}">${[['hand','浏览','Browse'],['pen','画笔','Pen'],['highlight','高亮','Highlight'],['text','文字','Text'],['sticky','便签','Sticky note'],['eraser','橡皮','Eraser']].map(([id,zh,en])=>`<button type="button" class="note-icon-button" data-mode="${id}" aria-pressed="false" aria-label="${t(zh,en)}" title="${t(zh,en)}">${icon(id)}</button>`).join('')}<input type="color" data-color value="${color}" aria-label="${t('颜色','Color')}"><select data-width aria-label="${t('笔宽','Stroke width')}"><option value=".0015">${t('细','Fine')}</option><option value=".003" selected>${t('中','Medium')}</option><option value=".006">${t('粗','Broad')}</option></select>${button('undo','撤销','Undo')}${button('redo','重做','Redo')}<label><input type="checkbox" data-pen-only>${t('仅触控笔书写','Stylus only')}</label><span data-tool-status></span></div>
    <div data-sticky-tools class="note-sticky-tools" style="visibility:hidden" inert aria-label="${t('便签操作','Sticky note actions')}">${button('sticky-text','编辑文字','Edit note text')}${button('sticky-copy','复制便签','Duplicate note')}${button('sticky-delete','删除便签','Delete note')}<label>${t('背景','Background')}<input type="color" data-sticky-color value="#fff2a8" aria-label="${t('便签背景颜色','Sticky note background')}"></label><span>${t('切换画笔可在便签上手写','Use the pen to write on the note')}</span></div>
    <div class="note-navigation">${button('prev','上一页','Previous')}<input type="number" data-page min="1" value="1" aria-label="${t('页码','Page')}"><span data-total></span>${button('next','下一页','Next')}${button('zoom-out','缩小','Zoom out')}${button('zoom-in','放大','Zoom in')}${button('save','保存','Save')}${button('pdf','导出完整 PDF','Export PDF')}<button type="button" data-note="cancel-export" hidden>${t('取消导出','Cancel export')}</button>${button('focus','专注书写','Focus')}<details><summary>${t('更多','More')}</summary>${button('image','导出当前页图片','Export page image')}${button('backup','导出草稿','Export draft')}${button('reload','重新读取云端','Reload cloud')}</details></div>
    <div class="note-scroll"><div class="note-sheet"><canvas></canvas><svg class="note-ink" xmlns="http://www.w3.org/2000/svg" aria-label="${t('课件标注画布','Annotation canvas')}"></svg></div></div></div>
    <dialog data-filing-dialog><form method="dialog"><p></p><label>${t('归属课程','Destination course')}<select required></select></label><div><button value="cancel" formnovalidate>${t('取消','Cancel')}</button><button value="save">${t('归档并打开','File and open')}</button></div></form></dialog>
    <dialog data-text-dialog><form method="dialog"><label>${t('文字笔记（清空可删除）','Text note (empty to delete)')}<textarea maxlength="4000" rows="6"></textarea></label><div><button value="cancel">${t('取消','Cancel')}</button><button value="save">${t('完成','Done')}</button></div></form></dialog>`;
    bind();
  }
  async function mount(context) {
    if (host && (owner!==context.userId || !document.getElementById('courseNotesSlot'))) finishGesture(false);
    ctx=context;
    if (owner!==ctx.userId) {
      if(exportJob)exportJob.canceled=true;
      epoch++; saving=null; busy=false; stroke=null;selectedSticky=-1;
      clearTimeout(timer); if(pdf) void pdf.destroy(); host=null; pdf=null; course='';doc=''; dirty=false;owner=ctx.userId;items=[]; undo=[];redo=[];
    }
    const slot=document.getElementById('courseNotesSlot'); if(!slot || !owner) return;
    const nextLanguage = window.StudyBridgeI18n.getLanguage();
    if (host && language !== nextLanguage) {
      finishGesture(false);
      host = null; build();
      if (course) { await listDocuments(); $('[data-document]').value=doc; }
      if (pdf) { $('.note-work').hidden=false; await drawPage(); status(dirty ? t('未同步，草稿已保留','Unsynced; draft preserved') : t('已保存到云端','Saved to cloud')); }
    }
    language = nextLanguage;
    if (!host) build(); slot.replaceChildren(host);
    const select = $('[data-course]');
    select.innerHTML = `<option value="">${t('选择课程','Choose a course')}</option>` + ctx.courses.filter(c=>c.chatType!=='general' && c.name!=='Schedule & Deadlines').map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');
    select.value = course; syncPickers();
    if(!course && ctx.courseId && [...$('[data-course]').options].some(o=>o.value===ctx.courseId)) {
      $('[data-course]').value=ctx.courseId;
      try { await switchCourse(ctx.courseId); } catch(e) {status(e.message);}
    }
  }
  window.addEventListener('beforeunload',e=>{finishGesture(false);if(dirty){backup();e.preventDefault();e.returnValue='';}});
  window.StudyBridgeCourseNotes={mount};
})();
