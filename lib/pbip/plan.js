import { DOMAINS, PRESETS } from "../data";
import { resolveCellData } from "../binding-engine";
import { buildLayoutSpec } from "../theme-builder";
import { unwrapResolved } from "../useReportVisuals";

// Turns theme/layout/dataset into one flat "export plan" that both the
// semantic-model (TMDL) builder and the report (visual JSON) builder read
// from -- keeps table/column/measure names generated exactly once, so a
// visual's field reference always matches the table that actually gets
// emitted for it.
//
// Two kinds of table end up in the model:
//  - REAL tables: a cell is bound to the user's imported dataset (lib/dataset.js).
//    Emitted with their real rows and a genuine DAX aggregation measure.
//  - SYNTHETIC tables: an unbound cell shows domain demo data (lib/data.js).
//    There's no underlying transactional data to aggregate -- domain KPI
//    values are hand-written display strings ("87.6%", "€48.2M"), not numbers
//    -- so each demo cell gets its own tiny literal table (the exact
//    numbers/categories currently on screen) and a real SUM measure over it.
//    It's a genuine, computable DAX measure; it just isn't "real" BI the way
//    a bound cell over uploaded data is. See README's PBIP export section.

export const q = (name) => `'${String(name ?? "").trim().replace(/\s+/g, " ").replace(/'/g, "''").slice(0, 80) || "Value"}'`;
export const bq = (name) => `[${String(name ?? "").trim().replace(/\s+/g, " ").replace(/[\[\]]/g, "").slice(0, 80) || "Value"}]`;

const AGG_DAX = { sum: "SUM", avg: "AVERAGE", min: "MIN", max: "MAX" };

function aggMeasureExpr(agg, tableName, columnName) {
  if (agg === "count") return `COUNTROWS(${q(tableName)})`;
  if (agg === "countDistinct") return `DISTINCTCOUNT(${q(tableName)}${bq(columnName)})`;
  return `${AGG_DAX[agg] || "SUM"}(${q(tableName)}${bq(columnName)})`;
}

// "7,214" / "87.6%" / "€48.2M" / "-8.4%" -> best-effort leading number.
function parseLeadingNumber(str) {
  const m = String(str ?? "").match(/-?[\d,]+(\.\d+)?/);
  return m ? Number(m[0].replace(/,/g, "")) || 0 : 0;
}

function makeSyntheticTable(plan, baseName, columns, rows) {
  const name = uniqueTableName(plan, baseName);
  plan.tables.set(name, { name, real: false, columns, rows });
  return name;
}

function uniqueTableName(plan, base) {
  let name = base, n = 1;
  while (plan.tables.has(name)) name = `${base} ${++n}`;
  return name;
}

// Ensures a real dataset table is present in the plan (deduplicated) and
// returns its plan name (same as its dataset display name).
function ensureRealTable(plan, dataset, tableId) {
  const t = dataset.tables[tableId];
  if (!t) return null;
  if (!plan.tables.has(t.name)) {
    plan.tables.set(t.name, { name: t.name, real: true, id: t.id, columns: t.columns, rows: t.rows, role: t.role });
  }
  return t.name;
}

function ensureRealRelationship(plan, dataset, factTableId, dimTableId) {
  if (factTableId === dimTableId) return;
  const rel = dataset.relationships.find((r) => r.factTable === factTableId && r.dimTable === dimTableId);
  if (!rel) return;
  const factName = dataset.tables[factTableId]?.name, dimName = dataset.tables[dimTableId]?.name;
  if (!factName || !dimName) return;
  const key = `${factName}::${rel.factColumn}->${dimName}::${rel.dimColumn}`;
  if (plan.relationships.some((r) => r.key === key)) return;
  plan.relationships.push({ key, fromTable: factName, fromColumn: rel.factColumn, toTable: dimName, toColumn: rel.dimColumn });
}

