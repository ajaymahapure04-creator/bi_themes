// Turns a per-cell binding config + the user's uploaded dataset into data shaped
// EXACTLY like the existing static domain dummy data (d.kpis / d.bar / d.line /
// d.donut / d.table), so CellVisual.jsx never needs to know where its data came
// from. binding === null means "use the static dummy data" (today's behavior).

function getTable(dataset, tableId) {
  return dataset.tables[tableId] || null;
}

function findRelationship(dataset, factTable, dimTable) {
  return dataset.relationships.find((r) => r.factTable === factTable && r.dimTable === dimTable) || null;
}

function buildIndex(rows, keyColumn) {
  const idx = new Map();
  for (const row of rows) {
    const k = row[keyColumn];
    if (k === null || k === undefined || k === "") continue;
    idx.set(String(k), row);
  }
  return idx;
}

// Resolves the group label for one fact row. groupBy.table may be the fact table
// itself (grouping by a column that lives directly on it) or a joined dimension
// table (resolved through dataset.relationships). Orphan FKs bucket into
// "(Unknown)" rather than being dropped, so totals still reconcile with SUM(raw).
function resolveGroupValue(dataset, factTableId, factRow, groupBy, dimIndexCache) {
  const raw = (v) => (v === null || v === undefined || v === "" ? "(Unknown)" : String(v));
  if (groupBy.table === factTableId) return raw(factRow[groupBy.column]);

  const rel = findRelationship(dataset, factTableId, groupBy.table);
  const dimTable = rel && getTable(dataset, groupBy.table);
  if (!rel || !dimTable) return "(Unknown)";

  let idx = dimIndexCache.get(rel.id);
  if (!idx) {
    idx = buildIndex(dimTable.rows, rel.dimColumn);
    dimIndexCache.set(rel.id, idx);
  }
  const fk = factRow[rel.factColumn];
  const dimRow = fk === null || fk === undefined ? undefined : idx.get(String(fk));
  return dimRow ? raw(dimRow[groupBy.column]) : "(Unknown)";
}

const AGG_FNS = {
  sum: (vals) => vals.reduce((a, b) => a + b, 0),
  avg: (vals) => (vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0),
  min: (vals) => (vals.length ? Math.min(...vals) : 0),
  max: (vals) => (vals.length ? Math.max(...vals) : 0),
};

// Page-wide slicer filters. Each entry is { table, column, values: Set<string> }
// -- values is guaranteed non-empty by filterRows below (an empty selection
// means "no constraint", handled by simply excluding that filter). Reuses the
// exact same "same table, or joined dimension table via dataset.relationships"
// reach as resolveGroupValue above, just to test equality instead of produce a
// label. A filter on a table with no relationship path to factTableId has no
// effect on that particular cell -- matches Power BI's own cross-filter
// behavior (a filter only touches visuals it can actually reach).
function rowPassesFilters(dataset, factTableId, row, activeFilters, dimIndexCache) {
  for (const f of activeFilters) {
    let cellValue;
    if (f.table === factTableId) {
      cellValue = row[f.column];
    } else {
      const rel = findRelationship(dataset, factTableId, f.table);
      if (!rel) continue;
      const dimTable = getTable(dataset, f.table);
      if (!dimTable) continue;
      let idx = dimIndexCache.get(rel.id);
      if (!idx) {
        idx = buildIndex(dimTable.rows, rel.dimColumn);
        dimIndexCache.set(rel.id, idx);
      }
      const fk = row[rel.factColumn];
      const dimRow = fk === null || fk === undefined ? undefined : idx.get(String(fk));
      cellValue = dimRow ? dimRow[f.column] : undefined;
    }
    const asStr = cellValue === null || cellValue === undefined || cellValue === "" ? "(Unknown)" : String(cellValue);
    if (!f.values.has(asStr)) return false;
  }
  return true;
}

function filterRows(dataset, factTableId, rows, activeFilters) {
  const active = (activeFilters || []).filter((f) => f.values.size);
  if (!active.length) return rows;
  const dimIndexCache = new Map();
  return rows.filter((row) => rowPassesFilters(dataset, factTableId, row, active, dimIndexCache));
}

