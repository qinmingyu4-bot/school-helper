import { Extension } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { Step } from '@tiptap/pm/transform';

const key = new PluginKey('officeSharedSteps');
export const DocSync = Extension.create({
  name: 'officeSharedSteps',
  addProseMirrorPlugins() {
    return [new Plugin({ key, historyPreserveItems: true, state: {
      init: () => [],
      apply(tr, pending) {
        if (tr.getMeta(key)) return tr.getMeta(key).pending;
        return tr.docChanged ? pending.concat(tr.steps.map((step, i) => ({ step, inverted: step.invert(tr.docs[i]) }))) : pending;
      },
    } })];
  },
});
export function pendingSteps(editor) { return key.getState(editor.state) || []; }
export function receiveSteps(editor, entries, ownBatch, ownCount) {
  const state = editor.state, pending = pendingSteps(editor);
  const tr = state.tr;
  // Undo only local optimistic steps, replay the durable sequence, then rebase
  // unacknowledged local edits over it. Mirror maps preserve cursors and history.
  for (let i = pending.length - 1; i >= 0; i--) tr.step(pending[i].inverted);
  let acknowledged = 0;
  for (const entry of entries) {
    entry.steps.forEach((json, i) => {
      tr.step(Step.fromJSON(state.schema, json));
      if (entry.batch === ownBatch && i < ownCount) {
        tr.mapping.setMirror(pending.length - 1 - i, tr.steps.length - 1);
        acknowledged++;
      }
    });
  }
  const next = [];
  for (let i = acknowledged; i < pending.length; i++) {
    const step = pending[i].step.map(tr.mapping.slice(pending.length - i));
    if (step && !tr.maybeStep(step).failed) {
      tr.mapping.setMirror(pending.length - 1 - i, tr.steps.length - 1);
      next.push({ step, inverted: step.invert(tr.docs[tr.docs.length - 1]) });
    }
  }
  tr.setMeta(key, { pending: next }).setMeta('addToHistory', false).setMeta('rebased', pending.length);
  if (state.selection instanceof TextSelection) {
    const selection = state.selection.map(tr.doc, tr.mapping);
    tr.setSelection(selection);
  }
  editor.view.dispatch(tr);
}
