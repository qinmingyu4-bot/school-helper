import { Node, Extension, mergeAttributes } from '@tiptap/core';
import { tableEditing, columnResizing, addRowAfter, addColumnAfter, deleteRow, deleteColumn, deleteTable, mergeCells, splitCell } from '@tiptap/pm/tables';

export const ParagraphLayout = Extension.create({
  name: 'paragraphLayout',
  addGlobalAttributes() {
    return [{ types: ['paragraph', 'heading'], attributes: Object.fromEntries([
      ['firstLine', 'text-indent', 'em'], ['spaceBefore', 'margin-top', 'pt'], ['spaceAfter', 'margin-bottom', 'pt'],
    ].map(([key, css, unit]) => [key, { default: 0,
      parseHTML: el => parseFloat(el.style.getPropertyValue(css)) || 0,
      renderHTML: attrs => ({ style: `${css}:${Number(attrs[key]) || 0}${unit}` }),
    }])) }];
  },
});
const cellAttrs = {
  colspan: { default: 1, parseHTML: el => Number(el.getAttribute('colspan')) || 1 },
  rowspan: { default: 1, parseHTML: el => Number(el.getAttribute('rowspan')) || 1 },
  colwidth: { default: null, parseHTML: el => el.getAttribute('data-colwidth')?.split(',').map(Number) || null,
    renderHTML: attrs => attrs.colwidth ? { 'data-colwidth': attrs.colwidth.join(','), style: `width:${attrs.colwidth.reduce((a,b) => a+b,0)}px` } : {} },
};
const tableRole = Extension.create({ name: 'tableRoles', extendNodeSchema: extension => ({ tableRole: extension.config.tableRole }) });
export const Table = Node.create({ name: 'table', group: 'block', content: 'tableRow+', isolating: true, tableRole: 'table',
  parseHTML: () => [{ tag: 'table' }], renderHTML: ({ HTMLAttributes }) => ['table', mergeAttributes(HTMLAttributes), ['tbody', 0]],
  addExtensions: () => [tableRole],
  addProseMirrorPlugins: () => [columnResizing({ cellMinWidth: 40 }), tableEditing()],
  addCommands() { return {
    insertTable: (rows = 3, cols = 3) => ({ commands }) => commands.insertContent({ type: 'table', content: Array.from({length: rows}, () => ({ type: 'tableRow', content: Array.from({length: cols}, () => ({type: 'tableCell', content: [{ type: 'paragraph' }]})) })) }),
    ...Object.fromEntries(Object.entries({ addRowAfter, addColumnAfter, deleteRow, deleteColumn, deleteTable, mergeCells, splitCell }).map(([name, command]) => [name, () => ({ state, dispatch }) => command(state, dispatch)])),
  }; },
});
export const TableRow = Node.create({ name: 'tableRow', content: '(tableCell | tableHeader)*', tableRole: 'row', parseHTML: () => [{ tag: 'tr' }], renderHTML: () => ['tr', 0] });
export const TableCell = Node.create({ name: 'tableCell', content: 'block+', isolating: true, tableRole: 'cell', addAttributes: () => cellAttrs, parseHTML: () => [{ tag: 'td' }], renderHTML: ({ HTMLAttributes }) => ['td', HTMLAttributes, 0] });
export const TableHeader = TableCell.extend({ name: 'tableHeader', tableRole: 'header_cell', parseHTML: () => [{ tag: 'th' }], renderHTML: ({ HTMLAttributes }) => ['th', HTMLAttributes, 0] });

// Literal matching within text blocks, including matches crossing formatting marks.
export function findText(doc, query) {
  if (!query) return [];
  const found = [];
  doc.descendants((node, pos) => {
    if (!node.isTextblock) return;
    const text = node.textBetween(0, node.content.size, '', '\ufffc');
    for (let at = text.indexOf(query); at !== -1; at = text.indexOf(query, at + query.length)) {
      found.push({ from: pos + 1 + at, to: pos + 1 + at + query.length });
      if (found.length >= 10000) break;
    }
    return false;
  });
  return found;
}
