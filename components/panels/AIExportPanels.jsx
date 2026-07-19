"use client";
import { Y, chrome } from "../../lib/chrome";
import { fonts } from "../../lib/chrome";
import { Field } from "../ui";

export function AIPanel({ aiPrompt, setAiPrompt, aiImage, setAiImage, onAiImage, askAI, aiLoading, aiError, rationale, dataset }) {
  const disabled = aiLoading || (!aiPrompt.trim() && !aiImage);
  const hasFactTable = dataset?.tables && Object.values(dataset.tables).some((t) => t.role === "fact");
  return (
    <div>
      <Field label="Describe the report you want">
        <textarea
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          rows={4}
          placeholder='e.g. "Executive OTA dashboard for a monthly steering meeting, dark mode, dense 3x3 layout with commentary" — the AI picks theme AND layout'
          className="w-full p-3 rounded-md text-sm"
          style={{ background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}`, resize: "vertical", ...fonts.ui }}
        />
        {hasFactTable && (
          <p className="mt-1.5" style={{ fontSize: 10.5, color: chrome.sub, lineHeight: 1.5 }}>
            Your uploaded data is available — mention what the report is about and the AI will bind charts to it where it makes sense.
          </p>
        )}
      </Field>
      <Field label="Attach a screenshot (optional)">
        {aiImage ? (
          <div className="flex items-center gap-3">
            <img src={aiImage} alt="reference screenshot" style={{ height: 44, maxWidth: 90, objectFit: "cover", borderRadius: 6, border: `1px solid ${chrome.line}` }} />
            <button onClick={() => setAiImage(null)} style={{ fontSize: 11, color: chrome.sub }}>Remove</button>
          </div>
        ) : (
          <label className="px-3 py-2 text-xs font-semibold rounded-md inline-block cursor-pointer" style={{ background: chrome.panel, color: chrome.text, border: `1px dashed ${chrome.line}` }}>
            Upload a dashboard screenshot
            <input type="file" accept="image/*" onChange={onAiImage} className="hidden" />
          </label>
        )}
        <p className="mt-1.5" style={{ fontSize: 10.5, color: chrome.sub, lineHeight: 1.5 }}>
          Used for color/style/layout inspiration only — never as a data source. Your uploaded dataset is still the only source for chart data.
        </p>
      </Field>
      <button onClick={askAI} disabled={disabled} className="w-full py-2.5 text-sm font-bold rounded-md mb-3"
        style={{ background: disabled ? chrome.panel : Y, color: disabled ? chrome.sub : "#17181D" }}>
        {aiLoading ? "Designing…" : "✦ Generate theme + layout with AI"}
      </button>
      {aiError && <p style={{ fontSize: 11.5, color: "#F87171" }}>{aiError}</p>}
      {rationale && !aiLoading && (
        <div className="p-3 rounded-md" style={{ background: chrome.panel, border: `1px solid ${chrome.line}` }}>
          <div style={{ fontSize: 10.5, fontWeight: 700, color: Y, letterSpacing: 0.4, marginBottom: 4 }}>DESIGN RATIONALE</div>
          <p style={{ fontSize: 12, color: chrome.text, lineHeight: 1.5 }}>{rationale}</p>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["Executive dark mode, dense grid", "Bright & friendly, simple 2x2", "Ops control room, left filters", "Print-safe minimal, KPI strip"].map((q) => (
          <button key={q} onClick={() => setAiPrompt(q)} className="px-2.5 py-1.5 rounded-full" style={{ fontSize: 11, color: chrome.sub, border: `1px solid ${chrome.line}` }}>{q}</button>
        ))}
      </div>
    </div>
  );
}

export function ExportPanel({ theme, set, themeJson, lightJson, darkJson, layoutJson, slug, downloadFile, downloadPair, copyJson, copied }) {
  return (
    <div>
      <Field label="Theme name">
        <input value={theme.name} onChange={(e) => set({ name: e.target.value })} className="w-full p-2.5 rounded-md text-sm" style={{ background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}` }} />
      </Field>
      <div className="flex flex-col gap-2 mb-3">
        <button onClick={downloadPair} className="w-full py-2.5 text-sm font-bold rounded-md" style={{ background: Y, color: "#17181D" }}>
          ⬇ Download theme pair (light + dark)
        </button>
        <div className="flex gap-2">
          <button onClick={() => downloadFile(lightJson, `${slug}-light.json`)} className="flex-1 py-2.5 text-xs font-semibold rounded-md" style={{ background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}` }}>☀ Light only</button>
          <button onClick={() => downloadFile(darkJson, `${slug}-dark.json`)} className="flex-1 py-2.5 text-xs font-semibold rounded-md" style={{ background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}` }}>☾ Dark only</button>
        </div>
        <div className="flex gap-2">
          <button onClick={() => downloadFile(layoutJson, "layout-spec.json")} className="flex-1 py-2.5 text-sm font-semibold rounded-md" style={{ background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}` }}>⬇ Layout spec</button>
          <button onClick={copyJson} className="px-4 py-2.5 text-sm font-semibold rounded-md" style={{ background: chrome.panel, color: chrome.text, border: `1px solid ${chrome.line}` }}>{copied ? "✓" : "Copy theme"}</button>
        </div>
      </div>
      <div className="p-3 rounded-md mb-3" style={{ background: chrome.panel, border: `1px solid ${chrome.line}` }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: Y, letterSpacing: 0.4, marginBottom: 4 }}>HOW TO APPLY IN POWER BI</div>
        <p style={{ fontSize: 12, color: chrome.text, lineHeight: 1.6 }}>
          Theme: <b>View → Themes → Browse for themes</b> → pick a .json. Layout spec: your build sheet — exact x/y/width/height pixel positions for the header band, slicers, KPI strip and every cell on the canvas (type them into Format → General → Properties → Position).
        </p>
      </div>
      <div className="p-3 rounded-md mb-3" style={{ background: chrome.panel, border: `1px solid ${chrome.line}` }}>
        <div style={{ fontSize: 10.5, fontWeight: 700, color: Y, letterSpacing: 0.4, marginBottom: 4 }}>DARK MODE TOGGLE (BOOKMARK METHOD)</div>
        <p style={{ fontSize: 12, color: chrome.text, lineHeight: 1.6 }}>
          Power BI has no runtime theme switching, so use the standard workaround: 1) Build your page with the <b>light</b> theme applied. 2) Duplicate the page, apply the <b>dark</b> theme styling to the copy. 3) Add a button on each page (Insert → Buttons) with a <b>Page navigation</b> action pointing to the other page. End users get a working ☀/☾ toggle.
        </p>
      </div>
      <pre className="p-3 rounded-md overflow-auto" style={{ ...fonts.mono, fontSize: 10, color: chrome.sub, background: "#121318", border: `1px solid ${chrome.line}`, maxHeight: 220 }}>{themeJson}</pre>
    </div>
  );
}