// Groups a fact table's rows by `groupBy` (or one "Total" bucket if null) and
// aggregates `metric` within each group. Returns [{label, value}, ...].
function groupAndAggregate(dataset, factTableId, metric, groupBy, activeFilters) {
  const factTable = getTable(dataset, factTableId);
  if (!factTable) return [];
  const dimIndexCache = new Map();
  const groups = new Map();
  const rows = filterRows(dataset, factTableId, factTable.rows, activeFilters);

  for (const row of rows) {
    const label = groupBy ? resolveGroupValue(dataset, factTableId, row, groupBy, dimIndexCache) : "Total";
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label).push(row[metric.column]);
  }

  const result = [];
  for (const [label, rawVals] of groups) {
    let value;
    if (metric.agg === "count") value = rawVals.length;
    else if (metric.agg === "countDistinct") value = new Set(rawVals.map((v) => String(v))).size;
    else value = (AGG_FNS[metric.agg] || AGG_FNS.sum)(rawVals.map(Number).filter(Number.isFinite));
    result.push({ label, value });
  }
  return result;
}

function sortGroups(groups, sort) {
  const s = sort || { by: "value", dir: "desc" };
  const arr = [...groups];
  arr.sort((a, b) => {
    const cmp = s.by === "label" ? String(a.label).localeCompare(String(b.label)) : a.value - b.value;
    return s.dir === "asc" ? cmp : -cmp;
  });
  return arr;
}

function sortLabels(labels, sort) {
  const s = sort || { by: "label", dir: "asc" };
  const arr = [...labels];
  arr.sort((a, b) => (s.dir === "asc" ? String(a).localeCompare(String(b)) : String(b).localeCompare(String(a))));
  return arr;
}

// Caps categories, collapsing overflow into "Other" -- an unbounded group-by on
// real data can easily produce hundreds of categories, which isn't a readable chart.
function applyTopN(groups, topN) {
  if (!topN || groups.length <= topN) return groups;
  const top = groups.slice(0, topN);
  const restSum = groups.slice(topN).reduce((a, g) => a + g.value, 0);
  return [...top, { label: "Other", value: restSum }];
}

function aggLabel(agg) {
  return { sum: "Sum", avg: "Average", min: "Min", max: "Max", count: "Count", countDistinct: "Distinct count" }[agg] || "Sum";
}

const UNIT_DIVISORS = { K: 1e3, M: 1e6, B: 1e9 };

// numberFormat is always optional: { decimals?: number, unit?: "none"|"K"|"M"|"B"|"auto" }.
// Fully undefined reproduces the previous fixed formatNumber() output exactly
// (integers get thousands separators + 0 decimals, non-integers up to 2) --
// every existing binding/AI-generated binding that never set a format keeps
// rendering identically.
function applyNumberFormat(n, numberFormat) {
  if (!Number.isFinite(n)) return "—";
  const decimals = numberFormat && Number.isFinite(numberFormat.decimals) ? numberFormat.decimals : undefined;
  let unit = (numberFormat && numberFormat.unit) || "none";
  if (unit === "auto") {
    const abs = Math.abs(n);
    unit = abs >= 1e9 ? "B" : abs >= 1e6 ? "M" : abs >= 1e3 ? "K" : "none";
  }
  const divisor = UNIT_DIVISORS[unit] || 1;
  const scaled = n / divisor;
  const opts = decimals === undefined
    ? { maximumFractionDigits: Number.isInteger(scaled) ? 0 : 2 }
    : { minimumFractionDigits: decimals, maximumFractionDigits: decimals };
  const text = scaled.toLocaleString(undefined, opts);
  return unit === "none" ? text : `${text}${unit}`;
}

function formatCell(v, numberFormat) {
  if (v === null || v === undefined) return "";
  return typeof v === "number" ? applyNumberFormat(v, numberFormat) : String(v);
}

