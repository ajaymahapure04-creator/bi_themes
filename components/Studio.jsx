"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { DOMAINS, PRESETS, VISUALS, DEFAULT_THEME, DEFAULT_LAYOUT, INDUSTRY_TO_DOMAIN } from "../lib/data";
import { extractPaletteFromImage, isDarkColor, isUsableDataColor, buildBrandDataPalette } from "../lib/utils";
import { buildPowerBITheme, buildLayoutSpec, deriveTwin } from "../lib/theme-builder";
import { normalizeCells } from "../lib/layout-cells";
import { EMPTY_DATASET, loadDataset } from "../lib/dataset";
import { sanitizeAiBinding } from "../lib/binding-engine";
import { exportNodeAsPng, exportNodeAsPdf } from "../lib/export-image";
import { useReportVisuals, buildVisualPayload, unwrapResolved } from "../lib/useReportVisuals";
import { Y, chrome, fonts } from "../lib/chrome";
import { AccordionSection } from "./ui";
import ReportPreview from "./ReportPreview";
import Summary from "./Summary";
import KpiDeepDive from "./KpiDeepDive";
import { TemplatePanel, LayoutPanel, BrandPanel } from "./panels/CorePanels";
import { AIPanel, ExportPanel } from "./panels/AIExportPanels";

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
  const [tab, setTab] = useState("template");
  // Which accordion sections have been opened at least once -- lets the
  // sidebar show "visited" vs "not yet looked at" without implying the
  // 1-5 numbering is a required order (nothing actually gates on it).
  const [visitedTabs, setVisitedTabs] = useState(() => new Set(["template"]));
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiImage, setAiImage] = useState(null); // base64 data URL or null -- ephemeral, not autosaved (matches aiPrompt)
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [copied, setCopied] = useState(false);
  const [previewMode, setPreviewMode] = useState("light"); // which half of the theme pair the preview shows
  const [previewZoom, setPreviewZoom] = useState(100); // ephemeral, like previewMode -- not persisted
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

  // Track which accordion sections have been opened at least once.
  useEffect(() => {
    if (!tab) return;
    setVisitedTabs((v) => (v.has(tab) ? v : new Set(v).add(tab)));
  }, [tab]);

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

  // Swaps only the report's content template (KPIs/charts/slicers) — never
  // touches theme colors, regardless of whether a company/brand is active.
  const pickDomain = (k) => setDomainKey(k);

  const pickPreset = (k) => {
    setLayout((L) => ({ ...L, preset: k, cells: normalizeCells(PRESETS[k].defaults) }));
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
            data: buildVisualPayload(cell.type, unwrapResolved(cell.type, resolved)),
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
    setTab("template");
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
    <div className="min-h-screen w-full" style={{ background: chrome.bg, ...fonts.ui }}>
      {/* top bar */}
      <div className="flex items-center justify-between px-4 py-3 flex-wrap gap-2" style={{ borderBottom: `1px solid ${chrome.line}` }}>
        <div className="flex items-center gap-2.5">
          <div style={{ width: 30, height: 30, borderRadius: 8, background: Y, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#17181D", ...fonts.disp, fontSize: 15 }}>◪</div>
          <div>
            <div style={{ ...fonts.disp, fontWeight: 700, fontSize: 16, color: chrome.text, lineHeight: 1.1 }}>BI Theme Studio</div>
            <div style={{ fontSize: 10.5, color: chrome.sub }}>AI-assisted UI/UX + layout for Power BI developers</div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setPanelOpen((o) => !o)} className="px-3 py-2 text-xs font-semibold rounded-md" style={{ background: "transparent", color: chrome.sub, border: `1px solid ${chrome.line}` }}>
            {panelOpen ? "⟨⟨ Hide panel" : "Show panel ⟩⟩"}
          </button>
          <Link href="/data" className="px-3 py-2 text-xs font-semibold rounded-md" style={{ background: "transparent", color: chrome.sub, border: `1px solid ${chrome.line}` }}>
            ⛁ Data Model
          </Link>
          <button onClick={resetProject} className="px-3 py-2 text-xs font-semibold rounded-md" style={{ background: "transparent", color: chrome.sub, border: `1px solid ${chrome.line}` }}>Reset</button>
          <button onClick={copyJson} title="Copies the base theme only — for both light and dark, use Export pair" className="px-3 py-2 text-xs font-semibold rounded-md" style={{ background: "transparent", color: chrome.text, border: `1px solid ${chrome.line}` }}>
            {copied ? "Copied ✓" : "Copy theme"}
          </button>
          <button onClick={downloadPair} className="px-3.5 py-2 text-xs font-bold rounded-md" style={{ background: Y, color: "#17181D" }}>
            ⬇ Export pair
          </button>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row">
        {/* control panel */}
        {panelOpen ? (
          <div className="w-full lg:w-[380px] flex-shrink-0 p-4 relative" style={{ borderRight: `1px solid ${chrome.line}` }}>
            <button onClick={() => setPanelOpen(false)} title="Hide panel" aria-label="Hide panel"
              className="hidden lg:flex items-center justify-center absolute top-4 -right-3 w-6 h-6 rounded-full z-10"
              style={{ background: chrome.panel, color: chrome.sub, border: `1px solid ${chrome.line}`, fontSize: 12 }}>‹</button>
            <AccordionSection id="ai" step={1} label="AI Assist" subtitle="Describe the report, let Claude design it" tab={tab} setTab={setTab} visited={visitedTabs.has("ai")}>
              <AIPanel aiPrompt={aiPrompt} setAiPrompt={setAiPrompt} aiImage={aiImage} setAiImage={setAiImage} onAiImage={onAiImage} askAI={askAI} aiLoading={aiLoading} aiError={aiError} rationale={theme.rationale} dataset={dataset} />
            </AccordionSection>

            <AccordionSection id="template" step={2} label="Template" subtitle="Industry, company & colors" tab={tab} setTab={setTab} visited={visitedTabs.has("template")}>
              <TemplatePanel domainKey={domainKey} pickDomain={pickDomain} brandName={brandName} brandNote={brandNote} pickBrand={pickBrand} clearBrand={clearBrand} />
            </AccordionSection>

            <AccordionSection id="layout" step={3} label="Layout" subtitle="Grid, slicers & page size" tab={tab} setTab={setTab} visited={visitedTabs.has("layout")}>
              <LayoutPanel layout={layout} setLayout={setLayout} selectedCell={selectedCell} setSelectedCell={setSelectedCell} pickPreset={pickPreset} setCellVisual={setCellVisual} dataset={dataset} setCellBinding={setCellBinding} setKpiStripBinding={setKpiStripBinding} addFilter={addFilter} removeFilter={removeFilter} />
            </AccordionSection>

            <AccordionSection id="brand" step={4} label="Brand" subtitle="Logo, colors & text" tab={tab} setTab={setTab} visited={visitedTabs.has("brand")}>
              <BrandPanel theme={theme} set={set} logo={logo} setLogo={setLogo} onLogo={onLogo} fileRef={fileRef} />
            </AccordionSection>

            <AccordionSection id="export" step={5} label="Export" subtitle="Download theme.json & layout spec" tab={tab} setTab={setTab} visited={visitedTabs.has("export")}>
              <ExportPanel theme={theme} set={set} themeJson={themeJson} lightJson={lightJson} darkJson={darkJson} layoutJson={layoutJson} slug={slug} downloadFile={downloadFile} downloadPair={downloadPair} copyJson={copyJson} copied={copied} />
            </AccordionSection>
          </div>
        ) : (
          <button onClick={() => setPanelOpen(true)} title="Show panel" aria-label="Show panel"
            className="hidden lg:flex flex-shrink-0 items-center justify-center w-5 hover:opacity-80"
            style={{ background: chrome.panel, borderRight: `1px solid ${chrome.line}`, color: chrome.sub, fontSize: 12 }}>›</button>
        )}

        {/* live preview */}
        <div className="flex-1 p-4 min-w-0">
          {/* Top-level mode: read-only Insights (Summary <-> KPI Deep Dive) vs.
              the actual editable Report canvas -- Layout-tab cell picking/
              binding and every export still work exactly as before, just
              reached via "Edit Report" instead of always being "page 2". */}
          <div className="flex items-center justify-center gap-2 mb-3">
            <div className="flex rounded-md overflow-hidden" style={{ border: `1px solid ${chrome.line}` }}>
              <button onClick={() => setViewMode("insights")} className="px-3 py-1.5 text-xs font-bold"
                style={{ background: viewMode === "insights" ? Y : chrome.panel, color: viewMode === "insights" ? "#17181D" : chrome.sub }}>📊 Insights</button>
              <button onClick={() => setViewMode("edit")} className="px-3 py-1.5 text-xs font-bold"
                style={{ background: viewMode === "edit" ? Y : chrome.panel, color: viewMode === "edit" ? "#17181D" : chrome.sub }}>✎ Edit Report</button>
            </div>
            {viewMode === "insights" && (
              <>
                <button onClick={() => setPreviewPage(0)} disabled={previewPage === 0} className="px-3 py-1.5 text-xs font-semibold rounded-md"
                  style={{ background: chrome.panel, color: previewPage === 0 ? chrome.line : chrome.sub, border: `1px solid ${chrome.line}`, cursor: previewPage === 0 ? "default" : "pointer" }}>‹ Prev</button>
                <span style={{ fontSize: 11.5, color: chrome.sub }}>{previewPage === 0 ? "Page 1 of 2 — Summary" : "Page 2 of 2 — KPI Deep Dive"}</span>
                <button onClick={() => setPreviewPage(1)} disabled={previewPage === 1} className="px-3 py-1.5 text-xs font-semibold rounded-md"
                  style={{ background: chrome.panel, color: previewPage === 1 ? chrome.line : chrome.sub, border: `1px solid ${chrome.line}`, cursor: previewPage === 1 ? "default" : "pointer" }}>Next ›</button>
              </>
            )}
          </div>

          <div className="flex items-center justify-between mb-2.5 flex-wrap gap-2">
            <div style={{ ...fonts.disp, fontSize: 13, fontWeight: 600, color: chrome.text }}>
              {viewMode === "edit" ? "Live report preview" : previewPage === 0 ? "Summary" : "KPI Deep Dive"}
            </div>
            <div className="flex items-center gap-2">
              {viewMode === "insights" ? (
                <button onClick={askInsights} disabled={insightsLoading}
                  className="px-3 py-1.5 text-xs font-semibold rounded-md" style={{ background: chrome.panel, color: insightsLoading ? chrome.line : chrome.sub, border: `1px solid ${chrome.line}` }}>
                  {insightsLoading ? "Generating…" : "⟲ Regenerate insights"}
                </button>
              ) : (
                <span style={{ fontSize: 11, color: chrome.sub }}>Tap any cell to edit</span>
              )}
              <div className="flex items-center rounded-md overflow-hidden" style={{ border: `1px solid ${chrome.line}` }}>
                <button onClick={() => setPreviewZoom((z) => Math.max(50, z - 10))} className="px-2.5 py-1.5 text-xs font-bold" style={{ background: chrome.panel, color: chrome.sub }}>−</button>
                <button onClick={() => setPreviewZoom(100)} title="Reset zoom" className="px-2 py-1.5" style={{ background: chrome.panel, color: chrome.sub, fontSize: 10.5, ...fonts.mono }}>{previewZoom}%</button>
                <button onClick={() => setPreviewZoom((z) => Math.min(150, z + 10))} className="px-2.5 py-1.5 text-xs font-bold" style={{ background: chrome.panel, color: chrome.sub }}>+</button>
              </div>
              <div className="flex rounded-md overflow-hidden" style={{ border: `1px solid ${chrome.line}` }}>
                {[["light", "☀ Light"], ["dark", "☾ Dark"]].map(([m, l]) => (
                  <button key={m} onClick={() => setPreviewMode(m)} className="px-3 py-1.5 text-xs font-bold"
                    style={{ background: previewMode === m ? Y : chrome.panel, color: previewMode === m ? "#17181D" : chrome.sub }}>{l}</button>
                ))}
              </div>
              <div className="flex rounded-md overflow-hidden" style={{ border: `1px solid ${chrome.line}` }}>
                <button onClick={exportPreviewPng} disabled={!!exporting} title="Download this page as a PNG image"
                  className="px-2.5 py-1.5 text-xs font-semibold" style={{ background: chrome.panel, color: exporting ? chrome.line : chrome.sub, cursor: exporting ? "default" : "pointer" }}>
                  {exporting === "png" ? "Exporting…" : "⤓ PNG"}
                </button>
                <button onClick={exportPreviewPdf} disabled={!!exporting} title="Download this page as a PDF"
                  className="px-2.5 py-1.5 text-xs font-semibold" style={{ background: chrome.panel, color: exporting ? chrome.line : chrome.sub, borderLeft: `1px solid ${chrome.line}`, cursor: exporting ? "default" : "pointer" }}>
                  {exporting === "pdf" ? "Exporting…" : "⤓ PDF"}
                </button>
              </div>
            </div>
          </div>
          {previewIsTwin && (
            <p className="mb-2" style={{ fontSize: 10.5, color: chrome.sub }}>
              Viewing the auto-derived {previewMode} twin — colors are re-tuned from your base theme for {previewMode} backgrounds. Edits in Brand always apply to the base; the twin follows.
            </p>
          )}
          {viewMode === "insights" && insightsError && <p className="mb-2" style={{ fontSize: 10.5, color: "#F87171" }}>{insightsError}</p>}
          {exportError && <p className="mb-2" style={{ fontSize: 10.5, color: "#F87171" }}>{exportError}</p>}
          <div style={{ overflow: previewZoom > 100 ? "auto" : "visible" }}>
            <div style={{ transform: `scale(${previewZoom / 100})`, transformOrigin: "top left" }}>
              {/* All three stay mounted, toggled by display:none rather than a
                  ternary -- switching modes/pages is meant to feel like
                  flipping pages, not navigating away, so Summary's generated
                  captions and the Report page's selection/editing state
                  shouldn't reset just from glancing elsewhere. */}
              <div style={{ display: viewMode === "insights" && previewPage === 0 ? "block" : "none" }}>
                <Summary ref={summaryRef} theme={previewTheme} layout={layout} dataset={dataset} domainKey={domainKey} logo={logo}
                  captionsByIndex={captionsByIndex} onSelectKpi={onSelectKpi} />
              </div>
              <div style={{ display: viewMode === "insights" && previewPage === 1 ? "block" : "none" }}>
                <KpiDeepDive ref={deepDiveRef} theme={previewTheme} layout={layout} dataset={dataset} domainKey={domainKey} logo={logo}
                  captionsByIndex={captionsByIndex} selectedKpiIndex={selectedKpiIndex} onSelectKpi={onSelectKpi}
                  addFilter={addFilter} removeFilter={removeFilter} setFilterSelection={setFilterSelection} />
              </div>
              <div style={{ display: viewMode === "edit" ? "block" : "none" }}>
                <ReportPreview ref={previewRef} domainKey={domainKey} theme={previewTheme} layout={layout} logo={logo} selectedCell={selectedCell} onSelectCell={onSelectCell} dataset={dataset} setCellVisual={setCellVisual} setCellBinding={setCellBinding} setKpiStripBinding={setKpiStripBinding} setFilterSelection={setFilterSelection} setCellHeaderBg={setCellHeaderBg} addFilter={addFilter} removeFilter={removeFilter} hideEditAffordances={!!exporting} />
              </div>
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
    </div>
  );
}
