import Papa from "papaparse";

// Parses CSV text into { columns, rows, rowCount, truncated }. Caps rows/columns
// since this is a mockup tool, not a production BI backend — large uploads get
// truncated with a visible notice rather than blowing the localStorage quota.
export function parseCsvText(text, { maxRows = 2000, maxCols = 40 } = {}) {
  const result = Papa.parse(text, { header: true, dynamicTyping: false, skipEmptyLines: true });

  let fields = result.meta.fields || [];
  const colsTruncated = fields.length > maxCols;
  fields = fields.slice(0, maxCols);

  const totalRows = result.data.length;
  const rowsTruncated = totalRows > maxRows;
  const rawRows = result.data.slice(0, maxRows);

  const columns = fields.map((name) => ({ name, type: inferColumnType(rawRows, name) }));

  const rows = rawRows.map((r) => {
    const row = {};
    for (const col of columns) {
      row[col.name] = col.type === "number" ? toNumberOrNull(r[col.name]) : (r[col.name] ?? "");
    }
    return row;
  });

  return { columns, rows, rowCount: rows.length, truncated: rowsTruncated || colsTruncated };
}

function inferColumnType(rows, field) {
  let sawValue = false;
  for (let i = 0; i < Math.min(rows.length, 50); i++) {
    const v = rows[i][field];
    if (v === undefined || v === null || v === "") continue;
    sawValue = true;
    if (toNumberOrNull(v) === null) return "string";
  }
  return sawValue ? "number" : "string";
}

function toNumberOrNull(v) {
  if (v === "" || v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