export function computeKpiCell(dataset, binding, activeFilters) {
  const table = getTable(dataset, binding.metric?.table);
  if (!table) return { label: binding.label || "KPI", value: "—", delta: null, up: null };
  const groups = groupAndAggregate(dataset, binding.metric.table, binding.metric, null, activeFilters);
  const value = groups.length ? groups[0].value : 0;
  // Trend/delta intentionally omitted for user data (no reliable "prior period"
  // concept without a defined date-alignment rule) -- see feature plan.
  return { label: binding.label || binding.metric.column, value: applyNumberFormat(value, binding.numberFormat), delta: null, up: null };
}

export function computeBarCell(dataset, binding, activeFilters) {
  const table = getTable(dataset, binding.metric?.table);
  if (!table) return { title: binding.title || "", cats: [], vals: [], valueLabels: [], showDataLabels: !!binding.showDataLabels };
  let groups = groupAndAggregate(dataset, binding.metric.table, binding.metric, binding.groupBy, activeFilters);
  groups = applyTopN(sortGroups(groups, binding.sort), binding.topN || 12);
  const vals = groups.map((g) => g.value);
  return {
    title: binding.title || `${aggLabel(binding.metric.agg)} of ${binding.metric.column}`,
    cats: groups.map((g) => g.label),
    vals,
    // vals stays raw numbers for chart-height math; valueLabels is the
    // formatted-for-display parallel array used when data labels are on
    // (column) or always (bar, which has shown a label since day one).
    valueLabels: vals.map((v) => applyNumberFormat(v, binding.numberFormat)),
    showDataLabels: !!binding.showDataLabels,
  };
}

export function computeLineCell(dataset, binding, activeFilters) {
  if (!binding.series || binding.series.length < 2) return { title: binding.title || "", cats: [], s1: [], s2: [], valueLabels: [], showDataLabels: !!binding.showDataLabels };
  const [s1cfg, s2cfg] = binding.series;
  const table1 = getTable(dataset, s1cfg.metric?.table);
  const table2 = getTable(dataset, s2cfg.metric?.table);
  if (!table1 || !table2) return { title: binding.title || "", cats: [], s1: [], s2: [], valueLabels: [], showDataLabels: !!binding.showDataLabels };

  const map1 = new Map(groupAndAggregate(dataset, s1cfg.metric.table, s1cfg.metric, binding.groupBy, activeFilters).map((g) => [g.label, g.value]));
  const map2 = new Map(groupAndAggregate(dataset, s2cfg.metric.table, s2cfg.metric, binding.groupBy, activeFilters).map((g) => [g.label, g.value]));
  const labels = sortLabels(Array.from(new Set([...map1.keys(), ...map2.keys()])), binding.sort);
  const s1 = labels.map((l) => map1.get(l) ?? 0);

  return {
    title: binding.title || "Trend",
    cats: labels,
    s1,
    s2: labels.map((l) => map2.get(l) ?? 0),
    // Formatted labels for series 1 only -- labeling both series on a small
    // chart is too cluttered to read.
    valueLabels: s1.map((v) => applyNumberFormat(v, binding.numberFormat)),
    showDataLabels: !!binding.showDataLabels,
  };
}

export function computeDonutCell(dataset, binding, activeFilters) {
  const table = getTable(dataset, binding.metric?.table);
  if (!table) return { title: binding.title || "", segs: [] };
  let groups = groupAndAggregate(dataset, binding.metric.table, binding.metric, binding.groupBy, activeFilters);
  groups = applyTopN(sortGroups(groups, binding.sort || { by: "value", dir: "desc" }), binding.topN || 6);
  // Donut segment values are rendered as literal "%" text by charts.jsx (not
  // internally normalized for the label), so they must sum to ~100 here.
  // Decimals are configurable (default 0, matching the previous Math.round);
  // no unit control -- a percentage already carries its own "unit".
  const decimals = binding.numberFormat && Number.isFinite(binding.numberFormat.decimals) ? binding.numberFormat.decimals : 0;
  const total = groups.reduce((a, g) => a + g.value, 0);
  const segs = groups.map((g) => ({ n: g.label, v: total > 0 ? Number(((g.value / total) * 100).toFixed(decimals)) : 0 }));
  return { title: binding.title || `${aggLabel(binding.metric.agg)} of ${binding.metric.column}`, segs };
}