// Resolves one metric ({table,column,agg}) against real data -> a measure
// definition {tableName, measureName, dax}. Also pulls in the groupBy's
// table (if it's a different, joined dimension table) so the relationship
// it depends on is available to the model.
function planRealMetric(plan, dataset, metric, groupBy, label) {
  const tableName = ensureRealTable(plan, dataset, metric.table);
  if (!tableName) return null;
  if (groupBy && groupBy.table !== metric.table) {
    const dimName = ensureRealTable(plan, dataset, groupBy.table);
    if (dimName) ensureRealRelationship(plan, dataset, metric.table, groupBy.table);
  }
  const measureName = uniqueMeasureName(plan, tableName, label || `${metric.agg} of ${metric.column}`);
  plan.measures.push({ tableName, measureName, dax: aggMeasureExpr(metric.agg, tableName, metric.column) });
  return { tableName, measureName, real: true };
}

// A measure's name must be unique against both other measures AND every
// column in the same table -- Power BI rejects "measure 'Quality' already
// exists as a column" otherwise. Easy to hit: a KPI/chart label naturally
// matches the column it's summarizing (a "Quality" card built from a
// "Quality" column).
function uniqueMeasureName(plan, tableName, base) {
  const columnNames = (plan.tables.get(tableName)?.columns || []).map((c) => c.name);
  // Analysis Services compares object names case-insensitively within a table,
  // so "quality" and "Quality" still collide even though they aren't ===.
  const existing = new Set([...plan.measures.filter((m) => m.tableName === tableName).map((m) => m.measureName), ...columnNames].map((n) => n.toLowerCase()));
  let name = base, n = 1;
  while (existing.has(name.toLowerCase())) name = `${base} ${++n}`;
  return name;
}

function synthMeasure(plan, tableName, columnName, label) {
  const measureName = uniqueMeasureName(plan, tableName, label || columnName);
  plan.measures.push({ tableName, measureName, dax: `SUM(${q(tableName)}${bq(columnName)})` });
  return { tableName, measureName, real: false };
}

// One demo/synthetic table with a category column + one-or-two numeric value
// columns -- covers column/bar/donut/line/area's shape uniformly.
function planCategorySeries(plan, baseName, cats, seriesDefs, categoryLabel = "Category") {
  const columns = [{ name: categoryLabel, type: "string" }, ...seriesDefs.map((s) => ({ name: s.colName, type: "number" }))];
  const rows = cats.map((c, i) => {
    const row = { [categoryLabel]: c };
    seriesDefs.forEach((s) => { row[s.colName] = s.vals[i] ?? 0; });
    return row;
  });
  const tableName = makeSyntheticTable(plan, baseName, columns, rows);
  return seriesDefs.map((s) => synthMeasure(plan, tableName, s.colName, s.label)).map((m, i) => ({ ...m, tableName }));
}

// Demo charts have no real dimension column, only a title like "Updates by
// Region" -- pulling "Region" out of that (when the title follows "X by Y")
// gives the axis/legend/auto-title a real field name instead of the literal
// word "Category" showing up everywhere (axis label, donut legend title, and
// Power BI's auto-generated chart title all read straight from the column
// name). Donut/line titles rarely follow "X by Y" ("Failure Root Causes",
// "Campaign Rollout Curve"), so those kinds get a fixed, still-meaningful
// fallback instead of literally "Category".
function inferCategoryLabel(kind, title) {
  if (kind === "donut") return "Segment";
  if (kind === "line" || kind === "area") return "Period";
  const m = /\bby\s+(.+)$/i.exec(title || "");
  return (m && m[1].trim()) || "Category";
}

// Power BI has no reliable way to fully override a chart's auto-generated
// title from this exporter (every "objects.title" shape tried so far is
// silently ignored by Desktop) -- so instead of fighting it, feed it a
// measure name that composes into a clean title on its own. Desktop's
// auto-title is "<measure name> by <category field>"; naming the measure
// after the WHOLE chart title (e.g. "Updates by Region") doubles the
// suffix once Desktop appends "by Region" itself. Stripping the trailing
// "by X" here (leaving just "Updates") lets Desktop's own composition
// reproduce the original title exactly.
function measureLabelFor(title, kind) {
  return (title || kind || "Value").replace(/\s+by\s+.+$/i, "").trim() || title || kind || "Value";
}

