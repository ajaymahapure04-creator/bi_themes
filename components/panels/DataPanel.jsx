"use client";
import { useState, useRef } from "react";
import { addOrReplaceTable, removeTable, slugifyTableId } from "../../lib/dataset";
import { parseCsvText } from "../../lib/csv-parse";
import { alpha } from "../../lib/utils";
import { Y, chrome, fonts } from "../../lib/chrome";
import { Field } from "../ui";

// Step 2 of the Accelerator flow: decide whether the report is built on the
// synthetic starter data (today's demo KPIs/charts, always available, zero
// setup) or the client's real data. This choice has to happen before Layout
// so cell bindings can point at real columns from the moment they're picked,
// instead of a user building the whole layout on demo data and only
// discovering "My data" toggles later on the Data Model page.
export default function DataPanel({ dataset, setDataset }) {
  const [mode, setMode] = useState(() => (Object.keys(dataset.tables).length ? "import" : "starter"));
  const [tableName, setTableName] = useState("");
  const [csvText, setCsvText] = useState("");
  const [importError, setImportError] = useState("");
  const fileRef = useRef(null);

  const tables = Object.values(dataset.tables);
  const existingIds = tables.map((t) => t.id);

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = () => setCsvText(String(reader.result || ""));
    reader.readAsText(f);
  };

  const addTable = () => {
    setImportError("");
    if (!tableName.trim()) return setImportError("Give the table a name.");
    if (!csvText.trim()) return setImportError("Paste CSV text or upload a .csv file first.");
    let parsed;
    try {
      parsed = parseCsvText(csvText);
    } catch (e) {
      return setImportError("Couldn't parse that CSV — check it's valid comma-separated text with a header row.");
    }
    if (!parsed.columns.length) return setImportError("No columns found — check the CSV has a header row.");

    const id = slugifyTableId(tableName, existingIds);
    const table = {
      id, name: tableName.trim(), role: "fact",
      columns: parsed.columns, rows: parsed.rows, rowCount: parsed.rowCount, truncated: parsed.truncated,
      primaryKey: null,
    };
    setDataset((d) => addOrReplaceTable(d, table));
    setTableName("");
    setCsvText("");
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div>
      <Field label="Where should this report's data come from?">
        <div className="flex gap-1.5">
          <button onClick={() => setMode("starter")} className="flex-1 p-2.5 rounded-lg text-left"
            style={{ background: mode === "starter" ? alpha(Y, 0.1) : chrome.panel, border: `1px solid ${mode === "starter" ? Y : chrome.line}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: chrome.text }}>◇ Starter data</div>
            <div style={{ fontSize: 10, color: chrome.sub, lineHeight: 1.4 }}>Ready instantly — realistic dummy KPIs/charts for the picked industry.</div>
          </button>
          <button onClick={() => setMode("import")} className="flex-1 p-2.5 rounded-lg text-left"
            style={{ background: mode === "import" ? alpha(Y, 0.1) : chrome.panel, border: `1px solid ${mode === "import" ? Y : chrome.line}` }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: chrome.text }}>⛁ Import your data</div>
            <div style={{ fontSize: 10, color: chrome.sub, lineHeight: 1.4 }}>Upload real CSVs — the Layout step binds visuals straight to it.</div>
          </button>
        </div>
      </Field>

      {mode === "starter" && (
        <p style={{ fontSize: 11.5, color: chrome.sub, lineHeight: 1.6 }}>
          Nothing to do here — every KPI card and chart in the next steps will show the industry's demo data. You (or the client) can switch to real data any time before ordering the final package; nothing gets thrown away when you do.
        </p>
      )}

      {mode === "import" && (
        <>
          <Field label="Quick add a table (CSV, first row = headers)">
            <input value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="e.g. Sales, Headcount"
              className="w-full p-2.5 rounded-md text-sm mb-2" style={{ background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}` }} />
            <div className="flex gap-2 mb-1.5">
              <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 text-xs font-semibold rounded-md"
                style={{ background: chrome.panel, color: chrome.text, border: `1px dashed ${chrome.line}` }}>Upload .csv</button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
              <span style={{ fontSize: 10.5, color: chrome.sub, alignSelf: "center" }}>or paste below</span>
            </div>
            <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={4}
              placeholder={"Region,Revenue\nEast,42000\nWest,38500"}
              className="w-full p-2.5 rounded-md text-xs" style={{ ...fonts.mono, background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}`, resize: "vertical" }} />
          </Field>
          {importError && <p style={{ fontSize: 11.5, color: "#F87171", marginBottom: 8 }}>{importError}</p>}
          <button onClick={addTable} className="px-3.5 py-2 text-xs font-bold rounded-md mb-3" style={{ background: Y, color: "#17181D" }}>+ Add table</button>

          {tables.length > 0 && (
            <div className="flex flex-col gap-1.5 mb-2">
              {tables.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-md" style={{ background: chrome.panel, border: `1px solid ${chrome.line}` }}>
                  <span style={{ fontSize: 11.5, color: chrome.text }}>
                    {t.name} <span style={{ color: chrome.sub }}>· {t.rowCount} rows · {t.role}</span>
                  </span>
                  <button onClick={() => setDataset((d) => removeTable(d, t.id))} style={{ fontSize: 11, color: chrome.sub }}>✕</button>
                </div>
              ))}
            </div>
          )}

          <p style={{ fontSize: 10.5, color: chrome.sub, lineHeight: 1.6 }}>
            Need multiple related tables (e.g. a Sales fact joined to a Region dimension)? Use the full{" "}
            <a href="/data" style={{ textDecoration: "underline" }}>Data Model</a> page for roles and relationships, then come back here — it's the same dataset.
          </p>
        </>
      )}
    </div>
  );
}
