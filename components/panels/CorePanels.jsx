"use client";
import { useState } from "react";
import { DOMAINS, PRESETS, REPORT_FONTS, PAGE_SIZES, INDUSTRY_TO_DOMAIN } from "../../lib/data";
import { BRANDS } from "../../lib/brands";
import { alpha } from "../../lib/utils";
import { Y, chrome, fonts } from "../../lib/chrome";
import { Field, ColorInput, Slider } from "../ui";

// Report content template — independent of company/color choice. Picking a
// company auto-suggests one of these (by industry); this lets you override it,
// e.g. view a Technology company's colors against the Finance report content.
function DomainPicker({ domainKey, pickDomain }) {
  return (
    <Field label="Report content (KPIs, charts, slicers)">
      <div className="flex flex-wrap gap-1.5">
        {Object.entries(DOMAINS).map(([k, d]) => (
          <button key={k} onClick={() => pickDomain(k)} className="px-2.5 py-1.5 rounded-full text-xs font-semibold"
            style={{ background: domainKey === k ? Y : chrome.panel, color: domainKey === k ? "#17181D" : chrome.text, border: `1px solid ${domainKey === k ? Y : chrome.line}` }}>
            {d.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5" style={{ fontSize: 10.5, color: chrome.sub, lineHeight: 1.5 }}>
        Switches which dummy KPIs/charts/slicers show — colors from your picked company (if any) stay as they are.
        {Object.values(DOMAINS).some((d) => d.recommendedPreset) && " Marketing / Web Analytics is the one exception — it's built to match one specific reference dashboard, so picking it also applies its own layout and colors (Undo reverts it)."}
      </p>
    </Field>
  );
}

const BRANDS_BY_INDUSTRY = Object.entries(
  BRANDS.reduce((acc, b) => {
    (acc[b.industry] ||= []).push(b);
    return acc;
  }, {})
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([industry, list]) => [industry, [...list].sort((a, b) => a.company.localeCompare(b.company))]);

// Same tile look as the domain cards below: icon/badge, name, subtitle, swatches on the right.
function BrandTile({ b, active, onPick }) {
  return (
    <button onClick={onPick} className="flex items-center gap-3 p-3 rounded-lg text-left transition-colors w-full"
      style={{ background: active ? alpha(Y, 0.1) : chrome.panel, border: `1px solid ${active ? Y : chrome.line}` }}>
      <span style={{
        width: 26, height: 26, borderRadius: 6, flexShrink: 0, background: b.primary,
        display: "flex", alignItems: "center", justifyContent: "center",
        color: "#fff", fontWeight: 700, fontSize: 12, textShadow: "0 1px 2px rgba(0,0,0,0.4)",
      }}>{b.company.charAt(0)}</span>
      <span className="min-w-0">
        <span className="block truncate" style={{ fontSize: 13, fontWeight: 600, color: chrome.text }}>{b.company}</span>
        <span className="block truncate" style={{ fontSize: 11, color: chrome.sub }}>{b.industry} · {b.country}</span>
      </span>
      <span className="ml-auto flex gap-1 flex-shrink-0">
        {[b.primary, b.secondary, b.tertiary].map((c, i) => <span key={i} style={{ width: 8, height: 16, borderRadius: 2, background: c, border: `1px solid ${chrome.line}` }} />)}
      </span>
    </button>
  );
}

// One industry tile — click to expand/collapse its company list in place.
function IndustryTile({ industry, count, open, onToggle }) {
  const hasContentMatch = !!INDUSTRY_TO_DOMAIN[industry];
  return (
    <button onClick={onToggle} className="flex items-center gap-3 p-3 rounded-lg text-left transition-colors w-full"
      style={{ background: open ? alpha(Y, 0.1) : chrome.panel, border: `1px solid ${open ? Y : chrome.line}` }}>
      <span style={{ fontSize: 13, color: open ? Y : chrome.sub, transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", display: "inline-block" }}>▸</span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5">
          <span className="block truncate" style={{ fontSize: 13, fontWeight: 600, color: chrome.text }}>{industry}</span>
          {hasContentMatch && (
            <span title="This industry has a matching report content template — companies here set colors AND real KPIs/charts, not just recolored Workforce data."
              style={{ fontSize: 9, fontWeight: 700, color: "#17181D", background: Y, borderRadius: 4, padding: "1px 5px", flexShrink: 0 }}>MATCHED CONTENT</span>
          )}
        </span>
        <span className="block truncate" style={{ fontSize: 11, color: chrome.sub }}>{count} {count === 1 ? "company" : "companies"}</span>
      </span>
    </button>
  );
}

function IndustryPicker({ brandName, brandNote, pickBrand, clearBrand }) {
  const [openIndustry, setOpenIndustry] = useState(null);
  const [industryQuery, setIndustryQuery] = useState("");

  const q = industryQuery.trim().toLowerCase();
  const searching = q !== "";

  // Industry name match -> show its full company list. Otherwise, company name
  // match -> show just the matching companies within their industry. Either way,
  // a match while searching force-expands that industry so nothing needs a second click.
  const visibleIndustries = !searching
    ? BRANDS_BY_INDUSTRY.map(([industry, list]) => [industry, list])
    : BRANDS_BY_INDUSTRY
        .map(([industry, list]) => {
          if (industry.toLowerCase().includes(q)) return [industry, list];
          const companyMatches = list.filter((b) => b.company.toLowerCase().includes(q));
          return companyMatches.length ? [industry, companyMatches] : null;
        })
        .filter(Boolean);

  return (
    <Field label="Choose an industry, then a company">
      <input
        value={industryQuery}
        onChange={(e) => setIndustryQuery(e.target.value)}
        placeholder="Search industries or companies…"
        className="w-full p-2.5 rounded-md text-sm mb-2"
        style={{ background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}` }}
      />
      <div className="flex flex-col gap-2 pr-1" style={{ maxHeight: 480, overflowY: "auto" }}>
        {visibleIndustries.length === 0 && (
          <p style={{ fontSize: 11.5, color: chrome.sub }}>No industries or companies match "{industryQuery}".</p>
        )}
        {visibleIndustries.map(([industry, list]) => {
          const open = searching ? true : openIndustry === industry;
          return (
            <div key={industry}>
              <IndustryTile industry={industry} count={list.length} open={open} onToggle={() => setOpenIndustry(open ? null : industry)} />
              {open && (
                // No independent scroll region here on purpose -- this used to have its
                // own maxHeight/overflowY, which let a long company list "trap" the
                // mouse wheel separately from the outer industry list's scroll. It now
                // just flows inline in that single outer scroll container.
                <div className="flex flex-col gap-2 mt-2 pl-3 ml-1" style={{ borderLeft: `2px solid ${chrome.line}` }}>
                  {list.map((b) => (
                    <BrandTile key={b.company} b={b} active={brandName === b.company} onPick={() => pickBrand(b)} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
      {brandName && (
        <div className="flex items-center justify-between mt-2 px-2.5 py-1.5 rounded-md" style={{ background: alpha(Y, 0.1), border: `1px solid ${Y}` }}>
          <span style={{ fontSize: 11.5, color: chrome.text }}>Colors applied from <b>{brandName}</b></span>
          <button onClick={clearBrand} style={{ fontSize: 11, color: chrome.sub }}>✕</button>
        </div>
      )}
      {brandNote && (
        <div className="mt-2 px-2.5 py-1.5 rounded-md" style={{ background: alpha("#F87171", 0.1), border: "1px solid #F87171" }}>
          <span style={{ fontSize: 11.5, color: chrome.text }}>{brandNote}</span>
        </div>
      )}
      <p className="mt-1.5" style={{ fontSize: 10.5, color: chrome.sub, lineHeight: 1.5 }}>
        540-brand reference list, 26 industries. Picking a company sets both the report's colors and its content — Automotive, Finance and Logistics companies get matching dummy KPIs/charts; every other industry uses a general-purpose business dashboard.
      </p>
    </Field>
  );
}

export function TemplatePanel({ domainKey, pickDomain, brandName, brandNote, pickBrand, clearBrand }) {
  return (
    <div>
      <DomainPicker domainKey={domainKey} pickDomain={pickDomain} />
      <IndustryPicker brandName={brandName} brandNote={brandNote} pickBrand={pickBrand} clearBrand={clearBrand} />
    </div>
  );
}

const AGGS = [["sum", "Sum"], ["avg", "Average"], ["min", "Min"], ["max", "Max"], ["count", "Count"], ["countDistinct", "Distinct count"]];

function TableSelect({ dataset, value, onChange, role }) {
  const tables = Object.values(dataset.tables).filter((t) => !role || t.role === role);
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} className="w-full p-2 rounded-md text-xs"
      style={{ background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}` }}>
      <option value="">Select table…</option>
      {tables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
    </select>
  );
}

function ColumnSelect({ dataset, tableId, value, onChange, numericOnly }) {
  const table = dataset.tables[tableId];
  const cols = table ? table.columns.filter((c) => !numericOnly || c.type === "number") : [];
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={!table} className="w-full p-2 rounded-md text-xs"
      style={{ background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}` }}>
      <option value="">{table ? "Select column…" : "Pick a table first"}</option>
      {cols.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
    </select>
  );
}

function AggSelect({ value, onChange }) {
  return (
    <select value={value || "sum"} onChange={(e) => onChange(e.target.value)} className="p-2 rounded-md text-xs"
      style={{ background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}` }}>
      {AGGS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>
  );
}

// Group-by target can be a column on the fact table itself, or a column on any
// dimension table reachable from it via one relationship hop.
function GroupBySelect({ dataset, factTable, value, onChange }) {
  const relatedDims = dataset.relationships.filter((r) => r.factTable === factTable).map((r) => dataset.tables[r.dimTable]).filter(Boolean);
  const factCols = dataset.tables[factTable]?.columns || [];
  const currentVal = value ? `${value.table}::${value.column}` : "";

  const handle = (e) => {
    if (!e.target.value) { onChange(null); return; }
    const [table, column] = e.target.value.split("::");
    onChange({ table, column });
  };

  return (
    <select value={currentVal} onChange={handle} className="w-full p-2 rounded-md text-xs"
      style={{ background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}` }}>
      <option value="">No grouping</option>
      {factCols.map((c) => <option key={`self::${c.name}`} value={`${factTable}::${c.name}`}>{c.name} (this table)</option>)}
      {relatedDims.map((dim) => (
        <optgroup key={dim.id} label={dim.name}>
          {dim.columns.map((c) => <option key={`${dim.id}::${c.name}`} value={`${dim.id}::${c.name}`}>{c.name}</option>)}
        </optgroup>
      ))}
    </select>
  );
}

const NUMBER_FORMAT_DECIMALS = [["", "Auto"], ["0", "0"], ["1", "1"], ["2", "2"]];
const NUMBER_FORMAT_UNITS = [["none", "None"], ["K", "Thousands"], ["M", "Millions"], ["B", "Billions"], ["auto", "Auto"]];

function TitleField({ value, onChange }) {
  return (
    <input value={value || ""} onChange={(e) => onChange(e.target.value)} placeholder="Chart title (optional)"
      className="w-full p-2 rounded-md text-xs" style={{ background: chrome.bg, color: chrome.text, border: `1px solid ${chrome.line}` }} />
  );
}

function DataLabelsToggle({ value, onChange }) {
  return (
    <label className="flex items-center gap-1.5" style={{ fontSize: 11.5, color: chrome.text }}>
      <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.target.checked)} style={{ accentColor: Y }} />
      Show data labels
    </label>
  );
}

// decimals: undefined = "Auto" (today's fixed formatting behavior). unit: only
// shown when showUnit -- a percentage (donut) already carries its own "unit".
function NumberFormatFields({ format, onChange, showUnit }) {
  const patch = (p) => onChange({ ...(format || {}), ...p });
  return (
    <div className="flex gap-1.5">
      <select value={format?.decimals ?? ""} onChange={(e) => patch({ decimals: e.target.value === "" ? undefined : Number(e.target.value) })}
        className="p-2 rounded-md text-xs" style={{ background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}` }}>
        {NUMBER_FORMAT_DECIMALS.map(([v, l]) => <option key={v || "auto"} value={v}>{l} decimals</option>)}
      </select>
      {showUnit && (
        <select value={format?.unit || "none"} onChange={(e) => patch({ unit: e.target.value })}
          className="p-2 rounded-md text-xs" style={{ background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}` }}>
          {NUMBER_FORMAT_UNITS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      )}
    </div>
  );
}

function BindingFields({ type, dataset, binding, onChange }) {
  const patch = (p) => onChange({ ...binding, ...p });
  const patchMetric = (p) => onChange({ ...binding, metric: { ...binding.metric, ...p } });

  if (type === "kpi") {
    const isCounting = binding.metric.agg === "count" || binding.metric.agg === "countDistinct";
    return (
      <div className="flex flex-col gap-1.5">
        <TableSelect dataset={dataset} value={binding.metric.table} role="fact"
          onChange={(v) => onChange({ ...binding, metric: { table: v, column: "", agg: binding.metric.agg } })} />
        <div className="flex gap-1.5">
          <ColumnSelect dataset={dataset} tableId={binding.metric.table} value={binding.metric.column} numericOnly={!isCounting} onChange={(v) => patchMetric({ column: v })} />
          <AggSelect value={binding.metric.agg} onChange={(v) => patchMetric({ agg: v })} />
        </div>
        <input value={binding.label || ""} onChange={(e) => patch({ label: e.target.value })} placeholder="KPI label (optional)"
          className="w-full p-2 rounded-md text-xs" style={{ background: chrome.bg, color: chrome.text, border: `1px solid ${chrome.line}` }} />
        <NumberFormatFields format={binding.numberFormat} onChange={(nf) => patch({ numberFormat: nf })} showUnit />
      </div>
    );
  }

  if (type === "column" || type === "bar" || type === "donut") {
    return (
      <div className="flex flex-col gap-1.5">
        <TableSelect dataset={dataset} value={binding.metric.table} role="fact"
          onChange={(v) => onChange({ ...binding, metric: { table: v, column: "", agg: binding.metric.agg }, groupBy: null })} />
        <div className="flex gap-1.5">
          <ColumnSelect dataset={dataset} tableId={binding.metric.table} value={binding.metric.column} numericOnly onChange={(v) => patchMetric({ column: v })} />
          <AggSelect value={binding.metric.agg} onChange={(v) => patchMetric({ agg: v })} />
        </div>
        <GroupBySelect dataset={dataset} factTable={binding.metric.table} value={binding.groupBy} onChange={(gb) => patch({ groupBy: gb })} />
        <TitleField value={binding.title} onChange={(v) => patch({ title: v })} />
        {type === "column" && <DataLabelsToggle value={binding.showDataLabels} onChange={(v) => patch({ showDataLabels: v })} />}
        <NumberFormatFields format={binding.numberFormat} onChange={(nf) => patch({ numberFormat: nf })} showUnit={type !== "donut"} />
      </div>
    );
  }

  if (type === "line" || type === "area" || type === "columnGrouped") {
    const patchSeries = (idx, p) => {
      const series = [...binding.series];
      series[idx] = { ...series[idx], ...p };
      onChange({ ...binding, series });
    };
    const patchSeriesMetric = (idx, p) => patchSeries(idx, { metric: { ...binding.series[idx].metric, ...p } });
    return (
      <div className="flex flex-col gap-2">
        <GroupBySelect dataset={dataset} factTable={binding.series[0].metric.table} value={binding.groupBy} onChange={(gb) => patch({ groupBy: gb })} />
        {[0, 1].map((idx) => (
          <div key={idx} className="flex flex-col gap-1.5 p-2 rounded-md" style={{ background: chrome.bg, border: `1px solid ${chrome.line}` }}>
            <input value={binding.series[idx].label} onChange={(e) => patchSeries(idx, { label: e.target.value })}
              className="w-full p-1.5 rounded text-xs" style={{ background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}` }} />
            <TableSelect dataset={dataset} value={binding.series[idx].metric.table} role="fact"
              onChange={(v) => patchSeries(idx, { metric: { table: v, column: "", agg: binding.series[idx].metric.agg } })} />
            <div className="flex gap-1.5">
              <ColumnSelect dataset={dataset} tableId={binding.series[idx].metric.table} value={binding.series[idx].metric.column} numericOnly onChange={(v) => patchSeriesMetric(idx, { column: v })} />
              <AggSelect value={binding.series[idx].metric.agg} onChange={(v) => patchSeriesMetric(idx, { agg: v })} />
            </div>
          </div>
        ))}
        <TitleField value={binding.title} onChange={(v) => patch({ title: v })} />
        <DataLabelsToggle value={binding.showDataLabels} onChange={(v) => patch({ showDataLabels: v })} />
        <NumberFormatFields format={binding.numberFormat} onChange={(nf) => patch({ numberFormat: nf })} showUnit />
      </div>
    );
  }

  if (type === "table") {
    const table = dataset.tables[binding.table];
    const cols = binding.columns || [];
    const toggleCol = (name) => patch({ columns: cols.includes(name) ? cols.filter((c) => c !== name) : [...cols, name] });
    return (
      <div className="flex flex-col gap-1.5">
        <TableSelect dataset={dataset} value={binding.table} onChange={(v) => patch({ table: v, columns: [] })} />
        {table && (
          <div className="flex flex-wrap gap-1">
            {table.columns.map((c) => (
              <button key={c.name} onClick={() => toggleCol(c.name)} className="px-2 py-1 rounded-full text-[10px] font-semibold"
                style={{ background: cols.includes(c.name) ? Y : chrome.bg, color: cols.includes(c.name) ? "#17181D" : chrome.sub, border: `1px solid ${cols.includes(c.name) ? Y : chrome.line}` }}>
                {c.name}
              </button>
            ))}
          </div>
        )}
        <p style={{ fontSize: 10, color: chrome.sub }}>No columns selected shows all columns. Shows up to 8 rows.</p>
        {cols.length > 0 && (
          <div className="flex flex-col gap-1">
            <span style={{ fontSize: 10.5, fontWeight: 600, color: chrome.sub, letterSpacing: 0.4, textTransform: "uppercase" }}>Column headers</span>
            {cols.map((c) => (
              <div key={c} className="flex items-center gap-1.5">
                <span className="truncate" style={{ fontSize: 10.5, color: chrome.sub, width: 74, flexShrink: 0 }}>{c}</span>
                <input value={binding.columnLabels?.[c] || ""} placeholder={c}
                  onChange={(e) => patch({ columnLabels: { ...(binding.columnLabels || {}), [c]: e.target.value } })}
                  className="w-full p-1.5 rounded text-xs" style={{ background: chrome.bg, color: chrome.text, border: `1px solid ${chrome.line}` }} />
              </div>
            ))}
          </div>
        )}
        <TitleField value={binding.title} onChange={(v) => patch({ title: v })} />
        <NumberFormatFields format={binding.numberFormat} onChange={(nf) => patch({ numberFormat: nf })} showUnit />
      </div>
    );
  }

  return null;
}

// Toggle between "demo data" (this cell's dummy data, today's behavior) and
// "my data" (bind it to the uploaded dataset). Seeds a minimal valid binding
// per visual type when first switched on.
export function CellBindingEditor({ cell, dataset, onSetBinding }) {
  if (cell.type === "text") return null;
  const useData = cell.binding != null;
  const factTables = Object.values(dataset.tables).filter((t) => t.role === "fact");

  const toggle = (on) => {
    if (!on) { onSetBinding(null); return; }
    const firstFact = factTables[0];
    if (!firstFact) return;
    if (cell.type === "kpi") onSetBinding({ label: "", metric: { table: firstFact.id, column: "", agg: "sum" } });
    else if (["column", "bar", "donut"].includes(cell.type)) onSetBinding({ metric: { table: firstFact.id, column: "", agg: "sum" }, groupBy: null });
    else if (["line", "area", "columnGrouped"].includes(cell.type)) onSetBinding({
      groupBy: null,
      series: [{ label: "Series 1", metric: { table: firstFact.id, column: "", agg: "sum" } }, { label: "Series 2", metric: { table: firstFact.id, column: "", agg: "sum" } }],
    });
    else if (cell.type === "table") onSetBinding({ mode: "raw", table: firstFact.id, columns: [], limit: 8 });
  };

  return (
    <div className="mt-3 p-3 rounded-md" style={{ background: chrome.panel, border: `1px solid ${chrome.line}` }}>
      <div className="flex items-center justify-between mb-2">
        <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: chrome.sub }}>Data source</span>
        <div className="flex rounded-md overflow-hidden" style={{ border: `1px solid ${chrome.line}` }}>
          <button onClick={() => toggle(false)} className="px-2.5 py-1 text-xs font-semibold" style={{ background: !useData ? Y : "transparent", color: !useData ? "#17181D" : chrome.sub }}>Demo data</button>
          <button onClick={() => toggle(true)} disabled={!factTables.length} className="px-2.5 py-1 text-xs font-semibold" style={{ background: useData ? Y : "transparent", color: useData ? "#17181D" : chrome.sub }}>My data</button>
        </div>
      </div>
      {!factTables.length && (
        <p style={{ fontSize: 10.5, color: chrome.sub }}>Upload a fact table on the <a href="/data" style={{ textDecoration: "underline" }}>Data Model</a> page to bind this cell.</p>
      )}
      {useData && cell.binding && <BindingFields type={cell.type} dataset={dataset} binding={cell.binding} onChange={onSetBinding} />}
    </div>
  );
}

