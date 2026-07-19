"use client";
import { useState } from "react";
import { alpha, shade } from "../lib/utils";
import { ColumnChart, HBarChart, LineChart, Donut } from "./charts";
import FilterConfigPopover from "./FilterConfigPopover";

// Distinct values for one filter's column, computed fresh from the dataset
// (not cached/narrowed by other active filters -- see feature plan's
// non-goals). Orphan/blank cells bucket into "(Unknown)", matching the same
// convention used everywhere else a raw cell value becomes a label.
function distinctFilterValues(dataset, f) {
  const table = dataset.tables[f.table];
  if (!table) return [];
  const vals = new Set(table.rows.map((r) => {
    const v = r[f.column];
    return v === null || v === undefined || v === "" ? "(Unknown)" : String(v);
  }));
  return Array.from(vals).sort();
}

/* Renders one grid cell's visual from its type + domain dummy data + theme.
   Every branch fills the cell's actual height (set by ReportPreview's card())
   via a flex column: title stays fixed-height, the chart area is flex:1 with
   minHeight:0 so its SVG can be told to fill exactly that space -- no more
   guessing height from the SVG's own viewBox aspect ratio. */
export function CellVisual({ type, d, t, idx, headerBg }) {
  // Optional per-cell title/header background (Power BI's "Title > Background
  // color" formatting option) -- a colored chip behind the title text, not a
  // full-width banner. Cell-level (not tied to a binding), so it applies to
  // demo and bound cells alike and survives toggling Demo/My data.
  const headerBgStyle = headerBg ? { background: headerBg, padding: "3px 8px", borderRadius: 4, display: "inline-block" } : {};
  const vTitle = { fontSize: t.titleSize, fontWeight: 600, color: t.foreground, marginBottom: 6, flexShrink: 0, ...headerBgStyle };
  const color = t.dataColors[idx % t.dataColors.length];

  if (type === "kpi") {
    const k = d.kpis[idx % d.kpis.length];
    return (
      <div className="h-full flex flex-col justify-center">
        <div style={{ fontSize: t.labelSize, color: t.secondaryForeground, fontWeight: 500, ...headerBgStyle }}>{k.label}</div>
        <div style={{ fontSize: t.calloutSize * 0.72, fontWeight: 700, color: t.foreground, lineHeight: 1.15, margin: "2px 0" }}>{k.value}</div>
        {k.delta != null && (
          <div style={{ fontSize: t.labelSize, fontWeight: 600, color: k.up ? t.good : t.bad }}>{k.up ? "▲" : "▼"} {k.delta}</div>
        )}
      </div>
    );
  }
  if (type === "column") return (
    <div className="h-full flex flex-col">
      <div style={vTitle}>{d.bar.title}</div>
      <div className="flex-1 min-h-0"><ColumnChart data={d.bar} color={color} sub={t.secondaryForeground} fg={t.foreground} labelSize={t.labelSize} /></div>
    </div>
  );
  if (type === "bar") return (
    <div className="h-full flex flex-col">
      <div style={vTitle}>{d.bar.title}</div>
      <div className="flex-1 min-h-0"><HBarChart data={d.bar} color={color} sub={t.secondaryForeground} fg={t.foreground} labelSize={t.labelSize} /></div>
    </div>
  );
  if (type === "line" || type === "area") {
    const c2 = t.dataColors[(idx + 3) % t.dataColors.length];
    return (
      <div className="h-full flex flex-col">
        <div style={vTitle}>{d.line.title}</div>
        <div className="flex-1 min-h-0"><LineChart data={d.line} c1={color} c2={c2} sub={t.secondaryForeground} fg={t.foreground} labelSize={t.labelSize} area={type === "area"} /></div>
        <div className="flex gap-3 mt-1" style={{ flexShrink: 0 }}>
          <span className="flex items-center gap-1" style={{ fontSize: t.labelSize, color: t.secondaryForeground }}><span style={{ width: 10, height: 3, background: color, borderRadius: 2 }} /> Actual</span>
          <span className="flex items-center gap-1" style={{ fontSize: t.labelSize, color: t.secondaryForeground }}><span style={{ width: 10, height: 3, background: c2, borderRadius: 2 }} /> Target</span>
        </div>
      </div>
    );
  }
  if (type === "donut") return (
    <div className="h-full flex flex-col">
      <div style={vTitle}>{d.donut.title}</div>
      <div className="flex-1 min-h-0"><Donut segs={d.donut.segs} colors={t.dataColors} fg={t.foreground} sub={t.secondaryForeground} labelSize={t.labelSize} /></div>
    </div>
  );
  if (type === "table") return (
    <div className="h-full flex flex-col" style={{ margin: "-10px -12px", height: "calc(100% + 20px)" }}>
      <div style={{ ...vTitle, padding: "10px 12px 4px" }}>{d.table.title}</div>
      <div className="flex-1 min-h-0" style={{ overflowY: "auto" }}>
        <table className="w-full" style={{ borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: alpha(t.tableAccent, 0.12) }}>
              {d.table.cols.map((c) => (
                <th key={c} style={{ fontSize: t.labelSize, color: t.foreground, textAlign: "left", padding: "6px 12px", fontWeight: 700, borderBottom: `2px solid ${t.tableAccent}` }}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {d.table.rows.map((r, ri) => (
              <tr key={ri} style={{ background: ri % 2 ? alpha(t.tableAccent, 0.04) : "transparent" }}>
                {r.map((cell, ci) => (
                  <td key={ci} style={{ fontSize: t.labelSize + 1, color: ci === 0 ? t.foreground : t.secondaryForeground, padding: "5.5px 12px", fontWeight: ci === 0 ? 600 : 400 }}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
  if (type === "text") return (
    <div className="h-full flex flex-col">
      <div style={vTitle}>{d.text.title}</div>
      <p className="flex-1 min-h-0" style={{ fontSize: t.labelSize + 1.5, color: t.secondaryForeground, lineHeight: 1.55, overflowY: "auto" }}>{d.text.body}</p>
    </div>
  );
  return null;
}

// filters/dataset/onSetSelection are only passed once real filters exist (see
// ReportPreview.jsx) -- an empty `filters` array renders today's static,
// non-interactive domain-demo pills. addFilter/removeFilter (only passed from
// ReportPreview, never from a context that shouldn't allow editing) drive the
// new "✎ Edit" trigger that opens FilterConfigPopover -- the same add/remove
// UI the sidebar's Filters section already has, reachable without leaving
// the live preview.
export function SlicerTop({ d, t, filters, dataset, onSetSelection, addFilter, removeFilter }) {
  const [openId, setOpenId] = useState(null);
  const [configOpen, setConfigOpen] = useState(false);
  const [configAnchor, setConfigAnchor] = useState(null);
  const hasFilters = filters && filters.length > 0;

  const toggleValue = (f, v) => {
    const sel = f.selected || [];
    onSetSelection(f.id, sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]);
  };
  const clearAll = () => filters.forEach((f) => f.selected?.length && onSetSelection(f.id, []));

  return (
    <div className="flex flex-wrap items-center gap-1.5 mb-2.5">
      <span style={{ fontSize: t.labelSize, color: t.secondaryForeground, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", marginRight: 2 }}>Filters</span>
      {!hasFilters && d.slicers.map((s) => (
        <div key={s} style={{ fontSize: t.labelSize + 0.5, color: t.foreground, background: t.background, border: `1px solid ${shade(t.background, -22)}`, borderRadius: 999, padding: "3.5px 11px" }}>{s} ▾</div>
      ))}
      {hasFilters && filters.map((f) => {
        const n = f.selected?.length || 0;
        const open = openId === f.id;
        return (
          <div key={f.id} style={{ position: "relative" }}>
            <button onClick={() => setOpenId(open ? null : f.id)}
              style={{ fontSize: t.labelSize + 0.5, color: t.foreground, background: t.background, border: `1px solid ${n ? t.tableAccent : shade(t.background, -22)}`, borderRadius: 999, padding: "3.5px 11px", cursor: "pointer" }}>
              {f.column}{n > 0 ? ` (${n})` : ""} ▾
            </button>
            {open && (
              <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 20, minWidth: 170, maxHeight: 220, overflowY: "auto", background: t.background, border: `1px solid ${shade(t.background, -22)}`, borderRadius: 8, padding: 6, boxShadow: "0 8px 20px rgba(0,0,0,0.22)" }}>
                {distinctFilterValues(dataset, f).map((v) => (
                  <label key={v} className="flex items-center gap-1.5" style={{ fontSize: t.labelSize + 0.5, color: t.foreground, padding: "3.5px 4px", cursor: "pointer" }}>
                    <input type="checkbox" checked={(f.selected || []).includes(v)} onChange={() => toggleValue(f, v)} />
                    {v}
                  </label>
                ))}
              </div>
            )}
          </div>
        );
      })}
      <div onClick={hasFilters ? clearAll : undefined} style={{ fontSize: t.labelSize + 0.5, color: t.secondaryForeground, border: `1px dashed ${shade(t.background, -30)}`, borderRadius: 999, padding: "3.5px 11px", cursor: hasFilters ? "pointer" : "default" }}>Clear all ✕</div>
      {addFilter && (
        <button onClick={(e) => { setConfigAnchor(e.currentTarget.getBoundingClientRect()); setConfigOpen(true); }} title="Edit filters"
          style={{ fontSize: t.labelSize, color: t.secondaryForeground, background: "transparent", border: `1px dashed ${shade(t.background, -30)}`, borderRadius: 999, padding: "3.5px 9px", cursor: "pointer" }}>✎ Edit</button>
      )}
      {configOpen && (
        <FilterConfigPopover anchorRect={configAnchor} dataset={dataset} filters={filters || []} addFilter={addFilter} removeFilter={removeFilter} onClose={() => setConfigOpen(false)} />
      )}
    </div>
  );
}

export function SlicerLeft({ d, t, filters, dataset, onSetSelection, addFilter, removeFilter }) {
  const [configOpen, setConfigOpen] = useState(false);
  const [configAnchor, setConfigAnchor] = useState(null);
  const hasFilters = filters && filters.length > 0;

  const toggleValue = (f, v) => {
    const sel = f.selected || [];
    onSetSelection(f.id, sel.includes(v) ? sel.filter((x) => x !== v) : [...sel, v]);
  };

  return (
    <div className="flex-shrink-0 self-stretch" style={{ width: 128, background: t.background, borderRadius: t.cardRadius, border: `1px solid ${shade(t.background, -20)}`, padding: "10px 10px", overflowY: "auto" }}>
      <div className="flex items-center justify-between" style={{ marginBottom: 8 }}>
        <span style={{ fontSize: t.labelSize, color: t.foreground, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase" }}>Filters</span>
        {addFilter && (
          <button onClick={(e) => { setConfigAnchor(e.currentTarget.getBoundingClientRect()); setConfigOpen(true); }} title="Edit filters"
            style={{ fontSize: 10, color: t.secondaryForeground, background: "transparent", border: "none", cursor: "pointer", flexShrink: 0 }}>✎</button>
        )}
      </div>
      {!hasFilters && d.slicers.map((s, si) => (
        <div key={s} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: t.labelSize, color: t.secondaryForeground, fontWeight: 600, marginBottom: 4 }}>{s}</div>
          {["All", "Option A", "Option B"].map((o, oi) => (
            <div key={o} className="flex items-center gap-1.5" style={{ marginBottom: 3 }}>
              <span style={{ width: 9, height: 9, borderRadius: 2, border: `1.5px solid ${oi === 0 ? t.dataColors[si % t.dataColors.length] : shade(t.background, -50)}`, background: oi === 0 ? t.dataColors[si % t.dataColors.length] : "transparent", flexShrink: 0 }} />
              <span style={{ fontSize: t.labelSize, color: oi === 0 ? t.foreground : t.secondaryForeground }}>{o}</span>
            </div>
          ))}
        </div>
      ))}
      {hasFilters && filters.map((f, fi) => (
        <div key={f.id} style={{ marginBottom: 10 }}>
          <div style={{ fontSize: t.labelSize, color: t.secondaryForeground, fontWeight: 600, marginBottom: 4 }}>{f.column}</div>
          <div style={{ maxHeight: 100, overflowY: "auto" }}>
          {distinctFilterValues(dataset, f).map((v) => {
            const checked = (f.selected || []).includes(v);
            return (
              <div key={v} className="flex items-center gap-1.5" style={{ marginBottom: 3, cursor: "pointer" }} onClick={() => toggleValue(f, v)}>
                <span style={{ width: 9, height: 9, borderRadius: 2, border: `1.5px solid ${checked ? t.dataColors[fi % t.dataColors.length] : shade(t.background, -50)}`, background: checked ? t.dataColors[fi % t.dataColors.length] : "transparent", flexShrink: 0 }} />
                <span style={{ fontSize: t.labelSize, color: checked ? t.foreground : t.secondaryForeground }}>{v}</span>
              </div>
            );
          })}
          </div>
        </div>
      ))}
      {configOpen && (
        <FilterConfigPopover anchorRect={configAnchor} dataset={dataset} filters={filters || []} addFilter={addFilter} removeFilter={removeFilter} onClose={() => setConfigOpen(false)} />
      )}
    </div>
  );
}
