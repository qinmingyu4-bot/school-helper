const FormulaParser = require("fast-formula-parser");
const { col, address } = require("../public/office-model");
function calculator(model) {
  const cache = new Map(),
    stack = new Set();
  let steps = 0;
  const error = (name) => new FormulaParser.FormulaError(name);
  function value(sheetName, row, column) {
    const sheet = model.sheets.find(
      (s) => s.name.toLowerCase() === String(sheetName || "").toLowerCase(),
    );
    if (!sheet || row < 1 || column < 1 || row > 1000 || column > 100)
      return error("#REF!");
    const key = `${sheet.id}!${row}:${column}`;
    if (cache.has(key)) return cache.get(key);
    if (stack.has(key)) return error("#CYCLE!");
    if (++steps > 150000 || stack.size > 100) return error("#LIMIT!");
    const raw = String(sheet.cells[`${col(column)}${row}`]?.value || "");
    if (!raw.startsWith("=")) {
      if (raw.startsWith("'")) return raw.slice(1);
      if (!raw) return 0;
      if (/^(true|false)$/i.test(raw)) return raw.toLowerCase() === "true";
      return /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)
        ? Number(raw)
        : raw;
    }
    stack.add(key);
    let result;
    try {
      const parser = new FormulaParser({
        onCell: (ref) => value(ref.sheet || sheet.name, ref.row, ref.col),
        onRange: (ref) => {
          const target = model.sheets.find(
            (s) =>
              s.name.toLowerCase() === (ref.sheet || sheet.name).toLowerCase(),
          );
          if (!target) throw error("#REF!");
          const lastRow =
            ref.to.row === FormulaParser.MAX_ROW ? target.rows : ref.to.row;
          const lastCol =
            ref.to.col === FormulaParser.MAX_COLUMN ? target.cols : ref.to.col;
          if (
            lastRow > 1000 ||
            lastCol > 100 ||
            (lastRow - ref.from.row + 1) * (lastCol - ref.from.col + 1) > 50000
          )
            throw error("#LIMIT!");
          return Array.from(
            { length: Math.max(0, lastRow - ref.from.row + 1) },
            (_, r) =>
              Array.from(
                { length: Math.max(0, lastCol - ref.from.col + 1) },
                (_, c) =>
                  value(target.name, ref.from.row + r, ref.from.col + c),
              ),
          );
        },
        onVariable: () => {
          throw error("#NAME?");
        },
      });
      result = parser.parse(raw.slice(1), {
        sheet: sheet.name,
        row,
        col: column,
      });
      if (Array.isArray(result)) result = error("#VALUE!");
      if (typeof result === "number" && !Number.isFinite(result))
        result = error("#NUM!");
    } catch (failure) {
      result =
        failure instanceof FormulaParser.FormulaError
          ? failure
          : error("#ERROR!");
    }
    stack.delete(key);
    cache.set(key, result);
    return result;
  }
  return {
    get: (sheet, cell) => {
      const a = address(cell);
      return a ? value(sheet, a.row, a.col) : error("#REF!");
    },
    display: (sheet, cell) => {
      const a = address(cell);
      const result = a ? value(sheet, a.row, a.col) : error("#REF!");
      return result instanceof Error ? result.error || result.name : result;
    },
  };
}
function renameFormulaSheet(formula, oldName, newName) {
  const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `(?:'${escape(oldName.replace(/'/g, "''"))}'|(?<![A-Za-z0-9_'])${escape(oldName)})!`,
    "gi",
  );
  // Quoted formula strings are values, not references, and must never be rewritten.
  return formula
    .split(/("(?:[^"]|"")*")/g)
    .map((part, i) =>
      i % 2
        ? part
        : part.replace(pattern, () => `'${newName.replace(/'/g, "''")}'!`),
    )
    .join("");
}
module.exports = { calculator, renameFormulaSheet };