// Page-wide filter (slicer) configuration -- which real dataset columns show
// up as interactive filter chips in the report's Filters bar. Empty state
// keeps the bar showing today's static domain-demo pills (see SlicerTop /
// SlicerLeft in CellVisual.jsx) -- this section is purely additive.
export function FiltersSection({ dataset, filters, addFilter, removeFilter }) {
  const [pendingTable, setPendingTable] = useState("");
  const [pendingColumn, setPendingColumn] = useState("");
  const tables = Object.values(dataset.tables);

  const confirmAdd = () => {
    if (!pendingTable || !pendingColumn) return;
    addFilter(pendingTable, pendingColumn);
    setPendingTable("");
    setPendingColumn("");
  };

  return (
    <Field label="Filters (slicers)">
      {!tables.length && (
        <p className="mb-2" style={{ fontSize: 10.5, color: chrome.sub }}>Upload data on the <a href="/data" style={{ textDecoration: "underline" }}>Data Model</a> page to add real, working filters.</p>
      )}
      {filters.length > 0 && (
        <div className="flex flex-col gap-1.5 mb-2">
          {filters.map((f) => (
            <div key={f.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-md" style={{ background: chrome.panel, border: `1px solid ${chrome.line}` }}>
              <span style={{ fontSize: 11.5, color: chrome.text }}>{f.column} <span style={{ color: chrome.sub }}>({dataset.tables[f.table]?.name || f.table})</span></span>
              <button onClick={() => removeFilter(f.id)} style={{ fontSize: 11, color: chrome.sub }}>✕</button>
            </div>
          ))}
        </div>
      )}
      {tables.length > 0 && (
        <div className="flex gap-1.5">
          <TableSelect dataset={dataset} value={pendingTable} onChange={(v) => { setPendingTable(v); setPendingColumn(""); }} />
          <ColumnSelect dataset={dataset} tableId={pendingTable} value={pendingColumn} onChange={setPendingColumn} />
          <button onClick={confirmAdd} disabled={!pendingTable || !pendingColumn} className="px-3 py-2 text-xs font-bold rounded-md flex-shrink-0"
            style={{ background: pendingTable && pendingColumn ? Y : chrome.panel, color: pendingTable && pendingColumn ? "#17181D" : chrome.sub }}>+ Add</button>
        </div>
      )}
      <p className="mt-1.5" style={{ fontSize: 10.5, color: chrome.sub, lineHeight: 1.5 }}>
        Any column from a fact table or a joined dimension table. Selecting values in the report's Filters bar restricts every bound visual live.
      </p>
    </Field>
  );
}

export function LayoutPanel({ layout, setLayout, pickPreset }) {
  return (
    <div>
      <Field label="Grid preset">
        <div className="grid grid-cols-2 gap-2">
          {Object.entries(PRESETS).map(([k, pr]) => (
            <button key={k} onClick={() => pickPreset(k)} className="p-2.5 rounded-lg text-left"
              style={{ background: layout.preset === k ? alpha(Y, 0.1) : chrome.panel, border: `1px solid ${layout.preset === k ? Y : chrome.line}` }}>
              <div className="grid gap-0.5 mb-1.5" style={{ gridTemplateColumns: `repeat(${pr.cols}, 1fr)`, width: 52 }}>
                {pr.strip && <div style={{ gridColumn: `span ${pr.cols}`, height: 5, borderRadius: 1.5, background: layout.preset === k ? Y : chrome.sub, opacity: 0.85 }} />}
                {Array.from({ length: pr.cells }).map((_, i) => (
                  <div key={i} style={{ height: 10, borderRadius: 1.5, background: layout.preset === k ? alpha(Y, 0.6) : chrome.line }} />
                ))}
              </div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: chrome.text }}>{pr.label}</div>
              <div style={{ fontSize: 10, color: chrome.sub }}>{pr.cells} cells{pr.strip ? " + KPI strip" : ""}</div>
            </button>
          ))}
        </div>
      </Field>

      <Field label="Page size (Power BI canvas)">
        <div className="flex gap-1.5">
          {Object.entries(PAGE_SIZES).map(([k, ps]) => (
            <button key={k} onClick={() => setLayout((L) => ({ ...L, pageSize: k }))} className="flex-1 py-2 text-xs font-semibold rounded-md"
              style={{ background: layout.pageSize === k ? Y : chrome.panel, color: layout.pageSize === k ? "#17181D" : chrome.sub, border: `1px solid ${layout.pageSize === k ? Y : chrome.line}` }}>
              {ps.label}{k !== "responsive" ? ` · ${ps.w}×${ps.h}` : ""}
            </button>
          ))}
        </div>
        <p className="mt-1.5" style={{ fontSize: 10.5, color: chrome.sub }}>16:9 locks the preview to the exact Power BI canvas proportions. Fit width stretches for easy viewing; exports always use real pixel coordinates.</p>
      </Field>

      <Field label="Header band (logo + title)">
        <div className="flex gap-1.5 mb-2">
          {[[true, "Show"], [false, "Hide"]].map(([v, l]) => (
            <button key={l} onClick={() => setLayout((L) => ({ ...L, header: { ...L.header, show: v } }))} className="flex-1 py-2 text-xs font-semibold rounded-md"
              style={{ background: (layout.header?.show !== false) === v ? Y : chrome.panel, color: (layout.header?.show !== false) === v ? "#17181D" : chrome.sub, border: `1px solid ${(layout.header?.show !== false) === v ? Y : chrome.line}` }}>{l}</button>
          ))}
        </div>
        {layout.header?.show !== false && (
          <div>
            <div className="flex justify-between mb-1" style={{ fontSize: 11, color: chrome.sub }}>
              <span style={{ fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>Header height</span>
              <span style={{ ...fonts.mono, color: chrome.text }}>{layout.header?.height || 64}px of {(PAGE_SIZES[layout.pageSize] || PAGE_SIZES["16:9"]).h}px</span>
            </div>
            <input type="range" min={48} max={110} value={layout.header?.height || 64} onChange={(e) => setLayout((L) => ({ ...L, header: { ...L.header, height: Number(e.target.value) } }))} className="w-full" style={{ accentColor: Y }} />
          </div>
        )}
      </Field>

      <Field label="Slicer position">
        <div className="flex gap-1.5">
          {[["top", "Top strip"], ["left", "Left rail"], ["none", "None"]].map(([v, l]) => (
            <button key={v} onClick={() => setLayout((L) => ({ ...L, slicerPos: v }))} className="flex-1 py-2 text-xs font-semibold rounded-md"
              style={{ background: layout.slicerPos === v ? Y : chrome.panel, color: layout.slicerPos === v ? "#17181D" : chrome.sub, border: `1px solid ${layout.slicerPos === v ? Y : chrome.line}` }}>{l}</button>
          ))}
        </div>
      </Field>

      <p style={{ fontSize: 11, color: chrome.sub, lineHeight: 1.5 }}>Tap any cell, KPI card, or the Filters bar in the live preview to edit its data source.</p>
    </div>
  );
}

export function BrandPanel({ theme, set, logo, setLogo, onLogo, fileRef }) {
  return (
    <div>
      <Field label="Brand logo">
        <div className="flex items-center gap-3">
          <button onClick={() => fileRef.current?.click()} className="px-3 py-2 text-xs font-semibold rounded-md" style={{ background: chrome.panel, color: chrome.text, border: `1px dashed ${chrome.line}` }}>
            {logo ? "Replace logo" : "Upload logo"}
          </button>
          {logo && (
            <>
              <img src={logo} alt="logo preview" style={{ height: 28, maxWidth: 80, objectFit: "contain", background: "#fff", borderRadius: 6, padding: 3 }} />
              <button onClick={() => setLogo(null)} style={{ fontSize: 11, color: chrome.sub }}>Remove</button>
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" onChange={onLogo} className="hidden" />
        </div>
        <p className="mt-1.5" style={{ fontSize: 10.5, color: chrome.sub }}>Uploading a logo auto-extracts brand colors into the palette.</p>
      </Field>

      <Field label="Data colors">
        <div className="flex flex-wrap gap-2">
          {theme.dataColors.map((c, i) => (
            <ColorInput key={i} value={c} onChange={(v) => { const dc = [...theme.dataColors]; dc[i] = v; set({ dataColors: dc, ...(i === 0 ? { tableAccent: v } : {}) }); }} />
          ))}
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Card background"><ColorInput value={theme.background} onChange={(v) => set({ background: v })} /></Field>
        <Field label="Page background"><ColorInput value={theme.secondaryBackground} onChange={(v) => set({ secondaryBackground: v })} /></Field>
        <Field label="Text"><ColorInput value={theme.foreground} onChange={(v) => set({ foreground: v })} /></Field>
        <Field label="Muted text"><ColorInput value={theme.secondaryForeground} onChange={(v) => set({ secondaryForeground: v })} /></Field>
        <Field label="Good / KPI up"><ColorInput value={theme.good} onChange={(v) => set({ good: v })} /></Field>
        <Field label="Bad / KPI down"><ColorInput value={theme.bad} onChange={(v) => set({ bad: v })} /></Field>
      </div>

      <Field label="Report font">
        <select value={theme.fontFamily} onChange={(e) => set({ fontFamily: e.target.value })} className="w-full p-2 rounded-md text-sm" style={{ background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}` }}>
          {REPORT_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <p className="mt-1.5" style={{ fontSize: 10.5, color: chrome.sub, lineHeight: 1.5 }}>
          Picking a company sets colors only, never a font — a client's real brand font usually isn't installed on every machine that opens the report, and Power BI silently falls back when it's missing. This list is limited to fonts that render reliably everywhere.
        </p>
      </Field>

      <Slider label="KPI number size" value={theme.calloutSize} min={22} max={42} suffix="pt" onChange={(v) => set({ calloutSize: v })} />
      <Slider label="Visual title size" value={theme.titleSize} min={10} max={18} suffix="pt" onChange={(v) => set({ titleSize: v })} />
      <Slider label="Label size" value={theme.labelSize} min={8} max={13} suffix="pt" onChange={(v) => set({ labelSize: v })} />
      <Slider label="Card corner radius" value={theme.cardRadius} min={0} max={16} suffix="px" onChange={(v) => set({ cardRadius: v })} />
    </div>
  );
}
