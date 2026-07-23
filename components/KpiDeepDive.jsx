"use client";
import { forwardRef } from "react";
import { PAGE_SIZES } from "../lib/data";
import { useReportVisuals } from "../lib/useReportVisuals";
import { alpha, deltaDirection } from "../lib/utils";
import { CellVisual, KpiCard, SlicerTop } from "./CellVisual";

// "Page 2" of Studio's Live report preview (Insights mode) -- a deep dive on
// ONE KPI (whichever one was clicked on Summary), not another grid-of-
// everything view. Real filters (same layout.filters the Report page uses,
// via the same SlicerTop component) still work here; the "related visuals"
// are the same chart/table cells Summary shows. Same 2-column, fixed-height
// card treatment as Summary (not a 1-per-row layout) -- a one-per-row grid
// made this page far taller than Summary for no real benefit; what actually
// differentiates this page is the hero stat, the working filters, and the
// re-targetable "other KPIs" row above, not a taller visuals grid. Captions
// come from Studio (same fetch, same cache Summary uses) -- this page never
// calls the AI route itself. Width follows layout.pageSize like Summary and
// the Report page; card heights stay fixed regardless of width.
const KpiDeepDive = forwardRef(function KpiDeepDive(
  { theme, layout, dataset, domainKey, logo, captionsByIndex, selectedKpiIndex, onSelectKpi, addFilter, removeFilter, setFilterSelection },
  ref
) {
  const { d, kpiItems, insightableCells } = useReportVisuals({ layout, dataset, domainKey });
  const safeIdx = kpiItems[selectedKpiIndex] ? selectedKpiIndex : 0;
  const kpi = kpiItems[safeIdx];
  const otherKpis = kpiItems.map((k, i) => ({ k, i })).filter(({ i }) => i !== safeIdx);
  const page = PAGE_SIZES[layout.pageSize] || PAGE_SIZES["16:9"];
  const pageLocked = layout.pageSize !== "responsive";

  return (
    <div
      ref={ref}
      style={{
        background: theme.secondaryBackground,
        borderRadius: 10,
        padding: 16,
        fontFamily: `'${theme.fontFamily}', 'Segoe UI', sans-serif`,
        width: pageLocked ? page.w : "100%",
        maxWidth: "100%",
      }}
    >
      <div className="flex items-center gap-2.5" style={{ marginBottom: 10 }}>
        {logo ? (
          <img src={logo} alt="brand logo" style={{ height: 24, maxWidth: 80, objectFit: "contain" }} />
        ) : (
          <div style={{ width: 24, height: 24, borderRadius: 6, background: theme.dataColors[0], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
            {d.label.charAt(0)}
          </div>
        )}
        <div style={{ fontSize: theme.labelSize, color: theme.secondaryForeground }}>
          {d.label} <span style={{ opacity: 0.6 }}>›</span> <b style={{ color: theme.foreground }}>{kpi ? kpi.label : "KPI Deep Dive"}</b>
        </div>
      </div>

      {kpi ? (
        <>
          <div style={{
            display: "flex", alignItems: "center", gap: 16,
            background: theme.background, borderRadius: theme.cardRadius,
            borderLeft: `4px solid ${theme.dataColors[safeIdx % theme.dataColors.length]}`,
            padding: "12px 16px", marginBottom: 10, boxShadow: "0 1px 2px rgba(15,20,30,0.06)",
          }}>
            <div>
              <div style={{ fontSize: theme.labelSize - 0.5, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", color: theme.secondaryForeground, marginBottom: 2 }}>{kpi.label}</div>
              <div style={{ fontSize: theme.calloutSize, fontWeight: 800, color: theme.foreground, lineHeight: 1 }}>{kpi.value}</div>
            </div>
            {kpi.delta != null && (() => {
              const dir = deltaDirection(kpi.delta);
              return (
                <div style={{ fontSize: theme.labelSize + 1, fontWeight: 700, color: kpi.isGood ? theme.good : theme.bad, marginLeft: "auto" }}>
                  {dir === "down" ? "▼" : dir === "up" ? "▲" : "―"} {kpi.delta}
                </div>
              );
            })()}
          </div>

          <div style={{ marginBottom: 10 }}>
            <SlicerTop d={d} t={theme} filters={layout.filters} dataset={dataset} onSetSelection={setFilterSelection} addFilter={addFilter} removeFilter={removeFilter} />
          </div>

          {otherKpis.length > 0 && (
            <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", marginBottom: 12 }}>
              {otherKpis.map(({ k, i }) => <KpiCard key={i} k={k} t={theme} idx={i} onClick={() => onSelectKpi(i)} />)}
            </div>
          )}

          {insightableCells.length > 0 ? (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
              {insightableCells.map((item) => (
                <div key={item.i}>
                  <div style={{ background: theme.background, borderRadius: theme.cardRadius, padding: "10px 12px", boxShadow: "0 1px 2px rgba(15,20,30,0.06)", height: 210, marginBottom: 8, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                    <div style={{ flex: 1, minHeight: 0 }}>
                      <CellVisual type={item.cell.type} d={item.resolved} t={theme} idx={item.i} headerBg={item.cell.headerBg} />
                    </div>
                  </div>
                  <div style={{
                    display: "flex", gap: 8,
                    background: alpha(theme.tableAccent, 0.08),
                    border: `1px solid ${alpha(theme.tableAccent, 0.35)}`,
                    borderLeft: `3px solid ${theme.tableAccent}`,
                    borderRadius: theme.cardRadius,
                    padding: "8px 11px",
                  }}>
                    <div style={{ fontSize: 12, color: theme.tableAccent, flexShrink: 0 }}>✦</div>
                    <div className="min-w-0">
                      <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: theme.tableAccent, marginBottom: 2 }}>AI Summary</div>
                      <p style={{ fontSize: theme.labelSize + 0.5, lineHeight: 1.45, color: theme.foreground, margin: 0, minHeight: (theme.labelSize + 0.5) * 1.45 }}>
                        {captionsByIndex[item.i] || ""}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: theme.secondaryForeground, fontSize: 12 }}>No related chart/table visuals in this layout yet — add one in the Layout tab.</p>
          )}
        </>
      ) : (
        <p style={{ color: theme.secondaryForeground, fontSize: 12 }}>No KPI visuals in this layout yet — add one in the Layout tab, then click it on the Summary page.</p>
      )}
    </div>
  );
});

export default KpiDeepDive;
