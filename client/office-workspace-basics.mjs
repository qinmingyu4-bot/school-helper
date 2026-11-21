import Model from '../public/office-model.js';
import { selectionRange, rangeKeys } from '../lib/office-operations.js';
import { findText } from './office-basics.mjs';
import { CollaborationSession } from './office-collaboration.mjs';
import { changeAxis, pasteGrid, serializeGrid } from '../lib/office-grid.js';
const ui = window.StudyBridgeI18n;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const copy = v => JSON.parse(JSON.stringify(v));
const button = (action, label) => `<button type="button" data-office="${action}">${ui.text(label)}</button>`;
const field = (key, label, value, max) => `<label>${ui.text(label)}<input type="number" data-setting="${key}" value="${value}" min="0" max="${max}" step="1"></label>`;
const editable = target => target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);

export function installBasics(Workspace) {
Object.assign(Workspace.prototype, {
  connectCollaboration() {
    if (!this.current?.collaborative || this.current.conflict || this.collaboration) return;
    this.collaboration = new CollaborationSession(this, this.current.access || { id: this.current.id, ownerId: this.ctx.userId });
    this.collaboration.schedule(0);
  },
  refreshRemote() {
    if (!this.host?.isConnected) return;
    if (this.kind === 'sheets') {
      this._calc = null;
      this.sheetIndex = Math.min(this.sheetIndex, this.current.model.sheets.length - 1);
      this.remoteRedraw = true;
      try { this.draw(); } finally { this.remoteRedraw = false; }
    } else {
      const active = document.activeElement;
      const id = active?.dataset.elementText;
      const start = window.getSelection()?.anchorOffset;
      this.slideIndex = Math.min(this.slideIndex, this.current.model.slides.length - 1);
      this.paintSlides();
      if (id) {
        const text = this.host.querySelector(`[data-element-text="${CSS.escape(id)}"]`);
        if (text) { text.contentEditable = 'true'; text.focus(); if (text.firstChild) window.getSelection()?.collapse(text.firstChild, Math.min(start || 0, text.firstChild.length || 0)); }
      }
    }
  },
  enrichBasics() {
    const toolbar = this.host.querySelector('.office-toolbar');
    const trailingTools = toolbar.querySelector('.office-toolbar-group:last-child') || toolbar;
    if (this.kind === 'docs') {
      toolbar.insertAdjacentHTML('beforeend', `${button('find-toggle','查找替换')}<details class="office-menu"><summary>${ui.text('表格')}</summary><div>${button('table-insert','插入 3 × 3 表格')}${button('table-row','下方插入行')}${button('table-col','右侧插入列')}${button('table-row-delete','删除行')}${button('table-col-delete','删除列')}${button('table-merge','合并单元格')}${button('table-split','拆分单元格')}${button('table-delete','删除表格')}</div></details>`);
      this.host.querySelector('.office-page-settings').insertAdjacentHTML('beforeend', `${field('firstLine','首行缩进（字符）',0,8)}${field('spaceBefore','段前（磅）',0,72)}${field('spaceAfter','段后（磅）',0,72)}`);
      toolbar.insertAdjacentHTML('afterend', `<div class="office-find" ${this.findOpen ? '' : 'hidden'}><label>${ui.text('查找')}<input data-find value="${esc(this.findQuery || '')}" maxlength="500"></label><label>${ui.text('替换为')}<input data-replace value="${esc(this.replaceQuery || '')}" maxlength="4000"></label>${button('find-next','下一处')}${button('find-replace','替换当前')}${button('find-all','全部替换')}<span data-find-count role="status"></span>${button('find-close','关闭')}</div>`);
    }
    if (this.kind === 'sheets') {
      trailingTools.insertAdjacentHTML('beforeend', `${button('range-clear','清空内容')}<details class="office-menu"><summary>${ui.text('行列')}</summary><div>${button('row-insert','上方插入行')}${button('row-delete','删除选中行')}${button('col-insert','左侧插入列')}${button('col-delete','删除选中列')}</div></details>${field('columnWidth','列宽（像素）',this.sheet().columnWidths?.[Model.address(this.cell).col] || 112,500)}${field('rowHeight','行高（像素）',this.sheet().rowHeights?.[Model.address(this.cell).row] || 30,300)}`);
      const label = this.host.querySelector('[data-cell-name]');
      label.outerHTML = `<input class="office-range-address" data-range-address aria-label="${ui.text('选中区域')}" value="${esc(this.cell === this.selectionEnd ? this.cell : `${this.cell}:${this.selectionEnd}`)}" placeholder="A1:D10">`;
      this.renderGrid();
    }
    if (this.kind === 'slides') {
      toolbar.insertAdjacentHTML('beforeend', `${button('elements-copy','复制元素')}${button('elements-paste','粘贴元素')}<details class="office-menu"><summary>${ui.text('排列')}</summary><div>${['left','center','right','top','middle','bottom'].map((a,i) => button('elements-align-'+a,['左对齐','水平居中','右对齐','顶端对齐','垂直居中','底端对齐'][i])).join('')}${button('elements-front','置于顶层')}${button('elements-back','置于底层')}</div></details>`);
    }
  },
  gridHTML() {
    const sheet = this.sheet();
    const width=42+Array.from({length:sheet.cols},(_,i)=>sheet.columnWidths?.[i+1]||112).reduce((a,b)=>a+b,0);
    return `<table class="office-grid" style="width:${width}px" role="grid" aria-label="${ui.text('电子表格')}" aria-rowcount="${sheet.rows}" aria-colcount="${sheet.cols}" tabindex="0"><colgroup><col style="width:42px">${Array.from({length:sheet.cols},(_,i)=>`<col style="width:${sheet.columnWidths?.[i+1] || 112}px">`).join('')}</colgroup><thead><tr><th data-select-all></th>${Array.from({length:sheet.cols},(_,i)=>`<th scope="col" data-col-header="${i+1}">${Model.col(i+1)}<span data-axis-resize="col" data-axis-index="${i+1}"></span></th>`).join('')}</tr></thead><tbody></tbody></table>`;
  },
  renderGrid() {
    const grid = this.host?.querySelector('.office-grid'); if (!grid) return;
    const sheet = this.sheet();
    const scroll = this.host.querySelector('.office-grid-scroll');
    let start=1, top=0;
    while (start<sheet.rows && top+(sheet.rowHeights?.[start] || 30)<scroll.scrollTop-200) { top+=sheet.rowHeights?.[start] || 30; start++; }
    const end=Math.min(sheet.rows,start+59);
    let bottom=0; for(let r=end+1;r<=sheet.rows;r++) bottom+=sheet.rowHeights?.[r] || 30;
    const signature=`${sheet.id}:${start}:${end}:${sheet.cols}:${JSON.stringify(sheet.rowHeights)}:${JSON.stringify(sheet.columnWidths)}`;
    if (this.gridSignature === signature && grid.querySelector('[data-cell]')) { this.paintRange(); return; }
    this.gridSignature=signature;
    const active=document.activeElement, address=active?.dataset.cell, value=active?.value, a=active?.selectionStart,b=active?.selectionEnd;
    grid.querySelector('tbody').innerHTML=`${top ? `<tr aria-hidden="true"><td colspan="${sheet.cols+1}" style="height:${top}px;padding:0;border:0"></td></tr>` : ''}${Array.from({length:end-start+1},(_,i)=>{const r=start+i;return `<tr style="height:${sheet.rowHeights?.[r] || 30}px"><th scope="row" data-row-header="${r}">${r}<span data-axis-resize="row" data-axis-index="${r}"></span></th>${Array.from({length:sheet.cols},(_,c)=>`<td><input aria-label="${Model.col(c+1)}${r}" data-cell="${Model.col(c+1)}${r}" autocomplete="off" spellcheck="false" maxlength="4000"></td>`).join('')}</tr>`;}).join('')}${bottom ? `<tr aria-hidden="true"><td colspan="${sheet.cols+1}" style="height:${bottom}px;padding:0;border:0"></td></tr>` : ''}`;
    this.refreshCells();
    if(address) { const next=grid.querySelector(`[data-cell="${address}"]`); if(next){ next.focus({preventScroll:true});next.value=value;next.setSelectionRange(a,b); } }
    this.paintRange();
  },
  selectedRange() { return selectionRange(this.cell, this.selectionEnd || this.cell); },
  paintRange() {
    if(this.kind !== 'sheets') return;
    const r=this.selectedRange();
    this.host.querySelectorAll('[data-cell]').forEach(input=>{const p=Model.address(input.dataset.cell);input.parentElement.classList.toggle('office-range-selected',p.row>=r.top&&p.row<=r.bottom&&p.col>=r.left&&p.col<=r.right);});
    const address=this.host.querySelector('[data-range-address]');if(address && document.activeElement!==address) address.value=this.cell===this.selectionEnd?this.cell:`${this.cell}:${this.selectionEnd}`;
  },
  focusCell(address, extend = false) {
    const p=Model.address(address), sheet=this.sheet();if(!p||p.row>sheet.rows||p.col>sheet.cols)return;
    if(!extend) this.cell=address;
    this.selectionEnd=address;
    let input=this.host.querySelector(`[data-cell="${address}"]`);
    if(!input){let top=0;for(let r=1;r<p.row;r++)top+=sheet.rowHeights?.[r]||30;this.host.querySelector('.office-grid-scroll').scrollTop=top;this.gridSignature='';this.renderGrid();input=this.host.querySelector(`[data-cell="${address}"]`);}
    this.rangeFocusing=true;input?.focus({preventScroll:extend});this.rangeFocusing=false;this.paintRange();
  },
  bulkStyle(key,value) {
    const range=this.selectedRange();
    if((range.bottom-range.top+1)*(range.right-range.left+1)>50000)throw Error(ui.text('作品最多保存 50000 个非空单元格。'));
    const next=copy(this.current.model), sheet=next.sheets[this.sheetIndex];
    for(const address of rangeKeys(range)) {
      const cell=sheet.cells[address] ||= {value:'',style:{}}; cell.style ||= {};cell.style[key]=value;
    }
    const valid=Model.normalize('sheets',next);this.checkpoint();this.current.model=valid;this.changed();this.refreshCells();this.paintRange();
  },
  async basicsAction(action) {
    if(action==='share') {
      await this.save();
      if(this.current.dirty||this.current.conflict)throw Error(ui.text('请先保存当前作品，或选择另存副本。'));
      const dialog=document.createElement('dialog');dialog.className='office-share-dialog';
      const owner=!this.current.ownerId||this.current.ownerId===this.ctx.userId;
      dialog.innerHTML=`<h3>${ui.text('分享与共同编辑')}</h3><p>${ui.text('持有链接的人登录后可以编辑这份作品。关闭分享会立即阻止其他人继续同步。')}</p><div data-share-result></div>${owner ? `<button data-share-enable>${ui.text(this.current.sharing?'生成新链接（旧链接失效）':'开启链接分享')}</button><button data-share-disable ${this.current.sharing?'':'disabled'}>${ui.text('关闭分享')}</button>`:''}<button data-share-close>${ui.text('关闭')}</button>`;
      document.body.append(dialog);dialog.showModal();dialog.querySelector('[data-share-close]').onclick=()=>dialog.close();dialog.onclose=()=>dialog.remove();
      const result=dialog.querySelector('[data-share-result]');
      const show = link => {result.innerHTML=`<input readonly aria-label="${ui.text('分享链接')}" value="${esc(link)}"><button data-copy-link>${ui.text('复制链接')}</button>`;result.querySelector('[data-copy-link]').onclick=async()=>{try{await window.StudyBridgeClipboard.copyText(link);result.querySelector('button').textContent=ui.text('已复制');}catch{result.querySelector('input').select();}};};
      if(this.current.access?.token) show(this.shareURL(this.current.access));
      for(const enabled of [true,false]) {const button=dialog.querySelector(enabled?'[data-share-enable]':'[data-share-disable]');if(!button)continue;button.onclick=async()=>{
        dialog.querySelectorAll('button').forEach(b=>b.disabled=true);
        const current = this.current;
        const stillOpen = () => this.current === current && this.ctx.isCurrent?.() !== false;
        try {
          await this.save();if(this.current.dirty)throw Error(ui.text('请先保存当前作品，或选择另存副本。'));
          if (!stillOpen()) return;
          const response=await this.ctx.api(`/api/office/${current.id}/sharing`,{method:'POST',body:{actorId:this.ctx.userId,enabled}});
          if (!stillOpen()) return;
          this.ctx.invalidateOfficeProjects?.();
          this.collaboration?.stop();this.collaboration=null;this.editor?.destroy();this.editor=null;
          const access={id:this.current.id,ownerId:this.ctx.userId,kind:this.kind,token:response.token};
          this.current={...response.project,dirty:false,access};this.draw();this.connectCollaboration();
          if(enabled)show(this.shareURL(access));else result.textContent=ui.text('分享已关闭');
        }catch(error){result.textContent=error.message;}
        finally{dialog.querySelectorAll('button').forEach(b=>b.disabled=false);dialog.querySelector('[data-share-disable]').disabled=!this.current.sharing;}
      };}
      return true;
    }
    if(this.kind==='docs') {
      if(action.startsWith('find-')) {
        if(action==='find-toggle'||action==='find-close'){this.findOpen=action==='find-toggle'?!this.findOpen:false;this.host.querySelector('.office-find').hidden=!this.findOpen;if(this.findOpen)this.host.querySelector('[data-find]').focus();return true;}
        const query=this.host.querySelector('[data-find]').value, replacement=this.host.querySelector('[data-replace]').value;
        this.findQuery=query;this.replaceQuery=replacement;
        const matches=findText(this.editor.state.doc,query), selection=this.editor.state.selection;
        if(action==='find-all' && matches.length){this.editor.commands.command(({tr,state})=>{for(const m of [...matches].reverse()){const marks=tr.doc.resolve(m.from).marks();tr.replaceWith(m.from,m.to,replacement?state.schema.text(replacement,marks):[]);}return true;});}
        else if(action==='find-replace'){const m=matches.find(m=>m.from===selection.from&&m.to===selection.to);if(m)this.editor.commands.insertContentAt(m,replacement?{type:'text',text:replacement,marks:this.editor.state.doc.resolve(m.from).marks().map(m=>m.toJSON())}:[]);}
        const remaining=findText(this.editor.state.doc,query), match=remaining.find(m=>m.from>=this.editor.state.selection.to)||remaining[0];
        if(match&&action!=='find-all')this.editor.chain().focus().setTextSelection(match).scrollIntoView().run();
        this.host.querySelector('[data-find-count]').textContent=String(remaining.length);return true;
      }
      const commands={'table-insert':'insertTable','table-row':'addRowAfter','table-col':'addColumnAfter','table-row-delete':'deleteRow','table-col-delete':'deleteColumn','table-merge':'mergeCells','table-split':'splitCell','table-delete':'deleteTable'};
      if(commands[action]){
        const pos=this.editor.state.selection.$from;
        let table;for(let d=pos.depth;d>0;d--)if(pos.node(d).type.name==='table'){table=pos.node(d);break;}
        if(action==='table-row'&&table?.childCount>=100)throw Error(ui.text('表格需要 1–100 行。'));
        if(action==='table-col'&&table){let columns=0;table.firstChild.forEach(cell=>columns+=cell.attrs.colspan);if(columns>=20)throw Error(ui.text('表格最多 20 列。'));}
        const chain=this.editor.chain().focus();chain[commands[action]]().run();return true;
      }
    }
    if(this.kind==='sheets') {
      if(action==='range-clear'){this.checkpoint();for(const key of rangeKeys(this.selectedRange()))if(this.sheet().cells[key])this.sheet().cells[key].value='';this.changed();this.refreshCells();return true;}
      if(/^(row|col)-(insert|delete)$/.test(action)){
        const [axis,operation]=action.split('-'),r=this.selectedRange();
        const next=changeAxis(this.current.model,this.sheetIndex,axis,operation,axis==='row'?r.top:r.left,operation==='insert'?1:axis==='row'?r.bottom-r.top+1:r.right-r.left+1);
        this.checkpoint();this.current.model=next;this.cell='A1';this.selectionEnd='A1';this.changed();this.draw();return true;
      }
      if(action==='cell-bold'){this.bulkStyle('bold',!this.sheet().cells[this.cell]?.style?.bold);return true;}
    }
    if(this.kind==='slides' && (action.startsWith('elements-')||action==='element-delete'||action==='element-front')) {
      const selected=this.slide().elements.filter(e=>this.selectedElements.has(e.id)||e.id===this.elementId);
      if(action==='elements-copy'){this.elementClipboard=copy(selected);return true;}
      if(action==='elements-paste'){
        if(!this.elementClipboard?.length)return true;
        if(this.slide().elements.length+this.elementClipboard.length>100)throw Error(ui.text('每页最多 100 个元素。'));
        this.checkpoint();const inserted=copy(this.elementClipboard).map(e=>({...e,id:Model.id(),x:Math.min(100-e.w,e.x+2),y:Math.min(100-e.h,e.y+2)}));this.slide().elements.push(...inserted);this.selectedElements=new Set(inserted.map(e=>e.id));this.elementId=inserted[0].id;
      }else{
        if(!selected.length)return true;this.checkpoint();
        if(action==='element-delete'){this.slide().elements=this.slide().elements.filter(e=>!selected.includes(e));this.selectedElements.clear();this.elementId='';}
        else if(action==='element-front'||action==='elements-front')this.slide().elements=[...this.slide().elements.filter(e=>!selected.includes(e)),...selected];
        else if(action==='elements-back')this.slide().elements=[...selected,...this.slide().elements.filter(e=>!selected.includes(e))];
        else if(action.startsWith('elements-align-')){
          const side=action.slice(15),left=Math.min(...selected.map(e=>e.x)),right=Math.max(...selected.map(e=>e.x+e.w)),top=Math.min(...selected.map(e=>e.y)),bottom=Math.max(...selected.map(e=>e.y+e.h));
          for(const e of selected){if(side==='left')e.x=left;if(side==='right')e.x=right-e.w;if(side==='center')e.x=(left+right-e.w)/2;if(side==='top')e.y=top;if(side==='bottom')e.y=bottom-e.h;if(side==='middle')e.y=(top+bottom-e.h)/2;}
        }
      }
      this.changed();this.paintSlides();return true;
    }
    return false;
  },
  shareURL(access) {const url=new URL('/app?page=tools',location.origin);url.hash=new URLSearchParams({office:access.id,owner:access.ownerId,kind:this.kind,token:access.token});return url.href;},
  basicsSetting(key,value) {
    if(this.kind==='docs'&&['firstLine','spaceBefore','spaceAfter'].includes(key)){const number=Math.max(0,Math.min(key==='firstLine'?8:72,Number(value)||0));this.editor.chain().focus().updateAttributes('paragraph',{[key]:number}).updateAttributes('heading',{[key]:number}).run();return true;}
    if(this.kind==='sheets'){
      const map={cellSize:'size',cellColor:'color',cellBackground:'background',cellFormat:'format'};
      if(map[key]){this.bulkStyle(map[key],key==='cellSize'?Number(value):value);return true;}
      if(key==='columnWidth'||key==='rowHeight'){this.checkpoint();const r=this.selectedRange(), column=key==='columnWidth', field=column?'columnWidths':'rowHeights';this.sheet()[field]||={};for(let i=column?r.left:r.top;i<=(column?r.right:r.bottom);i++)this.sheet()[field][i]=Math.max(column?48:24,Math.min(column?500:300,Number(value)||0));this.changed();this.draw();return true;}
    }
    return false;
  },
  basicsKey(event) {
    const mod=event.ctrlKey||event.metaKey,key=event.key.toLowerCase();
    const act=action=>{event.preventDefault();void this.action(action).catch(error=>{this.status=error.message;this.updateStatus();});return true;};
    if(this.kind==='docs'&&mod&&key==='f')return act('find-toggle');
    if(this.kind!=='docs'&&mod&&key==='z'&&!event.target.isContentEditable)return act(event.shiftKey?'redo':'undo');
    if(this.kind==='slides'&&!editable(event.target)){
      if(mod&&key==='c')return act('elements-copy');if(mod&&key==='v')return act('elements-paste');
      if(mod&&key==='a'){event.preventDefault();this.selectedElements=new Set(this.slide().elements.map(e=>e.id));this.elementId=this.slide().elements[0]?.id||'';this.paintSlides();return true;}
      if(key.startsWith('arrow')&&this.selectedElements.size){
        event.preventDefault();if(!event.repeat)this.checkpoint();const group=this.slide().elements.filter(e=>this.selectedElements.has(e.id)),step=event.shiftKey?2:0.5;
        const dx=Math.max(-Math.min(...group.map(e=>e.x)),Math.min(100-Math.max(...group.map(e=>e.x+e.w)),key==='arrowleft'?-step:key==='arrowright'?step:0));
        const dy=Math.max(-Math.min(...group.map(e=>e.y)),Math.min(100-Math.max(...group.map(e=>e.y+e.h)),key==='arrowup'?-step:key==='arrowdown'?step:0));
        for(const el of group){el.x+=dx;el.y+=dy;const node=this.host.querySelector(`[data-element="${CSS.escape(el.id)}"]`);if(node){node.style.left=el.x+'%';node.style.top=el.y+'%';}}
        this.changed();this.inspector();this.thumbnails();return true;
      }
    }
    if(this.kind==='sheets'&&(event.target.matches('[data-cell]')||event.target.matches('.office-grid'))){
      if(mod&&key==='a'){event.preventDefault();this.cell='A1';this.selectionEnd=Model.col(this.sheet().cols)+this.sheet().rows;this.paintRange();return true;}
      if(event.shiftKey&&key.startsWith('arrow')){event.preventDefault();const p=Model.address(this.selectionEnd||this.cell);p.row=Math.max(1,Math.min(this.sheet().rows,p.row+(key==='arrowdown'?1:key==='arrowup'?-1:0)));p.col=Math.max(1,Math.min(this.sheet().cols,p.col+(key==='arrowright'?1:key==='arrowleft'?-1:0)));this.focusCell(Model.col(p.col)+p.row,true);return true;}
      if(['delete','backspace'].includes(key)&&this.cell!==this.selectionEnd)return act('range-clear');
    }
    return false;
  },
  bindBasics() {
    const host=this.host,signal=this.bindController.signal;
    host.addEventListener('input',event=>{if(event.target.matches('[data-find]'))this.findQuery=event.target.value;if(event.target.matches('[data-replace]'))this.replaceQuery=event.target.value;}, {signal});
    host.addEventListener('change',event=>{
      if(event.target.matches('[data-range-address]')){try{const [from,to=from]=event.target.value.toUpperCase().split(':');const range=selectionRange(from,to);if(range.bottom>this.sheet().rows||range.right>this.sheet().cols)throw Error();this.focusCell(from);this.selectionEnd=to;this.paintRange();}catch{this.status=ui.text('请输入有效的单元格区域。');this.updateStatus();}}
    },{signal});
    if(this.kind==='sheets'){
      const scroll=host.querySelector('.office-grid-scroll');let frame;
      scroll.addEventListener('scroll',()=>{if(!frame)frame=requestAnimationFrame(()=>{frame=null;if(host===this.host)this.renderGrid();});},{signal});
      host.addEventListener('copy',event=>{if(event.target.matches('[data-cell],.office-grid')&&(this.cell!==this.selectionEnd||event.target.selectionStart===0&&event.target.selectionEnd===event.target.value?.length)){
        event.preventDefault();const range=this.selectedRange(),cells=Object.fromEntries(rangeKeys(range).filter(key=>this.sheet().cells[key]).map(key=>[key,copy(this.sheet().cells[key])]));
        this.gridClipboard={text:serializeGrid(this.sheet(),range),cells,range,token:Model.id()};event.clipboardData.setData('text/plain',this.gridClipboard.text);event.clipboardData.setData('application/x-studybridge-sheet',this.gridClipboard.token);
      }}, {signal});
      host.addEventListener('cut',event=>{if(event.target.matches('[data-cell],.office-grid')&&this.cell!==this.selectionEnd){event.preventDefault();event.clipboardData.setData('text/plain',serializeGrid(this.sheet(),this.selectedRange()));void this.action('range-clear');}}, {signal});
      host.addEventListener('paste',event=>{
        if(!event.target.matches('[data-cell],.office-grid'))return;
        event.preventDefault();event.stopImmediatePropagation();
        try{const text=event.clipboardData.getData('text/plain'),next=pasteGrid(this.current.model,this.sheetIndex,this.cell,text,this.gridClipboard?.token===event.clipboardData.getData('application/x-studybridge-sheet')?this.gridClipboard:null);this.checkpoint();this.current.model=next;this.changed();this.draw();}catch(error){this.status=error.message;this.updateStatus();}
      }, {signal,capture:true});
      host.addEventListener('pointerdown',event=>this.gridPointer(event),{signal});
    }
  },
  gridPointer(event) {
    if(event.button!==0)return;
    const resize=event.target.closest('[data-axis-resize]');
    if(resize){event.preventDefault();const column=resize.dataset.axisResize==='col',index=Number(resize.dataset.axisIndex),field=column?'columnWidths':'rowHeights',start=column?event.clientX:event.clientY,old=this.sheet()[field]?.[index]||(column?112:30);this.checkpoint();this.dragging=true;resize.setPointerCapture(event.pointerId);let value=old;
      const move=e=>{value=Math.max(column?48:24,Math.min(column?500:300,old+(column?e.clientX:e.clientY)-start));if(column)this.host.querySelectorAll('col')[index].style.width=value+'px';else resize.closest('tr').style.height=value+'px';};
      const finish=()=>{resize.removeEventListener('pointermove',move);resize.removeEventListener('pointerup',finish);resize.removeEventListener('pointercancel',finish);this.dragging=false;this.sheet()[field]||={};this.sheet()[field][index]=value;this.changed();this.draw();};resize.addEventListener('pointermove',move);resize.addEventListener('pointerup',finish);resize.addEventListener('pointercancel',finish);return;}
    const col=event.target.closest('[data-col-header]'),row=event.target.closest('[data-row-header]');
    if(col||row||event.target.matches('[data-select-all]')){event.preventDefault();if(col){this.cell=Model.col(+col.dataset.colHeader)+'1';this.selectionEnd=Model.col(+col.dataset.colHeader)+this.sheet().rows;}else if(row){this.cell='A'+row.dataset.rowHeader;this.selectionEnd=Model.col(this.sheet().cols)+row.dataset.rowHeader;}else{this.cell='A1';this.selectionEnd=Model.col(this.sheet().cols)+this.sheet().rows;}this.host.querySelector('.office-grid').focus();this.paintRange();return;}
    const input=event.target.closest('[data-cell]');if(!input)return;
    if(event.shiftKey){event.preventDefault();this.selectionEnd=input.dataset.cell;this.paintRange();return;}
    this.cell=input.dataset.cell;this.selectionEnd=this.cell;
    const grid=this.host.querySelector('.office-grid');let moved=false;
    const move=e=>{const over=document.elementFromPoint(e.clientX,e.clientY)?.closest('[data-cell]');if(over&&over!==input){moved=true;this.selectionEnd=over.dataset.cell;this.paintRange();e.preventDefault();}};
    const finish=()=>{window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',finish);window.removeEventListener('pointercancel',finish);if(moved){grid.focus({preventScroll:true});this.paintRange();}};
    window.addEventListener('pointermove',move,{signal:this.bindController.signal});window.addEventListener('pointerup',finish,{signal:this.bindController.signal});window.addEventListener('pointercancel',finish,{signal:this.bindController.signal});
  },
});
}
