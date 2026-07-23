"use client";
import { forwardRef, useMemo, useState } from "react";
import { DOMAINS, PRESETS, PAGE_SIZES } from "../lib/data";
import { alpha, shade } from "../lib/utils";
import { Y } from "../lib/chrome";
import { resolveCellData } from "../lib/binding-engine";
import { CellVisual, SlicerTop, SlicerLeft } from "./CellVisual";
import CellEditPopover from "./CellEditPopover";

/* The live Power BI report canvas. In locked mode (16:9 / 4:3) the canvas keeps
   the exact page proportions and grid rows share true heights; the header band
   height renders as its real fraction of the canvas. Cells are tappable.
   Forwards a ref to the root canvas node so Studio can rasterize it for the
   PNG/PDF share export -- independent of the on-screen zoom transform, which
   lives on an ancestor and doesn't affect this node's own layout box. */
const ReportPreview = forwardRef(function ReportPreview({ domainKey, theme, layout, logo, selectedCell, onSelectCell, dataset, setCellVisual, setCellBinding, setKpiStripBinding, setFilterSelection, setCellHeaderBg, addFilter, removeFilter, hideEditAffordances }, ref) {
  // { anchorRect, isKpiStrip, index } | null -- drives the in-place edit
  // popover, a faster alternative to scrolling the sidebar's Layout tab.
  const [editing, setEditing] = useState(null);
  const d = DOMAINS[domainKey];
  const t = theme;

  // Only filters with at least one selected value actually constrain
  // anything -- an untouched filter ("All") is a no-op, same convention as
  // groupBy/sort/etc. being absent meaning "don't apply this."
  const activeFilters = useMemo(
    () => (layout.filters || []).filter((f) => f.selected?.length).map((f) => ({ table: f.table, column: f.column, values: new Set(f.selected) })),
    [layout.filters]
  );

  // Resolve each cell's data once per (cells, dataset, domain, filters) change,
  // not on every theme-color re-render -- aggregation only needs to re-run
  // when the binding config, the underlying dataset, or the active filters change.
  const resolvedCells = useMemo(
    () => layout.cells.map((cell) => resolveCellData(cell.type, cell.binding, dataset, d, activeFilters)),
    [layout.cells, dataset, d, activeFilters]
  );
  // Same binding machinery as the grid cells, applied to the 4 fixed
  // KPI-strip cards (kpicharts preset only) -- each card independently falls
  // back to its own domain-demo KPI when unbound.
  const resolvedKpiStrip = useMemo(
    () => d.kpis.map((k, i) => resolveCellData("kpi", layout.kpiStripBindings?.[i] ?? null, dataset, { kpis: [k] }, activeFilters).kpis[0]),
    [layout.kpiStripBindings, dataset, d, activeFilters]
  );
  const p = PRESETS[layout.preset];
  const locked = layout.pageSize !== "responsive";
  const page = PAGE_SIZES[layout.pageSize] || PAGE_SIZES["16:9"];
  const rows = Math.ceil(p.cells / p.cols);
  const showHeader = layout.header?.show !== false;
  const headerPct = ((layout.header?.height || 64) / page.h) * 100;

  const card = (i) => ({
    background: t.background,
    borderRadius: t.cardRadius,
    border: selectedCell === i ? `2px solid ${Y}` : `1px solid ${shade(t.background, -20)}`,
    boxShadow: selectedCell === i ? `0 0 0 3px ${alpha(Y, 0.25)}` : "0 1px 2px rgba(15,20,30,0.06)",
    padding: "10px 12px",
    cursor: "pointer",
    overflow: "hidden",
    position: "relative",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    // In locked mode the grid already gives every cell a definite height
    // (minmax(0,1fr) rows). In "Fit width" mode rows are content-sized, so
    // charts have nothing definite to fill -- give cells their own ratio.
    ...(locked ? {} : { aspectRatio: "4 / 3" }),
  });

  const gridColsClass = p.cols === 4 ? "grid-cols-2 lg:grid-cols-4" : p.cols === 3 ? "grid-cols-1 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2";

  const canvasStyle = {
    background: t.secondaryBackground,
    borderRadius: 10,
    padding: 14,
    fontFamily: `'${t.fontFamily}', 'Segoe UI', sans-serif`,
    // maxWidth (not just aspectRatio) is what actually makes 4:3 look like a
    // narrower page instead of just a taller one -- without it, this div
    // always stretches to fill the panel and only its height reacts to the
    // page's ratio, so 16:9 vs 4:3 never visibly differ in width. Centered
    // since a narrower locked canvas otherwise sits flush left, which reads
    // as a layout bug rather than "this is a smaller page."
    ...(locked ? { aspectRatio: `${page.w} / ${page.h}`, maxWidth: page.w, margin: "0 auto", display: "flex", flexDirection: "column", overflow: "hidden" } : {}),
  };

  return (
    <div ref={ref} style={canvasStyle}>
      {/* header band — reserved space for logo + dashboard title */}
      {showHeader && (
        <div className="flex items-center justify-between" style={{ gap: 10, ...(locked ? { height: `${headerPct}%`, flexShrink: 0, marginBottom: 6 } : { marginBottom: 12 }) }}>
          <div className="flex items-center gap-2.5 min-w-0">
            {logo ? (
              <img src={logo} alt="brand logo" style={{ height: 26, maxWidth: 90, objectFit: "contain" }} />
            ) : (
              <div style={{ width: 26, height: 26, borderRadius: 6, background: t.dataColors[0], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12 }}>B</div>
            )}
            <div className="min-w-0">
              <div className="truncate" style={{ fontSize: t.titleSize + 3, fontWeight: 700, color: t.foreground }}>{d.label} Dashboard</div>
              <div style={{ fontSize: t.labelSize, color: t.secondaryForeground }}>Refreshed today · {p.label}{locked ? ` · ${page.label} canvas` : ""}</div>
            </div>
          </div>
        </div>
      )}

      {layout.slicerPos === "top" && (
        <SlicerTop d={d} t={t} filters={layout.filters} dataset={dataset} onSetSelection={setFilterSelection} addFilter={addFilter} removeFilter={removeFilter} hideEditAffordances={hideEditAffordances} />
      )}

      <div className="flex gap-2.5" style={locked ? { flex: 1, minHeight: 0 } : {}}>
        {layout.slicerPos === "left" && (
          <SlicerLeft d={d} t={t} filters={layout.filters} dataset={dataset} onSetSelection={setFilterSelection} addFilter={addFilter} removeFilter={removeFilter} hideEditAffordances={hideEditAffordances} />
        )}
        <div className="flex-1 min-w-0" style={locked ? { display: "flex", flexDirection: "column", minHeight: 0 } : {}}>
          {/* fixed KPI strip for the kpicharts preset */}
          {p.strip && (
            // One row, every card -- not capped at 4 columns. A domain with
            // more KPIs than the original 4-card strip (e.g. Marketing / Web
            // Analytics' 7) needs all of them side by side in a single row,
            // matching the reference dashboard, not wrapped into extra rows.
            <div className="grid gap-2.5 mb-2.5" style={{ gridTemplateColumns: `repeat(${resolvedKpiStrip.length}, minmax(0,1fr))`, ...(locked ? { flexShrink: 0 } : {}) }}>
              {resolvedKpiStrip.map((k, i) => {
                const isEditingThis = editing?.isKpiStrip && editing.index === i;
                return (
                <div key={i} onClick={(e) => setEditing({ anchorRect: e.currentTarget.getBoundingClientRect(), isKpiStrip: true, index: i })} title="Tap to edit this card" style={{
                  position: "relative",
                  cursor: "pointer",
                  background: t.background, borderRadius: t.cardRadius,
                  borderTop: `3px solid ${t.dataColors[i % t.dataColors.length]}`,
                  borderRight: `1px solid ${isEditingThis ? Y : shade(t.background, -20)}`,
                  borderBottom: `1px solid ${isEditingThis ? Y : shade(t.background, -20)}`,
                  borderLeft: `1px solid ${isEditingThis ? Y : shade(t.background, -20)}`,
                  padding: "10px 12px",
                }}>
                  {!hideEditAffordances && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setEditing({ anchorRect: e.currentTarget.getBoundingClientRect(), isKpiStrip: true, index: i }); }}
                      title="Edit this KPI"
                      style={{ position: "absolute", top: 5, right: 7, fontSize: 9, lineHeight: 1, color: alpha(t.foreground, 0.55), background: alpha(t.background, 0.9), border: `1px solid ${shade(t.background, -20)}`, borderRadius: 4, padding: "2px 5px", cursor: "pointer", zIndex: 1 }}
                    >✎</button>
                  )}
                  <div style={{ fontSize: t.labelSize, color: t.secondaryForeground, fontWeight: 500 }}>{k.label}</div>
                  <div style={{ fontSize: t.calloutSize * 0.72, fontWeight: 700, color: t.foreground, lineHeight: 1.15, margin: "2px 0" }}>{k.value}</div>
                  {k.delta != null && (
                    <div style={{ fontSize: t.labelSize, fontWeight: 600, color: k.up ? t.good : t.bad }}>{k.up ? "▲" : "▼"} {k.delta}</div>
                  )}
                </div>
                );
              })}
            </div>
          )}

          {/* configurable grid — locked mode uses true canvas proportions */}
          <div
            className={locked ? "grid gap-2.5" : `grid ${gridColsClass} gap-2.5`}
            style={locked ? { flex: 1, minHeight: 0, gridTemplateColumns: `repeat(${p.cols}, minmax(0,1fr))`, gridTemplateRows: `repeat(${rows}, minmax(0,1fr))` } : {}}
          >
            {layout.cells.map((cell, i) => (
              <div key={i} style={card(i)} onClick={(e) => { onSelectCell(i); setEditing({ anchorRect: e.currentTarget.getBoundingClientRect(), isKpiStrip: false, index: i }); }} title="Tap to edit this cell">
                <div style={{ position: "absolute", top: 5, right: 7, display: "flex", alignItems: "center", gap: 4, zIndex: 1 }}>
                  {!hideEditAffordances && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onSelectCell(i); setEditing({ anchorRect: e.currentTarget.getBoundingClientRect(), isKpiStrip: false, index: i }); }}
                      title="Edit this cell"
                      style={{ fontSize: 9, lineHeight: 1, color: alpha(t.foreground, 0.55), background: alpha(t.background, 0.9), border: `1px solid ${shade(t.background, -20)}`, borderRadius: 4, padding: "2px 5px", cursor: "pointer" }}
                    >✎</button>
                  )}
                  <span style={{ fontSize: 9, fontWeight: 700, color: selectedCell === i ? "#8a7208" : alpha(t.foreground, 0.28), background: selectedCell === i ? alpha(Y, 0.9) : "transparent", borderRadius: 4, padding: "1px 5px" }}>{i + 1}</span>
                </div>
                <CellVisual type={cell.type} d={resolvedCells[i]} t={t} idx={i} headerBg={cell.headerBg} />
              </div>
            ))}
          </div>
        </div>
      </div>

      {editing && editing.isKpiStrip && (
        <CellEditPopover
          anchorRect={editing.anchorRect}
          cellType="kpi"
          binding={layout.kpiStripBindings?.[editing.index] ?? null}
          dataset={dataset}
          lockType
          onSetBinding={(b) => setKpiStripBinding(editing.index, b)}
          onClose={() => setEditing(null)}
        />
      )}
      {editing && !editing.isKpiStrip && layout.cells[editing.index] && (
        <CellEditPopover
          anchorRect={editing.anchorRect}
          cellType={layout.cells[editing.index].type}
          binding={layout.cells[editing.index].binding}
          dataset={dataset}
          onSetVisual={(v) => setCellVisual(editing.index, v)}
          onSetBinding={(b) => setCellBinding(editing.index, b)}
          onClose={() => setEditing(null)}
          headerBg={layout.cells[editing.index].headerBg}
          onSetHeaderBg={(c) => setCellHeaderBg(editing.index, c)}
        />
      )}
    </div>
  );
});

export default ReportPreview;
