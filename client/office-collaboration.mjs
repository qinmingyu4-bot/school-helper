import { pendingSteps, receiveSteps } from './office-doc-sync.mjs';
import { difference, applyOperations } from '../lib/office-operations.js';
const copy = v => JSON.parse(JSON.stringify(v));
const id = () => crypto.randomUUID().replaceAll('-', '');

export class CollaborationSession {
  constructor(workspace, access) {
    this.workspace = workspace; this.access = access; this.peer = id(); this.stopped = false;
    this.base = { name: workspace.current.name, model: copy(workspace.current.model) };
    this.version = workspace.current.version; this.peers = [];
  }
  exchange() {
    if (this.inProgress) return this.inProgress;
    const w = this.workspace;
    if (this.stopped || w.current.id !== this.access.id || !w.host) return;
    this.inProgress = this.sync().finally(() => { this.inProgress = null; });
    return this.inProgress;
  }
  async sync() {
    const w = this.workspace;
    clearTimeout(this.timer);
    this.timer = null;
    try {
      if (w.current.dirty) w.capture();
      // Retransmit the exact batch after an uncertain network result. The server
      // keeps durable receipts so a lost response never inserts text twice.
      if (!this.flight) {
        const sent = w.current.dirty ? { name: w.current.name, model: copy(w.current.model) } : this.base;
        const before = w.kind === 'docs' ? {name:this.base.name,model:{settings:this.base.model.settings}} : this.base;
        const after = w.kind === 'docs' ? {name:sent.name,model:{settings:sent.model.settings}} : sent;
        this.flight = { batch: id(), since: this.version, sent, changes: !w.current.dirty ? [] : difference(before, after),
          steps: w.kind === 'docs' ? pendingSteps(w.editor).slice(0, 500).map(s => s.step.toJSON()) : [] };
        if (!this.flight.changes.length && !this.flight.steps.length) w.current.dirty = false;
      }
      const flight = this.flight;
      const result = await w.ctx.api(`/api/office/${this.access.id}/sync`, { method: 'POST', body: {
        actorId: w.ctx.userId, ownerId: this.access.ownerId, token: this.access.token || '', peer: this.peer,
        batch: flight.batch, since: flight.since, steps: flight.steps, changes: flight.changes,
      } });
      if (this.stopped || w.current.id !== this.access.id || !w.host) return;
      if (result.resetRequired) throw Object.assign(Error(w.t('离线修改超出可合并范围，请另存副本。')), { status: 409 });
      if (!result.model && !result.entries?.length && result.project.version === this.version) {
        this.peers = result.peers || []; this.flight = null;
        w.status = w.t(w.current.dirty ? '正在同步修改…' : '已同步 · 共同编辑');
        if (!w.current.dirty) await w.clearBackup();
        return;
      }
      // Do not apply remote content during IME composition or an active drag.
      if (w.editor?.view.composing || w.dragging) { this.schedule(250); return; }
      w.capture();
      const live = { name: w.current.name, model: copy(w.current.model) };
      const followup = difference(result.accepted ? flight.sent : this.base, live);
      const entries = result.entries || [];
      let remote = result.model ? { model: result.model, name: result.project.name } : this.base;
      for (const entry of entries) remote = applyOperations(remote, entry.changes);
      remote.name = result.project.name;
      w.receiving = true;
      if (w.kind === 'docs' && entries.length) {
        receiveSteps(w.editor, entries, result.accepted ? flight.batch : '', flight.steps.length);
        // The baseline for text lives in the step plugin, not object patches.
        remote.model.content = w.editor.getJSON();
      }
      if (w.kind === 'docs' && result.model && pendingSteps(w.editor).length) throw Object.assign(Error(w.t('离线修改超出可合并范围，请另存副本。')), { status: 409 });
      const localOps = w.kind === 'docs' ? followup.filter(op => op.path[0] !== 'model' || op.path[1] === 'settings') : followup;
      const merged = applyOperations(remote, localOps);
      if (w.kind === 'docs' && !result.model) merged.model.content = w.editor.getJSON();
      const changed = JSON.stringify(w.current.model) !== JSON.stringify(merged.model);
      w.current.model = merged.model; w.current.name = merged.name;
      this.base = copy(remote); this.version = result.project.version;
      Object.assign(w.current, { version: this.version, sharing: result.project.sharing });
      this.peers = result.peers || [];
      // Rebase undo snapshots over collaborators' field changes, so undo never
      // restores an old whole-project snapshot over someone else's work.
      if (w.kind !== 'docs') {
        const changes = entries.filter(e => e.batch !== flight.batch).flatMap(e => e.changes);
        if (changes.length) for (const stack of [w.undo, w.redo]) {
          for (let i=0;i<stack.length;i++) stack[i] = JSON.stringify(applyOperations({ model: JSON.parse(stack[i]), name: '' }, changes).model);
        }
      }
      this.flight = null;
      w.current.dirty = Boolean(localOps.length || w.kind === 'docs' && pendingSteps(w.editor).length);
      w.status = w.t(w.current.dirty ? '正在同步修改…' : '已同步 · 共同编辑');
      if (changed && w.kind !== 'docs') w.refreshRemote();
      if (w.kind === 'docs' && result.model) {
        const focused = w.editor.isFocused;
        w.editor.destroy();
        w.editor = null;
        w.docSelection = null;
        w.mountDocs();
        if (focused) w.editor.commands.focus();
      } else if (w.kind === 'docs') w.paperStyle();
      const name = w.host?.querySelector('[data-name]');
      if (name && document.activeElement !== name) name.value = w.current.name;
      if (w.aiResult) w.refreshAI();
      if (!w.current.dirty) await w.clearBackup();
      else void w.storeBackup(w.current);
    } catch (error) {
      if (this.stopped) return;
      if ([401,403,404,409,422].includes(error.status)) {
        this.stopped = true; w.current.conflict = true;
        w.status = error.message;
      } else w.status = w.t('连接中断，修改已保留，将自动重试。');
      if (w.current.dirty) void w.storeBackup(w.current);
    } finally {
      w.receiving = false; w.updateStatus();
      if (!this.stopped && w.host && !this.timer) this.schedule(w.current.dirty ? 500 : document.hidden ? 10000 : 1500);
    }
  }
  schedule(delay = 350) {
    if (this.stopped) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { this.timer = null; void this.exchange(); }, delay);
  }
  stop() { this.stopped = true; clearTimeout(this.timer); }
}