export function computeTableCell(dataset, binding, activeFilters) {
  if (binding.mode === "raw") {
    const table = getTable(dataset, binding.table);
    if (!table) return { title: binding.title || "", cols: [], rows: [] };
    // Real column names drive data lookup (must match dataset rows exactly);
    // display labels are a separate, optional presentation-only rename layer
    // applied only to the returned header text, never to row lookups.
    const realCols = binding.columns?.length ? binding.columns : table.columns.map((c) => c.name);
    const filteredRows = filterRows(dataset, binding.table, table.rows, activeFilters);
    const rows = filteredRows.slice(0, binding.limit || 8).map((r) => realCols.map((c) => formatCell(r[c], binding.numberFormat)));
    const cols = realCols.map((c) => binding.columnLabels?.[c] || c);
    return { title: binding.title || table.name, cols, rows };
  }
  if (binding.mode === "grouped") {
    const firstMetric = binding.metrics?.[0];
    const table = firstMetric && getTable(dataset, firstMetric.table);
    if (!table) return { title: binding.title || "", cols: [], rows: [] };

    const perMetric = binding.metrics.map((m) => ({
      label: m.label || m.column,
      groups: new Map(groupAndAggregate(dataset, m.table, m, binding.groupBy, activeFilters).map((g) => [g.label, g.value])),
    }));
    let labels = Array.from(new Set(perMetric.flatMap((m) => Array.from(m.groups.keys()))));
    labels = sortLabels(labels, binding.sort);
    if (binding.topN) labels = labels.slice(0, binding.topN);

    return {
      title: binding.title || "Summary",
      cols: [binding.groupBy?.column || "Group", ...perMetric.map((m) => m.label)],
      rows: labels.map((label) => [label, ...perMetric.map((m) => formatCell(m.groups.get(label) ?? 0, binding.numberFormat))]),
    };
  }
  return { title: binding.title || "", cols: [], rows: [] };
}

function emptyDataFor(type) {
  switch (type) {
    case "kpi": return { kpis: [{ label: "—", value: "—", delta: null, up: null }] };
    case "column":
    case "bar": return { bar: { title: "", cats: [], vals: [] } };
    case "line":
    case "area": return { line: { title: "", cats: [], s1: [], s2: [] } };
    case "donut": return { donut: { title: "", segs: [] } };
    case "table": return { table: { title: "", cols: [], rows: [] } };
    default: return {};
  }
}

export function resolveCellData(type, binding, dataset, domainFallback, activeFilters) {
  if (!binding) return domainFallback; // demo cells have no real data behind them -- filters never apply
  try {
    switch (type) {
      case "kpi": return { kpis: [computeKpiCell(dataset, binding, activeFilters)] };
      case "column":
      case "bar": return { bar: computeBarCell(dataset, binding, activeFilters) };
      case "line":
      case "area": return { line: computeLineCell(dataset, binding, activeFilters) };
      case "donut": return { donut: computeDonutCell(dataset, binding, activeFilters) };
      case "table": return { table: computeTableCell(dataset, binding, activeFilters) };
      default: return domainFallback;
    }
  } catch (e) {
    // A stale binding (renamed/removed column, deleted table) must degrade to an
    // empty visual, never crash the report preview -- no error boundary exists here.
    console.warn("resolveCellData failed, falling back to empty visual:", e);
    return emptyDataFor(type);
  }
}

// ---------- AI-proposed binding validation ----------
// resolveCellData above already guarantees a bad binding can't crash the app,
// but "won't crash" isn't "won't silently render something worse than demo
// data" -- a hallucinated-but-technically-shaped binding (wrong table, a SUM
// on a text column, an unreachable groupBy) can pass through resolveCellData
// and produce a degenerate chart instead of falling back. sanitizeAiBinding
// re-validates an AI-proposed binding against the REAL dataset before it's
// ever applied to state; anything that doesn't check out becomes null (demo
// data), never a garbage chart.

