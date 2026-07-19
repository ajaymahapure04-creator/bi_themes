"use client";
import { forwardRef } from "react";
import { PAGE_SIZES } from "../lib/data";
import { useReportVisuals } from "../lib/useReportVisuals";
import { alpha } from "../lib/utils";
import { CellVisual, KpiCard } from "./CellVisual";

// "Page 1" of Studio's Live report preview -- rendered inline (not a routed
// page), receiving the same theme/layout/dataset/domainKey the actual report
// page uses. Purely presentational: captions/loading/AI-fetching now live in
// Studio (lib/useReportVisuals.js derives the same KPI/insightable-cell data
// KpiDeepDive needs too, and both pages share one set of captions rather than
// each fetching their own). Unlike the Report page, this one is allowed to
// grow taller than one Power BI page and scroll -- but its WIDTH still
// follows layout.pageSize (1280/960/stretch), same as the Report page, so
// what you see here roughly matches the real canvas width your exported
// layout-spec.json targets. Card heights stay fixed regardless of width.
//
// Clicking a KPI card calls onSelectKpi(index) -- Studio uses that to jump to
// KpiDeepDive focused on that KPI, same as drilling into a real report page.
const Summary = forwardRef(function Summary({ theme, layout, dataset, domainKey, logo, captionsByIndex, onSelectKpi }, ref) {
  const { d, kpiItems, insightableCells } = useReportVisuals({ layout, dataset, domainKey });
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
      <div className="flex items-center gap-2.5" style={{ marginBottom: 12 }}>
        {logo ? (
          <img src={logo} alt="brand logo" style={{ height: 24, maxWidth: 80, objectFit: "contain" }} />
        ) : (
          <div style={{ width: 24, height: 24, borderRadius: 6, background: theme.dataColors[0], display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700, fontSize: 12, flexShrink: 0 }}>
            {d.label.charAt(0)}
          </div>
        )}
        <div className="min-w-0">
          <div className="truncate" style={{ fontSize: theme.titleSize + 4, fontWeight: 700, color: theme.foreground, lineHeight: 1.1 }}>{d.label} — Summary</div>
          <div style={{ fontSize: theme.labelSize - 0.5, color: theme.secondaryForeground }}>
            AI-generated insights across {kpiItems.length + insightableCells.length} visuals · Refreshed today
          </div>
        </div>
      </div>

      {kpiItems.length > 0 && (
        <div className="grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", marginBottom: 10 }}>
          {kpiItems.map((k, i) => <KpiCard key={i} k={k} t={theme} idx={i} onClick={() => onSelectKpi(i)} />)}
        </div>
      )}

      {insightableCells.length > 0 ? (
        <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(2, minmax(0,1fr))" }}>
          {insightableCells.map((item) => (
            <div key={item.i}>
              {/* Fixed height, deliberately not responsive/scalable to the
                  Report page's 16:9/4:3/Fit-width setting -- one compact,
                  consistent size for every visual on this page. */}
              <div style={{ background: theme.background, borderRadius: theme.cardRadius, padding: "10px 12px", boxShadow: "0 1px 2px rgba(15,20,30,0.06)", height: 190, marginBottom: 8, display: "flex", flexDirection: "column", overflow: "hidden" }}>
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
                  <p style={{ fontSize: theme.labelSize + 0.5, lineHeight: 1.45, color: theme.foreground, margin: 0 }}>
                    {captionsByIndex[item.i] || "Click ⟲ Regenerate insights to add a caption."}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p style={{ color: theme.secondaryForeground, fontSize: 12 }}>No chart-type visuals in this layout yet — add one in the Layout tab.</p>
      )}
    </div>
  );
});

export default Summary;
