"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { DOMAINS, PRESETS, VISUALS, DEFAULT_THEME, DEFAULT_LAYOUT, INDUSTRY_TO_DOMAIN } from "../lib/data";
import { extractPaletteFromImage, isDarkColor, isUsableDataColor, buildBrandDataPalette } from "../lib/utils";
import { buildPowerBITheme, buildLayoutSpec, deriveTwin } from "../lib/theme-builder";
import { normalizeCells } from "../lib/layout-cells";
import { EMPTY_DATASET, loadDataset, saveDataset } from "../lib/dataset";
import { sanitizeAiBinding } from "../lib/binding-engine";
import { exportNodeAsPng, exportNodeAsPdf } from "../lib/export-image";
import { useReportVisuals, buildVisualPayload, unwrapResolved } from "../lib/useReportVisuals";
import { buildPbipProject, zipPbipProject } from "../lib/pbip-export";
import { buildHtmlDashboard } from "../lib/html-export";
import { Y, chrome, fonts } from "../lib/chrome";
import { AccordionSection, Stepper } from "./ui";
import ReportPreview from "./ReportPreview";
import Summary from "./Summary";
import KpiDeepDive from "./KpiDeepDive";
import { TemplatePanel, LayoutPanel, BrandPanel } from "./panels/CorePanels";
import DataPanel from "./panels/DataPanel";
import { AIPanel, OrderPanel } from "./panels/AIExportPanels";

const WIZARD_STEPS = [
  { id: "identity", label: "Brand & Identity" },
  { id: "data", label: "Data" },
  { id: "layout", label: "Layout" },
  { id: "order", label: "Validate & Order" },
];

// Extracts which dataset table(s) a cell's binding references, regardless of
// visual type's binding shape -- used only to flag stale bindings (a table
// that got removed after the cell was bound) in the pre-Order checklist.
function bindingTableIds(type, binding) {
  if (!binding) return [];
  switch (type) {
    case "kpi": case "column": case "bar": case "donut":
      return binding.metric?.table ? [binding.metric.table] : [];
    case "line": case "area":
      return (binding.series || []).map((s) => s.metric?.table).filter(Boolean);
    case "table":
      if (binding.mode === "raw") return binding.table ? [binding.table] : [];
      if (binding.mode === "grouped") return (binding.metrics || []).map((m) => m.table).filter(Boolean);
      return [];
    default: return [];
  }
}

// Pre-flight checklist shown on the Validate & Order step. Gates the Order
// button on real errors (nothing chart-safe to show, empty layout) while
// letting warnings (stale bindings, an imported-but-empty table) through --
// those degrade gracefully in preview already, they just deserve a flag
// before a client-facing package gets generated from them.
function computeValidation(theme, layout, dataset) {
  const rows = [];
  let hasError = false;

  const colorCount = new Set((theme.dataColors || []).filter(Boolean)).size;
  if (colorCount >= 4) rows.push({ status: "ok", text: `${colorCount} data colors set.` });
  else { rows.push({ status: "error", text: "Fewer than 4 data colors are set — pick a company or set colors manually in Brand & Identity." }); hasError = true; }

  const realCells = layout.cells.filter((c) => c.type !== "text");
  if (realCells.length > 0) rows.push({ status: "ok", text: `${realCells.length} chart/KPI cell${realCells.length === 1 ? "" : "s"} laid out.` });
  else { rows.push({ status: "error", text: "The layout has no chart or KPI cells yet — add at least one in Layout." }); hasError = true; }

  const tableCount = Object.keys(dataset.tables).length;
  if (!tableCount) {
    rows.push({ status: "ok", text: "Using starter demo data for every cell." });
  } else {
    const hasFact = Object.values(dataset.tables).some((t) => t.role === "fact" && t.rowCount > 0);
    if (hasFact) rows.push({ status: "ok", text: `${tableCount} table${tableCount === 1 ? "" : "s"} imported and ready to bind.` });
    else rows.push({ status: "warn", text: "Tables are imported but none are a non-empty fact table — bound cells will fall back to demo data." });
  }

  let staleCount = 0;
  layout.cells.forEach((c) => bindingTableIds(c.type, c.binding).forEach((t) => { if (!dataset.tables[t]) staleCount++; }));
  (layout.kpiStripBindings || []).forEach((b) => bindingTableIds("kpi", b).forEach((t) => { if (!dataset.tables[t]) staleCount++; }));
  if (staleCount > 0) rows.push({ status: "warn", text: `${staleCount} cell binding${staleCount === 1 ? "" : "s"} point at a table that no longer exists — re-bind in Layout before ordering.` });

  return { rows, canOrder: !hasError };
}

const STORAGE_KEY = "bi-theme-studio-project-v1";

// DEFAULT_LAYOUT()/PRESETS.*.defaults still hand back plain visual-type strings
// (shared with the AI route) -- normalize to {type, binding} at every point a
// fresh layout enters state.
const freshLayout = () => {
  const L = DEFAULT_LAYOUT();
  return { ...L, cells: normalizeCells(L.cells) };
};