function planCell(plan, { cell, i, dataset, d, activeFilters, geom }) {
  if (!geom || cell.type === "text") {
    if (cell.type === "text") return { kind: "text", cellIndex: i, title: d.text.title, body: d.text.body, geom };
    return null;
  }
  const resolved = resolveCellData(cell.type, cell.binding, dataset, d, activeFilters);
  const bound = cell.binding != null;

  if (cell.type === "kpi") {
    if (bound) {
      const m = planRealMetric(plan, dataset, cell.binding.metric, null, cell.binding.label);
      return m && { kind: "kpi", cellIndex: i, geom, label: cell.binding.label || cell.binding.metric.column, measure: m };
    }
    const kpi = d.kpis[i % d.kpis.length];
    const tableName = makeSyntheticTable(plan, `Cell ${i + 1} KPI`, [{ name: "Value", type: "number" }], [{ Value: parseLeadingNumber(kpi.value) }]);
    const measure = synthMeasure(plan, tableName, "Value", kpi.label);
    return { kind: "kpi", cellIndex: i, geom, label: kpi.label, measure: { ...measure, tableName } };
  }

  if (cell.type === "column" || cell.type === "bar" || cell.type === "donut") {
    // resolveCellData returns the WHOLE domain object unchanged for unbound
    // cells (not a per-type wrapper) -- unwrapResolved is the one place that
    // already knows how to pick the right field for both the bound and
    // unbound shape (see lib/useReportVisuals.js); picking resolved.bar
    // directly here would silently grab the wrong data for an unbound donut.
    const r = unwrapResolved(cell.type, resolved);
    const cats = cell.type === "donut" ? r.segs.map((s) => s.n) : r.cats;
    const vals = cell.type === "donut" ? r.segs.map((s) => s.v) : r.vals;
    let measure;
    const catLabel = inferCategoryLabel(cell.type, r.title);
    if (bound) {
      measure = planRealMetric(plan, dataset, cell.binding.metric, cell.binding.groupBy, cell.binding.title);
      if (!measure) return null;
    } else {
      [measure] = planCategorySeries(plan, `Cell ${i + 1} — ${r.title || cell.type}`, cats, [{ colName: "Value", vals, label: measureLabelFor(r.title, cell.type) }], catLabel);
    }
    // groupBy.table/metric.table are dataset TABLE IDS (slugified -- e.g.
    // "dim-campaign" for a table actually named "dim_campaign"), never the
    // real TMDL table name. Using the raw id as the visual's Entity reference
    // silently produced a query pointing at a table that doesn't exist in the
    // model ("Something's wrong with one or more fields: (dim-campaign)
    // platform" in Desktop) whenever a table's id and display name differ --
    // true for any name with an underscore, space, or uppercase letter.
    // ensureRealTable is idempotent -- the table's already registered from
    // planRealMetric above, this just resolves its id to its real name.
    const categoryCol = bound ? (cell.binding.groupBy?.column || null) : catLabel;
    const categoryTable = bound
      ? ensureRealTable(plan, dataset, cell.binding.groupBy?.table || cell.binding.metric.table)
      : measure.tableName;
    return { kind: cell.type, cellIndex: i, geom, title: r.title, measure, categoryTable, categoryCol };
  }

  if (cell.type === "line" || cell.type === "area") {
    const r = unwrapResolved(cell.type, resolved);
    let m1, m2, categoryTable, categoryCol;
    if (bound) {
      const [s1, s2] = cell.binding.series;
      m1 = planRealMetric(plan, dataset, s1.metric, cell.binding.groupBy, s1.label);
      m2 = planRealMetric(plan, dataset, s2.metric, cell.binding.groupBy, s2.label);
      if (!m1 || !m2) return null;
      // Same id-vs-name fix as column/bar/donut above.
      categoryTable = ensureRealTable(plan, dataset, cell.binding.groupBy?.table || s1.metric.table);
      categoryCol = cell.binding.groupBy?.column || null;
    } else {
      const catLabel = inferCategoryLabel(cell.type, r.title);
      [m1, m2] = planCategorySeries(plan, `Cell ${i + 1} — ${r.title || "Trend"}`, r.cats, [
        // Labels must differ from colName -- Power BI rejects a measure and a
        // column sharing one name in the same table. "Actual"/"Target" also
        // matches the legend CellVisual.jsx already renders for this chart.
        { colName: "Series 1", vals: r.s1, label: "Actual" },
        { colName: "Series 2", vals: r.s2, label: "Target" },
      ], catLabel);
      categoryTable = m1.tableName;
      categoryCol = catLabel;
    }
    return { kind: cell.type, cellIndex: i, geom, title: r.title, measure1: m1, measure2: m2, categoryTable, categoryCol };
  }

  if (cell.type === "table") {
    // A bound table cell should reference the REAL table/columns (or real
    // measures for grouped mode) directly, exactly like every other bound
    // visual -- not flatten whatever's currently on screen into a brand-new
    // synthetic snapshot table capped at 8 rows. That flattening used to run
    // unconditionally here regardless of `bound`, which is why a table cell
    // wired to e.g. dim_campaign showed up in the model as its own fake
    // "Cell N — <title>" table instead of dim_campaign itself.
    if (bound && cell.binding.mode === "raw") {
      const table = dataset.tables[cell.binding.table];
      const tableName = ensureRealTable(plan, dataset, cell.binding.table);
      if (tableName && table) {
        const realCols = cell.binding.columns?.length ? cell.binding.columns : table.columns.map((c) => c.name);
        return { kind: "table", cellIndex: i, geom, mode: "raw", title: cell.binding.title || table.name, tableName, columns: realCols };
      }
      // Stale binding (table since removed) -- fall through to the synthetic snapshot below.
    } else if (bound && cell.binding.mode === "grouped" && cell.binding.metrics?.length) {
      const gb = cell.binding.groupBy;
      const firstTableName = ensureRealTable(plan, dataset, cell.binding.metrics[0].table);
      if (firstTableName) {
        let groupByTableName = null;
        if (gb) {
          groupByTableName = gb.table === cell.binding.metrics[0].table ? firstTableName : ensureRealTable(plan, dataset, gb.table);
          if (groupByTableName && gb.table !== cell.binding.metrics[0].table) ensureRealRelationship(plan, dataset, cell.binding.metrics[0].table, gb.table);
        }
        const measures = cell.binding.metrics.map((m) => planRealMetric(plan, dataset, m, gb, m.label)).filter(Boolean);
        if (measures.length) {
          return { kind: "table", cellIndex: i, geom, mode: "grouped", title: cell.binding.title || "Summary", groupByTableName, groupByCol: gb?.column, measures };
        }
      }
      // Stale binding -- fall through to the synthetic snapshot below.
    }

    // Unbound demo cells (and stale bindings above) -- bake the
    // currently-resolved preview values into a small literal table, same
    // fallback every other visual type uses for its own demo data.
    const r = unwrapResolved("table", resolved);
    // Infer each column's type from its values rather than dumping everything
    // as text: a column is numeric only when every non-empty cell is a clean
    // number (no %, currency symbol, or other text) -- so "142" imports as a
    // real number you can aggregate, while "78%" or "Power BI" stay text. This
    // is what fixes value columns landing as text in the exported table.
    const numericCol = r.cols.map((_, ci) => {
      let sawValue = false;
      for (const row of r.rows) {
        const raw = row[ci];
        if (raw === null || raw === undefined || String(raw).trim() === "") continue;
        sawValue = true;
        if (!/^-?\d+(\.\d+)?$/.test(String(raw).trim().replace(/,/g, ""))) return false;
      }
      return sawValue;
    });
    const columns = r.cols.map((c, ci) => ({ name: c, type: numericCol[ci] ? "number" : "string" }));
    const rows = r.rows.map((row) => Object.fromEntries(r.cols.map((c, ci) => {
      const raw = row[ci];
      if (numericCol[ci]) return [c, Number(String(raw ?? "").trim().replace(/,/g, "")) || 0];
      return [c, String(raw ?? "")];
    })));
    const tableName = makeSyntheticTable(plan, `Cell ${i + 1} — ${r.title || "Table"}`, columns, rows);
    return { kind: "table", cellIndex: i, geom, mode: "synthetic", title: r.title, tableName, columns: r.cols };
  }

  return null;
}

