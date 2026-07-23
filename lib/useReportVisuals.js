"use client";
import { useMemo } from "react";
import { DOMAINS, PRESETS } from "./data";
import { resolveCellData } from "./binding-engine";

// Pulls the plain title/data out of a resolved cell's per-type wrapper
// ({bar:{...}} / {line:{...}} / etc, see lib/binding-engine.js#resolveCellData).
// idx picks which entry to use for the two plural, position-cycled fields
// (groupedBars/tables -- a domain can define more than one of each, same
// convention as d.kpis; see CellVisual.jsx) -- ignored by every other type,
// and safe to omit for callers (like plan.js's column/bar/donut branch) that
// only ever deal with a singular field.
export function unwrapResolved(type, resolved, idx = 0) {
  if (type === "column" || type === "bar") return resolved.bar;
  if (type === "line" || type === "area") return resolved.line;
  if (type === "columnGrouped") {
    const arr = resolved.groupedBars;
    return arr?.length ? arr[idx % arr.length] : resolved.line;
  }
  if (type === "donut") return resolved.donut;
  if (type === "table") {
    const arr = resolved.tables;
    return arr?.length ? arr[idx % arr.length] : resolved.table;
  }
  return null;
}

// The shape sent to /api/generate-insights -- resolved numbers/labels only,
// never raw dataset rows (same posture as generate-theme's dataset schema).
export function buildVisualPayload(type, r) {
  if (type === "column" || type === "bar") {
    return { categories: r.cats, values: r.valueLabels?.length ? r.valueLabels : r.vals };
  }
  if (type === "line" || type === "area" || type === "columnGrouped") {
    return { categories: r.cats, actual: r.valueLabels?.length ? r.valueLabels : r.s1, target: r.s2 };
  }
  if (type === "donut") {
    return { segments: r.segs.map((s) => ({ name: s.n, percent: s.v })) };
  }
  if (type === "table") {
    return { columns: r.cols, rows: r.rows.slice(0, 8) };
  }
  return {};
}

// Shared derived-data hook for the Summary and KPI Deep Dive pages (both are
// read-only insight views over the same theme/layout/dataset the Report page
// edits) -- one place computing which cells are KPIs vs. chart/table
// "insightable" cells, so both pages -- and Studio, which owns the AI-caption
// fetch now that both pages need the same captions -- stay in sync.
export function useReportVisuals({ layout, dataset, domainKey }) {
  const d = DOMAINS[domainKey];
  const p = PRESETS[layout.preset];

  const activeFilters = useMemo(
    () => (layout.filters || []).filter((f) => f.selected?.length).map((f) => ({ table: f.table, column: f.column, values: new Set(f.selected) })),
    [layout.filters]
  );

  // KPI cells come from one of two places depending on the preset: the fixed
  // 4-card strip (kpicharts) or plain "kpi"-typed grid cells (every other
  // preset). Unbound grid-cell KPIs resolve to the WHOLE domain fallback (all
  // 4 KPIs, unchanged) -- CellVisual picks which one via d.kpis[idx % length]
  // using the cell's own grid position, so the same pick has to happen here
  // using this cell's overall index, or every unbound kpi cell would show the
  // domain's first KPI repeated.
  const kpiItems = useMemo(() => {
    if (p?.strip) {
      return d.kpis.map((k, i) => resolveCellData("kpi", layout.kpiStripBindings?.[i] ?? null, dataset, { kpis: [k] }, activeFilters).kpis[0]);
    }
    return layout.cells
      .map((cell, i) => ({ cell, i }))
      .filter(({ cell }) => cell.type === "kpi")
      .map(({ cell, i }) => {
        const resolved = resolveCellData("kpi", cell.binding, dataset, d, activeFilters);
        return resolved.kpis[i % resolved.kpis.length];
      });
  }, [p, layout.cells, layout.kpiStripBindings, dataset, d, activeFilters]);

  // Every cell with real chart/table data -- "kpi" and "text" (no resolvable
  // data) are excluded. Computed from the LIVE cell types, never hardcoded
  // per-preset defaults, since a user can freely retype any cell in Studio.
  const insightableCells = useMemo(() => {
    return layout.cells
      .map((cell, i) => ({ i, cell }))
      .filter(({ cell }) => cell.type !== "kpi" && cell.type !== "text")
      .map(({ i, cell }) => {
        const resolved = resolveCellData(cell.type, cell.binding, dataset, d, activeFilters);
        const r = unwrapResolved(cell.type, resolved, i);
        return { i, cell, resolved, title: r?.title || "" };
      });
  }, [layout.cells, dataset, d, activeFilters]);

  return { d, p, activeFilters, kpiItems, insightableCells };
}