export default function Studio() {
  const [domainKey, setDomainKey] = useState("workforce");
  const [theme, setTheme] = useState(DEFAULT_THEME("workforce"));
  const [layout, setLayout] = useState(freshLayout);
  const [dataset, setDataset] = useState(EMPTY_DATASET);
  const [selectedCell, setSelectedCell] = useState(null);
  const [logo, setLogo] = useState(null);
  const [brandName, setBrandName] = useState(null);
  const [brandNote, setBrandNote] = useState("");
  const [tab, setTab] = useState("identity");
  // Which accordion sections have been opened at least once -- lets the
  // sidebar/stepper show "visited" vs "not yet looked at" without implying
  // the 1-4 numbering is a hard gate on navigation (every step stays
  // reachable any time; only the Order button itself is gated, on validation).
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(["identity"]));
  const [aiDrawerOpen, setAiDrawerOpen] = useState(false);
  const [orderStatus, setOrderStatus] = useState(null); // null | "queued" | "preparing" | "packaging" | "ready"
  const orderTimersRef = useRef([]);
  const orderMountedRef = useRef(false);
  const [pbipStatus, setPbipStatus] = useState(null); // null | "building" | "error"
  const [htmlStatus, setHtmlStatus] = useState(null); // null | "building" | "error" -- web dashboard export
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiImage, setAiImage] = useState(null); // base64 data URL or null -- ephemeral, not autosaved (matches aiPrompt)
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [copied, setCopied] = useState(false);
  const [previewMode, setPreviewMode] = useState("light"); // which half of the theme pair the preview shows
  const [previewZoom, setPreviewZoom] = useState(100); // ephemeral, like previewMode -- not persisted
  const [settingsOpen, setSettingsOpen] = useState(false); // display-settings dropdown (theme/export/zoom) off the toolbar's gear icon
  const settingsRef = useRef(null);
  const [hydrated, setHydrated] = useState(false);
  const [panelOpen, setPanelOpen] = useState(true);
  const [undo, setUndo] = useState(null); // { message, onUndo } | null -- single-step, no persistent history
  const [exporting, setExporting] = useState(null); // "png" | "pdf" | null -- which share-export is in flight
  const [exportError, setExportError] = useState("");
  // Live preview has two top-level modes: "insights" (read-only Summary <->
  // KPI Deep Dive, paged with Prev/Next) and "edit" (today's ReportPreview --
  // the actual editable canvas the Layout tab's cell picker/binding editor
  // and every export depend on). Insights defaults to page 0 (Summary), same
  // as opening a real Power BI report lands on its first page.
  const [viewMode, setViewMode] = useState("insights"); // "insights" | "edit"
  const [previewPage, setPreviewPage] = useState(0); // 0 = Summary, 1 = KPI Deep Dive (insights mode only)
  const [selectedKpiIndex, setSelectedKpiIndex] = useState(0); // which KPI Deep Dive is focused on
  const [captionsByIndex, setCaptionsByIndex] = useState({}); // shared between Summary and KpiDeepDive
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState("");
  const fileRef = useRef(null);
  const undoTimerRef = useRef(null);
  const previewRef = useRef(null); // ReportPreview's root canvas node (edit mode), for PNG/PDF export
  const summaryRef = useRef(null); // Summary's root canvas node (insights, page 0)
  const deepDiveRef = useRef(null); // KpiDeepDive's root canvas node (insights, page 1)

  // Same derived KPI/chart data Summary and KpiDeepDive compute for
  // themselves -- needed here too, just for building the /api/generate-insights
  // request body (captions are shared between both pages, so the fetch lives
  // here once instead of in either page).
  const { d: reportDomain, insightableCells } = useReportVisuals({ layout, dataset, domainKey });

  // Single-step "Undo" toast for destructive actions (Reset, a visual-type
  // switch that drops an existing binding). Not a full history -- just enough
  // to walk back the one thing that just happened before it's gone for good.
  const showUndo = (message, onUndo) => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    setUndo({ message, onUndo });
    undoTimerRef.current = setTimeout(() => setUndo(null), 7000);
  };
  const performUndo = () => {
    if (undoTimerRef.current) clearTimeout(undoTimerRef.current);
    undo?.onUndo?.();
    setUndo(null);
  };

  // Restore last session (browser localStorage — per user, per device).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const s = JSON.parse(raw);
        if (s.domainKey && DOMAINS[s.domainKey]) setDomainKey(s.domainKey);
        if (s.theme) setTheme((t) => ({ ...t, ...s.theme }));
        if (s.layout && PRESETS[s.layout.preset]) setLayout({
          ...s.layout,
          cells: normalizeCells(s.layout.cells),
          kpiStripBindings: Array.isArray(s.layout.kpiStripBindings) ? s.layout.kpiStripBindings : [null, null, null, null],
          filters: Array.isArray(s.layout.filters) ? s.layout.filters : [],
        });
        if (s.logo) setLogo(s.logo);
        if (s.brandName) setBrandName(s.brandName);
      }
    } catch (e) { /* corrupted state — start fresh */ }
    // Dataset lives in its own localStorage key, managed by the /data page —
    // read-only here, re-read fresh whenever this page mounts.
    setDataset(loadDataset());
    setHydrated(true);
  }, []);

  // Auto-save on every change.
  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ domainKey, theme, layout, logo, brandName }));
    } catch (e) { /* storage full (large logo) — skip silently */ }
  }, [domainKey, theme, layout, logo, brandName, hydrated]);

  // Dataset lives in its own localStorage key (see lib/dataset.js) so a large
  // import can't jeopardize the theme/layout autosave above. The /data page
  // already writes back on every change; this panel's own Data step (DataPanel)
  // edits the same `dataset` state and needs the same autosave, or tables
  // added here vanish on reload -- and any cell bound to them silently falls
  // back to demo data since resolveCellData treats a missing table as unbound.
  useEffect(() => {
    if (!hydrated) return;
    saveDataset(dataset);
  }, [dataset, hydrated]);

  // Settings dropdown (theme/export/zoom, off the toolbar's gear icon) closes
  // on an outside click or Escape, same convention as the cell-edit popovers.
  useEffect(() => {
    if (!settingsOpen) return;
    const onClick = (e) => { if (settingsRef.current && !settingsRef.current.contains(e.target)) setSettingsOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setSettingsOpen(false); };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [settingsOpen]);

  // Track which accordion sections have been opened at least once.
  useEffect(() => {
    if (!tab) return;
    setVisitedTabs((v) => (v.has(tab) ? v : new Set(v).add(tab)));
  }, [tab]);

  // A completed order reflects a specific snapshot of theme/layout/dataset --
  // any further edit makes that package stale, so send Order back to "not
  // ordered yet" rather than let a client download a package that no longer
  // matches what's on screen. Skipped on the very first render (hydration).
  useEffect(() => {
    if (!orderMountedRef.current) { orderMountedRef.current = true; return; }
    setOrderStatus((s) => (s === "ready" ? null : s));
  }, [theme, layout, domainKey, dataset]);

  useEffect(() => () => orderTimersRef.current.forEach(clearTimeout), []);

  // When the base theme flips mode (e.g. AI generates a dark design),
  // snap the preview toggle to show the base — not its derived twin.
  useEffect(() => {
    setPreviewMode(isDarkColor(theme.background) ? "dark" : "light");
  }, [theme.background]);

  const set = (patch) => setTheme((t) => ({ ...t, ...patch }));

  const pickBrand = (brand) => {
    setDomainKey(INDUSTRY_TO_DOMAIN[brand.industry] || "workforce");

    const candidates = [brand.primary, brand.secondary, brand.tertiary].filter(isUsableDataColor);
    if (candidates.length) {
      const palette = buildBrandDataPalette(candidates);
      setTheme((t) => ({ ...t, dataColors: palette, tableAccent: candidates[0] }));
      setBrandName(brand.company);
      setBrandNote("");
    } else {
      // Brand's palette is entirely black/white/gray — nothing chart-safe to apply.
      // Leave the current theme untouched and say so, instead of a misleading "applied" banner.
      setBrandNote(`${brand.company}'s brand colors are mostly black, white or gray — no distinct chart colors to apply. Try another company.`);
    }
  };

  const clearBrand = () => { setBrandName(null); setBrandNote(""); };

  // Swaps the report's content template (KPIs/charts/slicers) -- colors and
  // layout stay untouched for every domain EXCEPT one that defines its own
  // recommendedPreset (currently just Marketing / Web Analytics): that hint
  // means the domain was built to reproduce one specific reference dashboard,
  // so picking it also applies its matching layout preset and color palette.
  // One-step Undo since this can overwrite whatever layout/colors were
  // already in place.
  const pickDomain = (k) => {
    if (k === domainKey) return;
    const rec = DOMAINS[k].recommendedPreset;
    if (!rec) { setDomainKey(k); return; }
    const prevDomainKey = domainKey, prevTheme = theme, prevLayout = layout;
    setDomainKey(k);
    setLayout((L) => ({
      ...L,
      preset: rec,
      cells: normalizeCells(PRESETS[rec].defaults),
      kpiStripBindings: Array.from({ length: DOMAINS[k].kpis.length }, () => null),
    }));
    setTheme((t) => ({ ...t, dataColors: [...DOMAINS[k].palette], tableAccent: DOMAINS[k].palette[0] }));
    setSelectedCell(null);
    showUndo(`Applied ${DOMAINS[k].label}'s recommended layout and colors.`, () => {
      setDomainKey(prevDomainKey);
      setTheme(prevTheme);
      setLayout(prevLayout);
    });
  };

  const pickPreset = (k) => {
    setLayout((L) => {
      // Carry real bindings over into the new grid by visual type -- a bound
      // column chart should stay bound to the same data after switching
      // layouts, regardless of which slot it lands in. Pool bindings by type
      // and hand them out in order; slots whose type has no leftover binding
      // (or a type the new preset doesn't have) fall back to demo data, same
      // as a fresh preset pick always has.
      const pool = {};
      (L.cells || []).forEach((c) => {
        if (c.binding == null) return;
        (pool[c.type] ||= []).push(c.binding);
      });
      const cells = normalizeCells(PRESETS[k].defaults).map((cell) => {
        const bindings = pool[cell.type];
        return bindings?.length ? { ...cell, binding: bindings.shift() } : cell;
      });
      return { ...L, preset: k, cells };
    });
    setSelectedCell(null);
  };

  const setCellVisual = (i, v) => {
    const prevCell = layout.cells[i];
    setLayout((L) => {
      const cells = [...L.cells];
      // Switching visual type clears any binding — a bar's {metric, groupBy}
      // isn't shape-compatible with a line's {series}, so silently carrying it
      // over would render garbage. User re-binds after switching type.
      cells[i] = { type: v, binding: null };
      return { ...L, cells };
    });
    // Only worth an undo offer if there was a real binding to lose — switching
    // between two demo-data cells drops nothing.
    if (prevCell?.binding != null) {
      showUndo("Cell's data binding was cleared.", () => {
        setLayout((L) => {
          const cells = [...L.cells];
          cells[i] = prevCell;
          return { ...L, cells };
        });
      });
    }
  };

  const setCellBinding = (i, binding) => {
    setLayout((L) => {
      const cells = [...L.cells];
      cells[i] = { ...cells[i], binding };
      return { ...L, cells };
    });
  };

  const setKpiStripBinding = (i, binding) => {
    setLayout((L) => {
      const kpiStripBindings = [...(L.kpiStripBindings || [null, null, null, null])];
      kpiStripBindings[i] = binding;
      return { ...L, kpiStripBindings };
    });
  };

  const addFilter = (table, column) => {
    const id = `${table}::${column}`;
    setLayout((L) => {
      const filters = L.filters || [];
      if (filters.some((f) => f.id === id)) return L; // already added
      return { ...L, filters: [...filters, { id, table, column, selected: [] }] };
    });
  };

  const removeFilter = (id) => {
    setLayout((L) => ({ ...L, filters: (L.filters || []).filter((f) => f.id !== id) }));
  };

  const setFilterSelection = (id, selected) => {
    setLayout((L) => ({ ...L, filters: (L.filters || []).map((f) => (f.id === id ? { ...f, selected } : f)) }));
  };

  // Cell-level (not binding-level) so it applies to demo cells too and
  // survives toggling Demo/My data -- see feature plan.
  const setCellHeaderBg = (i, color) => {
    setLayout((L) => {
      const cells = [...L.cells];
      cells[i] = { ...cells[i], headerBg: color };
      return { ...L, cells };
    });
  };

  // Clicking a cell in the live preview now opens its edit popover in place
  // (see ReportPreview) instead of also yanking the sidebar over to the
  // Layout tab -- selectedCell still updates so the Layout tab's cell grid
  // stays in sync if the user navigates there manually.
  const onSelectCell = (i) => {
    setSelectedCell(i);
  };

  // Clicking a KPI card on Summary (or the "other KPIs" row on KpiDeepDive
  // itself) drills into that KPI's deep dive -- same idea as clicking a cell
  // in the Report page, just for the read-only insights pages.
  const onSelectKpi = (i) => {
    setSelectedKpiIndex(i);
    setPreviewPage(1);
  };

  const onLogo = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      setLogo(r.result);
      extractPaletteFromImage(r.result, (cols) => {
        if (cols.length) {
          setTheme((t) => {
            const dc = [...t.dataColors];
            cols.forEach((c, i) => { if (i < dc.length) dc[i] = c; });
            return { ...t, dataColors: dc, tableAccent: cols[0] };
          });
        }
      });
    };
    r.readAsDataURL(f);
  };

  // Same FileReader pattern as onLogo. Capped client-side at ~8MB so a huge
  // screenshot doesn't produce a slow/oversized request -- the resulting
  // base64 data URL is ephemeral UI state, never persisted (see aiImage).
  const onAiImage = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 8 * 1024 * 1024) {
      setAiError("That image is too large (max 8MB). Try a smaller screenshot.");
      e.target.value = "";
      return;
    }
    const r = new FileReader();
    r.onload = () => setAiImage(r.result);
    r.readAsDataURL(f);
  };

  const askAI = async () => {
    if ((!aiPrompt.trim() && !aiImage) || aiLoading) return;
    setAiLoading(true);
    setAiError("");
    try {
      // aiImage is a data URL ("data:image/png;base64,...."); the API only
      // wants the media type + the bare base64 payload.
      let image = null;
      if (aiImage) {
        const match = /^data:(image\/[a-zA-Z0-9.+-]+);base64,(.*)$/.exec(aiImage);
        if (match) image = { mediaType: match[1], data: match[2] };
      }
      const res = await fetch("/api/generate-theme", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: aiPrompt,
          domain: DOMAINS[domainKey].label,
          currentColors: theme.dataColors,
          dataset,
          image,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
      }
      const parsed = await res.json();
      if (!Array.isArray(parsed.dataColors) || parsed.dataColors.length < 4) throw new Error("bad palette");
      const { layout: aiLayout, ...themePatch } = parsed;
      set({ ...themePatch, dataColors: parsed.dataColors.slice(0, 8) });
      if (aiLayout && PRESETS[aiLayout.preset] && Array.isArray(aiLayout.cells)) {
        const need = PRESETS[aiLayout.preset].cells;
        const rawBindings = Array.isArray(parsed.bindings) ? parsed.bindings : [];
        // Zip type+binding together BEFORE filtering unrecognized visual types —
        // filtering the two arrays independently would shift every later
        // binding onto the wrong cell once one entry gets dropped.
        const pairs = aiLayout.cells
          .map((type, i) => ({ type, binding: rawBindings[i] ?? null }))
          .filter((p) => VISUALS[p.type])
          .slice(0, need);
        while (pairs.length < need) pairs.push({ type: PRESETS[aiLayout.preset].defaults[pairs.length], binding: null });
        const cells = pairs.map((p) => ({ type: p.type, binding: sanitizeAiBinding(p.type, p.binding, dataset) }));

        const rawKpiStrip = Array.isArray(parsed.kpiStripBindings) ? parsed.kpiStripBindings : [];
        const kpiStripBindings = [0, 1, 2, 3].map((i) => sanitizeAiBinding("kpi", rawKpiStrip[i] ?? null, dataset));

        setLayout((L) => ({
          ...L,
          preset: aiLayout.preset,
          cells: normalizeCells(cells),
          slicerPos: ["top", "left", "none"].includes(aiLayout.slicerPos) ? aiLayout.slicerPos : "top",
          kpiStripBindings,
        }));
        setSelectedCell(null);
      }
    } catch (err) {
      setAiError(err.message === "bad palette" ? "The AI response couldn't be applied. Try rephrasing your request." : err.message);
    } finally {
      setAiLoading(false);
    }
  };

  /* ----- theme pair: base + auto-derived twin ----- */
  const baseIsDark = isDarkColor(theme.background);
  const twin = deriveTwin(theme);
  const lightTheme = baseIsDark ? twin : theme;
  const darkTheme = baseIsDark ? theme : twin;
  const previewTheme = previewMode === "dark" ? darkTheme : lightTheme;
  const previewIsTwin = previewTheme !== theme;

  const themeJson = JSON.stringify(buildPowerBITheme(theme), null, 2);
  const lightJson = JSON.stringify(buildPowerBITheme({ ...lightTheme, name: (theme.name || "Theme") + " Light" }), null, 2);
  const darkJson = JSON.stringify(buildPowerBITheme({ ...darkTheme, name: (theme.name || "Theme") + " Dark" }), null, 2);
  const layoutJson = JSON.stringify(buildLayoutSpec(layout, domainKey), null, 2);
  const slug = (theme.name || "theme").replace(/\s+/g, "-").toLowerCase();

  const downloadFile = (content, filename) => {
    const blob = new Blob([content], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const downloadPair = () => {
    downloadFile(lightJson, `${slug}-light.json`);
    setTimeout(() => downloadFile(darkJson, `${slug}-dark.json`), 350);
  };

  const copyJson = async () => {
    try {
      await navigator.clipboard.writeText(themeJson);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch (e) { /* clipboard unavailable */ }
  };

  // One batched call for every chart/table cell's caption, shared by Summary
  // and KpiDeepDive (both just read captionsByIndex as a prop) -- triggered
  // from the shared toolbar's "Regenerate insights" button, not by either page.
  const askInsights = async () => {
    if (insightsLoading || !insightableCells.length) return;
    setInsightsLoading(true);
    setInsightsError("");
    try {
      const res = await fetch("/api/generate-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          domain: reportDomain.label,
          visuals: insightableCells.map(({ i, cell, resolved, title }) => ({
            id: i,
            type: cell.type,
            title,
            data: buildVisualPayload(cell.type, unwrapResolved(cell.type, resolved, i)),
          })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed (${res.status})`);
      }
      const parsed = await res.json();
      if (!Array.isArray(parsed.captions)) throw new Error("Unexpected response shape.");
      setCaptionsByIndex((prev) => {
        const next = { ...prev };
        parsed.captions.forEach((c) => { if (Number.isInteger(c.id)) next[c.id] = c.caption; });
        return next;
      });
    } catch (err) {
      setInsightsError(err.message || "Couldn't generate insights. Try again.");
    } finally {
      setInsightsLoading(false);
    }
  };

  // setExporting(...) below hides the per-cell ✎ edit buttons on the Report
  // page (ReportPreview reads `exporting` as its hideEditAffordances prop --
  // Summary/KpiDeepDive have no edit affordances to hide, being read-only
  // already); exportNodeAsPng/Pdf (lib/export-image.js) wait for that to
  // actually paint before rasterizing, then capture whichever page is
  // currently active's own root node (not the zoomed/scaled wrapper around
  // it) so the exported image is always full-resolution regardless of the
  // on-screen zoom level.
  const activePreviewNode = () => {
    if (viewMode === "edit") return previewRef.current;
    return previewPage === 0 ? summaryRef.current : deepDiveRef.current;
  };
  const exportFilenameBase = () => {
    if (viewMode === "edit") return `${slug}-preview`;
    return previewPage === 0 ? `${slug}-summary` : `${slug}-kpi-deep-dive`;
  };

  const exportPreviewPng = async () => {
    if (exporting) return;
    setExporting("png");
    setExportError("");
    try {
      await exportNodeAsPng(activePreviewNode(), `${exportFilenameBase()}.png`, { backgroundColor: previewTheme.secondaryBackground });
    } catch (e) {
      setExportError("Couldn't export the preview as PNG. Try again.");
    } finally {
      setExporting(null);
    }
  };

  const exportPreviewPdf = async () => {
    if (exporting) return;
    setExporting("pdf");
    setExportError("");
    try {
      await exportNodeAsPdf(activePreviewNode(), `${exportFilenameBase()}.pdf`, { backgroundColor: previewTheme.secondaryBackground });
    } catch (e) {
      setExportError("Couldn't export the preview as PDF. Try again.");
    } finally {
      setExporting(null);
    }
  };

  const validation = computeValidation(theme, layout, dataset);

  const startOrder = () => {
    if (!validation.canOrder || (orderStatus && orderStatus !== "ready")) return;
    orderTimersRef.current.forEach(clearTimeout);
    orderTimersRef.current = [];
    setOrderStatus("queued");
    let delay = 500;
    for (const s of ["preparing", "packaging", "ready"]) {
      orderTimersRef.current.push(setTimeout(() => setOrderStatus(s), delay));
      delay += 550;
    }
  };

  // Builds the PBIP project (semantic model + report definition, see
  // lib/pbip-export.js) from the exact theme/layout/dataset behind the live
  // preview and downloads it as a .zip -- unzip and open the .pbip file in
  // Power BI Desktop.
  const downloadPbipProject = async () => {
    if (pbipStatus === "building") return;
    setPbipStatus("building");
    try {
      const { name, files } = await buildPbipProject({ theme: previewTheme, layout, domainKey, dataset, projectName: theme.name });
      const blob = await zipPbipProject(files);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${name}.pbip.zip`;
      a.click();
      URL.revokeObjectURL(url);
      setPbipStatus(null);
    } catch (e) {
      console.error("PBIP export failed:", e);
      setPbipStatus("error");
    }
  };

  // Standalone premium-dark HTML dashboard export -- the "web view" delivery
  // target, an alternative to the Power BI project. Uses the previewTheme (so
  // the ☀/☾ toggle's active half feeds the brand colors) and the same
  // layout/dataset the rest of the export path reads.
  const downloadHtmlDashboard = () => {
    if (htmlStatus === "building") return;
    setHtmlStatus("building");
    try {
      const html = buildHtmlDashboard({ theme: previewTheme, layout, domainKey, dataset, logo });
      const blob = new Blob([html], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${slug}-dashboard.html`;
      a.click();
      URL.revokeObjectURL(url);
      setHtmlStatus(null);
    } catch (e) {
      console.error("HTML export failed:", e);
      setHtmlStatus("error");
    }
  };

  const resetProject = () => {
    const snapshot = { domainKey, theme, layout, logo, brandName, brandNote, tab, selectedCell };
    localStorage.removeItem(STORAGE_KEY);
    setDomainKey("workforce");
    setTheme(DEFAULT_THEME("workforce"));
    setLayout(freshLayout());
    setLogo(null);
    setBrandName(null);
    setBrandNote("");
    setSelectedCell(null);
    setTab("identity");
    setOrderStatus(null);
    showUndo("Project reset.", () => {
      setDomainKey(snapshot.domainKey);
      setTheme(snapshot.theme);
      setLayout(snapshot.layout);
      setLogo(snapshot.logo);
      setBrandName(snapshot.brandName);
      setBrandNote(snapshot.brandNote);
      setTab(snapshot.tab);
      setSelectedCell(snapshot.selectedCell);
    });
  };

  return (
    <div className="min-h-screen lg:h-screen w-full lg:flex lg:flex-col" style={{ background: chrome.bg, ...fonts.ui }}>
      {/* top bar */}
      <div className="flex items-center justify-between px-4 py-3 flex-wrap gap-2 lg:flex-shrink-0" style={{ borderBottom: `1px solid ${chrome.line}` }}>
        <div className="flex items-center gap-2.5">
          <div style={{ width: 30, height: 30, borderRadius: 8, background: Y, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#17181D", ...fonts.disp, fontSize: 15 }}>◪</div>
          <div>
            <div style={{ ...fonts.disp, fontWeight: 700, fontSize: 16, color: chrome.text, lineHeight: 1.1 }}>BI Theme Studio</div>
            <div style={{ fontSize: 10.5, color: chrome.sub }}>Brand → Data → Layout → Validate → Order — a guided path to a client-ready Power BI report</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setAiDrawerOpen(true)} className="px-3 py-2 text-xs font-semibold rounded-md" style={{ background: "transparent", color: chrome.sub, border: `1px solid ${chrome.line}` }}>
            ✦ AI Assist
          </button>
          <button onClick={() => setPanelOpen((o) => !o)} className="px-3 py-2 text-xs font-semibold rounded-md" style={{ background: "transparent", color: chrome.sub, border: `1px solid ${chrome.line}` }}>
            {panelOpen ? "⟨⟨ Hide panel" : "Show panel ⟩⟩"}
          </button>
          <Link href="/data" className="px-3 py-2 text-xs font-semibold rounded-md" style={{ background: "transparent", color: chrome.sub, border: `1px solid ${chrome.line}` }}>
            ⛁ Data Model
          </Link>
          <button onClick={resetProject} className="px-3 py-2 text-xs font-semibold rounded-md" style={{ background: "transparent", color: chrome.sub, border: `1px solid ${chrome.line}` }}>Reset</button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row lg:flex-1 lg:min-h-0">
        {/* control panel -- lg:overflow-y-auto gives this its own scrollbar
            independent of the preview column, so a long sidebar (e.g. the
            full industry/company list) never drags the live preview out of
            view; it stays put in its own fixed-height column. Mobile keeps
            the original single-column, whole-page scroll since a split-pane
            layout doesn't make sense on a narrow screen. */}
        {panelOpen ? (
          <div className="w-full lg:w-[380px] flex-shrink-0 p-4 relative lg:overflow-y-auto" style={{ borderRight: `1px solid ${chrome.line}` }}>
            <button onClick={() => setPanelOpen(false)} title="Hide panel" aria-label="Hide panel"
              className="hidden lg:flex items-center justify-center absolute top-4 -right-3 w-6 h-6 rounded-full z-10"
              style={{ background: chrome.panel, color: chrome.sub, border: `1px solid ${chrome.line}`, fontSize: 12 }}>‹</button>

            <Stepper steps={WIZARD_STEPS} activeId={tab} onJump={setTab} doneIds={visitedTabs} />

            <AccordionSection id="identity" step={1} label="Brand & Identity" subtitle="Industry, company, logo, colors & font" tab={tab} setTab={setTab} visited={visitedTabs.has("identity")}>
              <TemplatePanel domainKey={domainKey} pickDomain={pickDomain} brandName={brandName} brandNote={brandNote} pickBrand={pickBrand} clearBrand={clearBrand} />
              <div className="my-3" style={{ borderTop: `1px solid ${chrome.line}` }} />
              <BrandPanel theme={theme} set={set} logo={logo} setLogo={setLogo} onLogo={onLogo} fileRef={fileRef} />
            </AccordionSection>

            <AccordionSection id="data" step={2} label="Data" subtitle="Starter demo data, or import the client's own" tab={tab} setTab={setTab} visited={visitedTabs.has("data")}>
              <DataPanel dataset={dataset} setDataset={setDataset} />
            </AccordionSection>

            <AccordionSection id="layout" step={3} label="Layout" subtitle="Grid, slicers, page size & cell bindings" tab={tab} setTab={setTab} visited={visitedTabs.has("layout")}>
              <LayoutPanel layout={layout} setLayout={setLayout} pickPreset={pickPreset} />
            </AccordionSection>

            <AccordionSection id="order" step={4} label="Validate & Order" subtitle="Check the live preview, then order the package" tab={tab} setTab={setTab} visited={visitedTabs.has("order")}>
              <OrderPanel theme={theme} set={set} validation={validation} orderStatus={orderStatus} startOrder={startOrder} themeJson={themeJson} lightJson={lightJson} darkJson={darkJson} layoutJson={layoutJson} slug={slug} downloadFile={downloadFile} downloadPair={downloadPair} copyJson={copyJson} copied={copied} pbipStatus={pbipStatus} downloadPbipProject={downloadPbipProject} htmlStatus={htmlStatus} downloadHtmlDashboard={downloadHtmlDashboard} />
            </AccordionSection>
          </div>
        ) : (
          <button onClick={() => setPanelOpen(true)} title="Show panel" aria-label="Show panel"
            className="hidden lg:flex flex-shrink-0 items-center justify-center w-5 hover:opacity-80"
            style={{ background: chrome.panel, borderRight: `1px solid ${chrome.line}`, color: chrome.sub, fontSize: 12 }}>›</button>
        )}

        {/* live preview -- its own independent scroll region too, so it never
            shares a scroll position with the sidebar. */}
        <div className="flex-1 p-4 min-w-0 lg:overflow-y-auto">
          {/* Top-level mode: read-only Insights (Summary <-> KPI Deep Dive) vs.
              the actual editable Report canvas -- Layout-tab cell picking/
              binding and every export still work exactly as before, just
              reached via "Edit Report" instead of always being "page 2". */}
          {/* Single row: primary action, view-mode toggle, page nav, then the
              settings gear pinned to the far right corner holding everything
              that isn't core navigation (theme/export/zoom). Replaces the old
              two-row toolbar, which crammed 4 separate control clusters onto
              one side while the other side carried a page-name label that
              only repeated the "Page 1 of 2 — Summary" text sitting right
              next to it. */}
          <div className="flex items-center gap-2.5 mb-3 flex-wrap">
            {viewMode === "insights" && (
              <button onClick={askInsights} disabled={insightsLoading}
                className="px-3 py-1.5 text-xs font-semibold rounded-md flex-shrink-0" style={{ background: chrome.panel, color: insightsLoading ? chrome.line : chrome.sub, border: `1px solid ${chrome.line}` }}>
                {insightsLoading ? "Generating…" : "⟲ Regenerate insights"}
              </button>
            )}

            <div className="flex rounded-md overflow-hidden flex-shrink-0" style={{ border: `1px solid ${chrome.line}` }}>
              <button onClick={() => setViewMode("insights")} className="px-3 py-1.5 text-xs font-bold"
                style={{ background: viewMode === "insights" ? Y : chrome.panel, color: viewMode === "insights" ? "#17181D" : chrome.sub }}>📊 Insights</button>
              <button onClick={() => setViewMode("edit")} className="px-3 py-1.5 text-xs font-bold"
                style={{ background: viewMode === "edit" ? Y : chrome.panel, color: viewMode === "edit" ? "#17181D" : chrome.sub }}>✎ Edit Report</button>
            </div>

            {viewMode === "insights" && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <button onClick={() => setPreviewPage(0)} disabled={previewPage === 0} className="px-3 py-1.5 text-xs font-semibold rounded-md"
                  style={{ background: chrome.panel, color: previewPage === 0 ? chrome.line : chrome.sub, border: `1px solid ${chrome.line}`, cursor: previewPage === 0 ? "default" : "pointer" }}>‹ Prev</button>
                <span style={{ fontSize: 11.5, color: chrome.sub, whiteSpace: "nowrap" }}>{previewPage === 0 ? "Page 1 of 2 — Summary" : "Page 2 of 2 — KPI Deep Dive"}</span>
                <button onClick={() => setPreviewPage(1)} disabled={previewPage === 1} className="px-3 py-1.5 text-xs font-semibold rounded-md"
                  style={{ background: chrome.panel, color: previewPage === 1 ? chrome.line : chrome.sub, border: `1px solid ${chrome.line}`, cursor: previewPage === 1 ? "default" : "pointer" }}>Next ›</button>
              </div>
            )}

            <div className="flex-1" style={{ minWidth: 8 }} />

            <div className="relative flex-shrink-0" ref={settingsRef}>
              <button onClick={() => setSettingsOpen((o) => !o)} title="Display settings" aria-label="Display settings" aria-expanded={settingsOpen}
                className="flex items-center justify-center rounded-md"
                style={{ width: 30, height: 30, fontSize: 15, background: settingsOpen ? Y : chrome.panel, color: settingsOpen ? "#17181D" : chrome.sub, border: `1px solid ${settingsOpen ? Y : chrome.line}` }}>
                ⚙
              </button>
              {settingsOpen && (
                <div className="absolute right-0 flex flex-col gap-3 rounded-md" style={{ top: "calc(100% + 8px)", width: 220, zIndex: 20, background: chrome.panel, border: `1px solid ${chrome.line}`, boxShadow: "0 12px 28px rgba(0,0,0,0.45)", padding: 12 }}>
                  <div className="flex flex-col gap-1.5">
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: chrome.sub }}>Theme</span>
                    <div className="flex rounded-md overflow-hidden" style={{ border: `1px solid ${chrome.line}` }}>
                      {[["light", "☀ Light"], ["dark", "☾ Dark"]].map(([m, l]) => (
                        <button key={m} onClick={() => setPreviewMode(m)} className="flex-1 py-1.5 text-xs font-bold"
                          style={{ background: previewMode === m ? Y : chrome.panel, color: previewMode === m ? "#17181D" : chrome.sub }}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: chrome.sub }}>Export</span>
                    <div className="flex rounded-md overflow-hidden" style={{ border: `1px solid ${chrome.line}` }}>
                      <button onClick={exportPreviewPng} disabled={!!exporting} title="Download this page as a PNG image"
                        className="flex-1 py-1.5 text-xs font-semibold" style={{ background: chrome.panel, color: exporting ? chrome.line : chrome.sub, cursor: exporting ? "default" : "pointer" }}>
                        {exporting === "png" ? "Exporting…" : "⤓ PNG"}
                      </button>
                      <button onClick={exportPreviewPdf} disabled={!!exporting} title="Download this page as a PDF"
                        className="flex-1 py-1.5 text-xs font-semibold" style={{ background: chrome.panel, color: exporting ? chrome.line : chrome.sub, borderLeft: `1px solid ${chrome.line}`, cursor: exporting ? "default" : "pointer" }}>
                        {exporting === "pdf" ? "Exporting…" : "⤓ PDF"}
                      </button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: chrome.sub }}>Zoom</span>
                    <div className="flex items-center rounded-md overflow-hidden" style={{ border: `1px solid ${chrome.line}` }}>
                      <button onClick={() => setPreviewZoom((z) => Math.max(50, z - 10))} className="px-2.5 py-1.5 text-xs font-bold" style={{ background: chrome.panel, color: chrome.sub }}>−</button>
                      <button onClick={() => setPreviewZoom(100)} title="Reset zoom" className="flex-1 py-1.5" style={{ background: chrome.panel, color: chrome.text, fontSize: 10.5, textAlign: "center", ...fonts.mono }}>{previewZoom}%</button>
                      <button onClick={() => setPreviewZoom((z) => Math.min(150, z + 10))} className="px-2.5 py-1.5 text-xs font-bold" style={{ background: chrome.panel, color: chrome.sub }}>+</button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
          {previewIsTwin && (
            <p className="mb-2" style={{ fontSize: 10.5, color: chrome.sub }}>
              Viewing the auto-derived {previewMode} twin — colors are re-tuned from your base theme for {previewMode} backgrounds. Edits in Brand always apply to the base; the twin follows.
            </p>
          )}
          {viewMode === "insights" && insightableCells.length > 0 && Object.keys(captionsByIndex).length === 0 && (
            <p className="mb-2" style={{ fontSize: 10.5, color: chrome.sub }}>
              Click ⟲ Regenerate insights to add an AI-written caption to every chart and table below.
            </p>
          )}
          {viewMode === "insights" && insightsError && <p className="mb-2" style={{ fontSize: 10.5, color: "#F87171" }}>{insightsError}</p>}
          {exportError && <p className="mb-2" style={{ fontSize: 10.5, color: "#F87171" }}>{exportError}</p>}
          <div style={{ overflow: previewZoom > 100 ? "auto" : "visible" }}>
            <div style={{ transform: `scale(${previewZoom / 100})`, transformOrigin: "top left" }}>
              {/* Only the active page/mode is ever mounted -- previously all
                  three stayed in the DOM permanently, just hidden with
                  display:none, so fetching the page returned every page's
                  markup at once. Safe to fully unmount the inactive ones:
                  Summary and KpiDeepDive hold no local state at all (every
                  prop they read -- theme/layout/dataset/captionsByIndex/
                  selectedKpiIndex -- lives in Studio), and ReportPreview's
                  only local state is its transient cell-edit popover, which
                  resetting when you navigate away is the expected behavior,
                  not a regression. PNG/PDF export already only ever reads
                  the ref of whichever page is currently active (see
                  activePreviewNode below), so an unmounted page's null ref
                  is never touched. */}
              {viewMode === "insights" && previewPage === 0 && (
                <Summary ref={summaryRef} theme={previewTheme} layout={layout} dataset={dataset} domainKey={domainKey} logo={logo}
                  captionsByIndex={captionsByIndex} onSelectKpi={onSelectKpi} />
              )}
              {viewMode === "insights" && previewPage === 1 && (
                <KpiDeepDive ref={deepDiveRef} theme={previewTheme} layout={layout} dataset={dataset} domainKey={domainKey} logo={logo}
                  captionsByIndex={captionsByIndex} selectedKpiIndex={selectedKpiIndex} onSelectKpi={onSelectKpi}
                  addFilter={addFilter} removeFilter={removeFilter} setFilterSelection={setFilterSelection} />
              )}
              {viewMode === "edit" && (
                <ReportPreview ref={previewRef} domainKey={domainKey} theme={previewTheme} layout={layout} logo={logo} selectedCell={selectedCell} onSelectCell={onSelectCell} dataset={dataset} setCellVisual={setCellVisual} setCellBinding={setCellBinding} setKpiStripBinding={setKpiStripBinding} setFilterSelection={setFilterSelection} setCellHeaderBg={setCellHeaderBg} addFilter={addFilter} removeFilter={removeFilter} hideEditAffordances={!!exporting} />
              )}
            </div>
          </div>
        </div>
      </div>

      {undo && (
        <div className="flex items-center gap-3 fixed bottom-5 left-1/2 -translate-x-1/2 px-4 py-3 rounded-lg z-50"
          style={{ background: chrome.panel, border: `1px solid ${chrome.line}`, boxShadow: "0 12px 32px rgba(0,0,0,0.45)" }}>
          <span style={{ fontSize: 12.5, color: chrome.text }}>{undo.message}</span>
          <button onClick={performUndo} className="px-3 py-1.5 text-xs font-bold rounded-md flex-shrink-0" style={{ background: Y, color: "#17181D" }}>Undo</button>
          <button onClick={() => setUndo(null)} aria-label="Dismiss" className="flex-shrink-0" style={{ fontSize: 12, color: chrome.sub }}>✕</button>
        </div>
      )}

      {/* AI Assist is an optional accelerator, not a required step in the
          Brand -> Data -> Layout -> Order path -- it lives in an overlay
          drawer instead of consuming a step number, so the guided flow reads
          the same whether or not it's ever opened. */}
      {aiDrawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
          <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.55)" }} onClick={() => setAiDrawerOpen(false)} />
          <div className="relative w-full sm:w-[420px] h-full p-4 overflow-y-auto" style={{ background: chrome.bg, borderLeft: `1px solid ${chrome.line}`, boxShadow: "-12px 0 32px rgba(0,0,0,0.45)" }}>
            <div className="flex items-center justify-between mb-3">
              <div>
                <div style={{ ...fonts.disp, fontSize: 14, fontWeight: 700, color: chrome.text }}>✦ AI Assist</div>
                <div style={{ fontSize: 10.5, color: chrome.sub }}>Optional — describe the report, let Claude design it</div>
              </div>
              <button onClick={() => setAiDrawerOpen(false)} aria-label="Close" style={{ fontSize: 14, color: chrome.sub }}>✕</button>
            </div>
            <AIPanel aiPrompt={aiPrompt} setAiPrompt={setAiPrompt} aiImage={aiImage} setAiImage={setAiImage} onAiImage={onAiImage} askAI={askAI} aiLoading={aiLoading} aiError={aiError} rationale={theme.rationale} dataset={dataset} />
          </div>
        </div>
      )}
    </div>
  );
}