// activeFilters mirrors useReportVisuals' shape (used only to keep
// resolveCellData's signature happy -- the exported model always represents
// the UNFILTERED, all-rows report; slicer state is a live-preview-only
// concept, not something baked into a static export).
export function buildExportPlan({ theme, layout, domainKey, dataset }) {
  const d = DOMAINS[domainKey];
  const p = PRESETS[layout.preset];
  const layoutSpec = buildLayoutSpec(layout, domainKey);
  const activeFilters = [];

  // Matches Summary.jsx's own live-preview header exactly ("Automotive /
  // OTA — Summary") -- Desktop shows this as the .Report item's display
  // name, so it should read like the report the user was just looking at,
  // not the raw filename they typed into the export dialog.
  const reportTitle = `${d.label} — Summary`;

  const plan = { tables: new Map(), relationships: [], measures: [], visuals: [], slicers: [], header: null, page: layoutSpec.page, reportTitle };

  if (layoutSpec.headerBand) {
    plan.header = { geom: layoutSpec.headerBand, text: theme.name || d.label };
  }

  if (p.strip) {
    (layout.kpiStripBindings || [null, null, null, null]).forEach((binding, i) => {
      const geom = layoutSpec.kpiStrip?.[i];
      const fakeCell = { type: "kpi", binding };
      const v = planCell(plan, { cell: fakeCell, i: 1000 + i, dataset, d, activeFilters, geom });
      if (v) plan.visuals.push(v);
    });
  }

  layout.cells.forEach((cell, i) => {
    const geom = layoutSpec.cells?.[i];
    const v = planCell(plan, { cell, i, dataset, d, activeFilters, geom });
    if (v) plan.visuals.push(v);
  });

  // Real, bound slicers only -- layout.filters already point at real
  // dataset table/columns (see FiltersSection in CorePanels.jsx). The
  // static demo Filters-bar pills have no underlying column to bind a real
  // slicer to, so slicerPos alone (no filters defined) produces no slicer
  // visuals -- documented limitation, not a bug.
  // Fixed-size chips with gaps, not stretched to fill the band -- matches
  // Power BI Desktop's own default slicer size (183x81) rather than a
  // full-width bar. buildLayoutSpec's topSlicer/leftSlicer band height/width
  // already reserves SLICER_H/SLICER_W accordingly.
  const SLICER_W = 183, SLICER_H = 81, SLICER_GAP = 12;
  const band = layoutSpec.slicers?.topStrip || layoutSpec.slicers?.leftRail;
  const filters = layout.filters || [];
  if (band && filters.length) {
    const vertical = !!layoutSpec.slicers.leftRail;
    filters.forEach((f, i) => {
      const tableName = ensureRealTable(plan, dataset, f.table);
      if (!tableName) return;
      const geom = vertical
        ? { x: band.x, y: band.y + i * (SLICER_H + SLICER_GAP), width: SLICER_W, height: SLICER_H }
        : { x: band.x + i * (SLICER_W + SLICER_GAP), y: band.y, width: SLICER_W, height: SLICER_H };
      plan.slicers.push({ geom, tableName, column: f.column });
    });
  }

  return plan;
}