const AGGS = new Set(["sum", "avg", "min", "max", "count", "countDistinct"]);
const NUMERIC_AGGS = new Set(["sum", "avg", "min", "max"]);

function colType(dataset, tableId, colName) {
  const col = dataset.tables[tableId]?.columns.find((c) => c.name === colName);
  return col ? col.type : null;
}

function isValidMetric(dataset, m) {
  if (!m || typeof m !== "object") return false;
  if (typeof m.table !== "string" || typeof m.column !== "string" || !AGGS.has(m.agg)) return false;
  if (dataset.tables[m.table]?.role !== "fact") return false;
  const ct = colType(dataset, m.table, m.column);
  if (!ct) return false;
  if (NUMERIC_AGGS.has(m.agg) && ct !== "number") return false; // no SUM/AVG/MIN/MAX on a text column
  return true;
}

function isValidGroupBy(dataset, gb, factTableId) {
  if (gb == null) return true;
  if (typeof gb !== "object" || typeof gb.table !== "string" || typeof gb.column !== "string") return false;
  if (!colType(dataset, gb.table, gb.column)) return false;
  if (gb.table === factTableId) return true;
  return dataset.relationships.some((r) => r.factTable === factTableId && r.dimTable === gb.table);
}

// Validates one AI-proposed binding against the real dataset. Returns a clean
// binding object, or null (meaning "fall back to demo data for this cell").
export function sanitizeAiBinding(type, raw, dataset) {
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) return null;
  try {
    switch (type) {
      case "text":
        return null; // text cells never bind to data
      case "kpi":
        return isValidMetric(dataset, raw.metric)
          ? { ...(typeof raw.label === "string" && { label: raw.label }), metric: raw.metric }
          : null;
      case "column":
      case "bar":
      case "donut": {
        if (!isValidMetric(dataset, raw.metric)) return null;
        if (!isValidGroupBy(dataset, raw.groupBy, raw.metric.table)) return null;
        const out = { metric: raw.metric, groupBy: raw.groupBy ?? null };
        if (typeof raw.title === "string") out.title = raw.title;
        if (Number.isFinite(raw.topN) && raw.topN > 0) out.topN = raw.topN;
        if (raw.sort && ["label", "value"].includes(raw.sort.by) && ["asc", "desc"].includes(raw.sort.dir)) out.sort = raw.sort;
        return out;
      }
      case "line":
      case "area": {
        if (!Array.isArray(raw.series) || raw.series.length !== 2) return null;
        if (!raw.series.every((s) => s && typeof s.label === "string" && isValidMetric(dataset, s.metric))) return null;
        if (!isValidGroupBy(dataset, raw.groupBy, raw.series[0].metric.table)) return null;
        return { series: raw.series, groupBy: raw.groupBy ?? null, ...(typeof raw.title === "string" && { title: raw.title }) };
      }
      case "table": {
        if (raw.mode === "raw") {
          const table = dataset.tables[raw.table];
          const cols = table && Array.isArray(raw.columns) ? raw.columns.filter((c) => table.columns.some((tc) => tc.name === c)) : [];
          return cols.length ? { mode: "raw", table: raw.table, columns: cols, ...(Number.isFinite(raw.limit) && { limit: raw.limit }) } : null;
        }
        if (raw.mode === "grouped") {
          if (!Array.isArray(raw.metrics) || !raw.metrics.length || !raw.metrics.every((m) => isValidMetric(dataset, m))) return null;
          if (!isValidGroupBy(dataset, raw.groupBy, raw.metrics[0].table)) return null;
          return { mode: "grouped", groupBy: raw.groupBy ?? null, metrics: raw.metrics, ...(raw.sort && { sort: raw.sort }), ...(Number.isFinite(raw.topN) && { topN: raw.topN }) };
        }
        return null;
      }
      default:
        return null;
    }
  } catch {
    return null; // any malformed shape degrades to demo data, never throws
  }
}
