"use client";
import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import {
  EMPTY_DATASET, loadDataset, saveDataset,
  addOrReplaceTable, removeTable, addRelationship, removeRelationship, slugifyTableId,
} from "../lib/dataset";
import { parseCsvText } from "../lib/csv-parse";
import { alpha } from "../lib/utils";
import { Y, chrome, fonts } from "../lib/chrome";
import { Field } from "./ui";

function TableCard({ table, onRemove }) {
  return (
    <div className="p-3 rounded-lg" style={{ background: chrome.panel, border: `1px solid ${chrome.line}` }}>
      <div className="flex items-start justify-between gap-2 mb-1.5">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="truncate" style={{ fontSize: 13, fontWeight: 700, color: chrome.text }}>{table.name}</span>
            <span className="px-1.5 py-0.5 rounded" style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase", background: table.role === "fact" ? alpha(Y, 0.15) : alpha("#60A5FA", 0.15), color: table.role === "fact" ? Y : "#60A5FA" }}>
              {table.role}
            </span>
          </div>
          <div style={{ fontSize: 10.5, color: chrome.sub }}>
            {table.rowCount} rows · {table.columns.length} columns{table.truncated ? " · truncated at import" : ""}
          </div>
        </div>
        <button onClick={() => onRemove(table.id)} style={{ fontSize: 11, color: chrome.sub, flexShrink: 0 }}>✕</button>
      </div>
      <div className="flex flex-wrap gap-1">
        {table.columns.map((c) => (
          <span key={c.name} className="px-1.5 py-0.5 rounded" style={{ fontSize: 10, ...fonts.mono, color: chrome.sub, border: `1px solid ${chrome.line}` }}>
            {c.name} <span style={{ opacity: 0.6 }}>· {c.type}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

export default function DataStudio() {
  const [dataset, setDataset] = useState(EMPTY_DATASET);
  const [hydrated, setHydrated] = useState(false);
  const [warning, setWarning] = useState("");

  const [tableName, setTableName] = useState("");
  const [tableRole, setTableRole] = useState("fact");
  const [csvText, setCsvText] = useState("");
  const [importError, setImportError] = useState("");
  const fileRef = useRef(null);

  const [relFact, setRelFact] = useState("");
  const [relFactCol, setRelFactCol] = useState("");
  const [relDim, setRelDim] = useState("");
  const [relDimCol, setRelDimCol] = useState("");

  useEffect(() => {
    setDataset(loadDataset());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const res = saveDataset(dataset);
    setWarning(res.ok ? "" : "Couldn't save that — the dataset may be too large for browser storage. Try removing a table or a large CSV.");
  }, [dataset, hydrated]);

  const tables = Object.values(dataset.tables);
  const factTables = tables.filter((t) => t.role === "fact");
  const dimTables = tables.filter((t) => t.role === "dimension");
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
      id, name: tableName.trim(), role: tableRole,
      columns: parsed.columns, rows: parsed.rows, rowCount: parsed.rowCount, truncated: parsed.truncated,
      primaryKey: null,
    };
    setDataset((d) => addOrReplaceTable(d, table));
    setTableName("");
    setCsvText("");
    if (fileRef.current) fileRef.current.value = "";
  };

  const doRemoveTable = (id) => setDataset((d) => removeTable(d, id));

  const factColOptions = dataset.tables[relFact]?.columns || [];
  const dimColOptions = dataset.tables[relDim]?.columns || [];
  const canAddRel = relFact && relFactCol && relDim && relDimCol;

  const doAddRelationship = () => {
    if (!canAddRel) return;
    const id = `${relFact}.${relFactCol}->${relDim}.${relDimCol}`;
    if (dataset.relationships.some((r) => r.id === id)) return;
    setDataset((d) => addRelationship(d, { id, factTable: relFact, factColumn: relFactCol, dimTable: relDim, dimColumn: relDimCol }));
    setRelFactCol("");
    setRelDimCol("");
  };

  const selectStyle = { background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}` };

  return (
    <div className="min-h-screen w-full" style={{ background: chrome.bg, ...fonts.ui }}>
      <div className="flex items-center justify-between px-4 py-3 flex-wrap gap-2" style={{ borderBottom: `1px solid ${chrome.line}` }}>
        <div className="flex items-center gap-2.5">
          <div style={{ width: 30, height: 30, borderRadius: 8, background: Y, display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 700, color: "#17181D", ...fonts.disp, fontSize: 15 }}>⛁</div>
          <div>
            <div style={{ ...fonts.disp, fontWeight: 700, fontSize: 16, color: chrome.text, lineHeight: 1.1 }}>Data Model</div>
            <div style={{ fontSize: 10.5, color: chrome.sub }}>Upload dimension &amp; fact tables, define relationships, bind them to cells</div>
          </div>
        </div>
        <Link href="/" className="px-3 py-2 text-xs font-semibold rounded-md" style={{ background: "transparent", color: chrome.sub, border: `1px solid ${chrome.line}` }}>
          ← Back to Studio
        </Link>
      </div>

      <div className="max-w-3xl mx-auto p-4 flex flex-col gap-4">
        {warning && (
          <div className="p-3 rounded-md" style={{ background: alpha("#F87171", 0.1), border: "1px solid #F87171" }}>
            <span style={{ fontSize: 12, color: chrome.text }}>{warning}</span>
          </div>
        )}

        <div className="p-4 rounded-lg" style={{ background: chrome.panel, border: `1px solid ${chrome.line}` }}>
          <div style={{ ...fonts.disp, fontSize: 14, fontWeight: 700, color: chrome.text, marginBottom: 10 }}>Add a table</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
            <Field label="Table name">
              <input value={tableName} onChange={(e) => setTableName(e.target.value)} placeholder="e.g. Sales, Region"
                className="w-full p-2.5 rounded-md text-sm" style={{ background: chrome.bg, color: chrome.text, border: `1px solid ${chrome.line}` }} />
            </Field>
            <Field label="Role">
              <div className="flex gap-1.5">
                {[["fact", "Fact"], ["dimension", "Dimension"]].map(([v, l]) => (
                  <button key={v} onClick={() => setTableRole(v)} className="flex-1 py-2.5 text-xs font-semibold rounded-md"
                    style={{ background: tableRole === v ? Y : chrome.bg, color: tableRole === v ? "#17181D" : chrome.sub, border: `1px solid ${tableRole === v ? Y : chrome.line}` }}>{l}</button>
                ))}
              </div>
            </Field>
          </div>
          <Field label="CSV data (upload or paste, first row = headers)">
            <div className="flex gap-2 mb-1.5">
              <button onClick={() => fileRef.current?.click()} className="px-3 py-1.5 text-xs font-semibold rounded-md"
                style={{ background: chrome.bg, color: chrome.text, border: `1px dashed ${chrome.line}` }}>Upload .csv</button>
              <input ref={fileRef} type="file" accept=".csv,text/csv" onChange={handleFile} className="hidden" />
              <span style={{ fontSize: 10.5, color: chrome.sub, alignSelf: "center" }}>or paste below</span>
            </div>
            <textarea value={csvText} onChange={(e) => setCsvText(e.target.value)} rows={5}
              placeholder={"RegionID,RegionName\nR1,East\nR2,West"}
              className="w-full p-2.5 rounded-md text-xs" style={{ ...fonts.mono, background: chrome.bg, color: chrome.text, border: `1px solid ${chrome.line}`, resize: "vertical" }} />
          </Field>
          {importError && <p style={{ fontSize: 11.5, color: "#F87171", marginBottom: 8 }}>{importError}</p>}
          <button onClick={addTable} className="px-3.5 py-2 text-xs font-bold rounded-md" style={{ background: Y, color: "#17181D" }}>+ Add table</button>
          <p className="mt-2" style={{ fontSize: 10.5, color: chrome.sub, lineHeight: 1.5 }}>
            Capped at 2,000 rows / 40 columns per table — this is a mockup tool, not a production BI backend.
          </p>
        </div>

        <div>
          <div style={{ ...fonts.disp, fontSize: 14, fontWeight: 700, color: chrome.text, marginBottom: 10 }}>Your tables {tables.length > 0 && `(${tables.length})`}</div>
          {tables.length === 0 ? (
            <p style={{ fontSize: 12, color: chrome.sub }}>No tables yet — add one above.</p>
          ) : (
            <div className="flex flex-col gap-2">
              {tables.map((t) => <TableCard key={t.id} table={t} onRemove={doRemoveTable} />)}
            </div>
          )}
        </div>

        <div className="p-4 rounded-lg" style={{ background: chrome.panel, border: `1px solid ${chrome.line}` }}>
          <div style={{ ...fonts.disp, fontSize: 14, fontWeight: 700, color: chrome.text, marginBottom: 4 }}>Relationships</div>
          <p style={{ fontSize: 11, color: chrome.sub, marginBottom: 10 }}>Connect a fact table's foreign key to a dimension table's key column — used to group/filter by dimension attributes.</p>

          {!factTables.length || !dimTables.length ? (
            <p style={{ fontSize: 12, color: chrome.sub }}>Add at least one Fact table and one Dimension table above to define a relationship.</p>
          ) : (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2">
                <div className="flex flex-col gap-1.5">
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: chrome.sub }}>Fact table → column</span>
                  <select value={relFact} onChange={(e) => { setRelFact(e.target.value); setRelFactCol(""); }} className="w-full p-2 rounded-md text-xs" style={selectStyle}>
                    <option value="">Select fact table…</option>
                    {factTables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select value={relFactCol} onChange={(e) => setRelFactCol(e.target.value)} disabled={!relFact} className="w-full p-2 rounded-md text-xs" style={selectStyle}>
                    <option value="">Select FK column…</option>
                    {factColOptions.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="flex flex-col gap-1.5">
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase", color: chrome.sub }}>Dimension table → column</span>
                  <select value={relDim} onChange={(e) => { setRelDim(e.target.value); setRelDimCol(""); }} className="w-full p-2 rounded-md text-xs" style={selectStyle}>
                    <option value="">Select dimension table…</option>
                    {dimTables.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                  <select value={relDimCol} onChange={(e) => setRelDimCol(e.target.value)} disabled={!relDim} className="w-full p-2 rounded-md text-xs" style={selectStyle}>
                    <option value="">Select key column…</option>
                    {dimColOptions.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
              </div>
              <button onClick={doAddRelationship} disabled={!canAddRel} className="px-3.5 py-2 text-xs font-bold rounded-md"
                style={{ background: canAddRel ? Y : chrome.bg, color: canAddRel ? "#17181D" : chrome.sub, border: `1px solid ${canAddRel ? Y : chrome.line}` }}>
                + Add relationship
              </button>
            </>
          )}

          {dataset.relationships.length > 0 && (
            <div className="flex flex-col gap-1.5 mt-3">
              {dataset.relationships.map((r) => (
                <div key={r.id} className="flex items-center justify-between px-2.5 py-1.5 rounded-md" style={{ background: chrome.bg, border: `1px solid ${chrome.line}` }}>
                  <span style={{ ...fonts.mono, fontSize: 11, color: chrome.text }}>
                    {dataset.tables[r.factTable]?.name}.{r.factColumn} → {dataset.tables[r.dimTable]?.name}.{r.dimColumn}
                  </span>
                  <button onClick={() => setDataset((d) => removeRelationship(d, r.id))} style={{ fontSize: 11, color: chrome.sub }}>✕</button>
                </div>
              ))}
            </div>
          )}
        </div>

        <p style={{ fontSize: 11, color: chrome.sub, lineHeight: 1.6 }}>
          Once you have at least one fact table, go back to Studio → <b>3·Layout</b>, select a cell, and switch its "Data source" to <b>My data</b> to bind it to a measure/grouping computed from what you've loaded here.
        </p>
      </div>
    </div>
  );
}
