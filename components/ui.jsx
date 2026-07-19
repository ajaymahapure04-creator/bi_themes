"use client";
import { Y, chrome, fonts } from "../lib/chrome";
import { alpha } from "../lib/utils";

/* Shared studio-chrome UI primitives used across all panels. */

// A collapsible step in the left panel — click the header to expand/collapse,
// clicking the currently-open header collapses it back (true accordion, not tabs).
// Green used only for the "visited" step badge -- distinct from Y (active/current)
// and chrome.sub (not yet opened), so the three states read apart at a glance.
const DONE = "#6EE7B7";

// visited: this section has been opened at least once. The numbers are NOT a
// required order (every section is reachable any time) -- the checkmark exists
// so users get an honest "seen this already" signal instead of reading the
// numbering as a gate they have to clear in sequence.
export function AccordionSection({ id, step, label, subtitle, tab, setTab, visited, children }) {
  const open = tab === id;
  const showCheck = visited && !open;
  return (
    <div className="rounded-lg mb-2" style={{ border: `1px solid ${open ? Y : chrome.line}`, overflow: "hidden" }}>
      <button
        onClick={() => setTab(open ? null : id)}
        className="w-full flex items-center gap-2.5 p-3 text-left transition-colors"
        style={{ background: open ? alpha(Y, 0.1) : chrome.panel }}
      >
        <span style={{
          fontSize: 12, color: open ? Y : chrome.sub, flexShrink: 0,
          transform: open ? "rotate(90deg)" : "none", transition: "transform 0.15s", display: "inline-block",
        }}>▸</span>
        {step != null && (
          <span title={showCheck ? "Already visited" : `Step ${step}`} style={{
            ...fonts.mono, fontSize: showCheck ? 10 : 10.5, fontWeight: 700, color: open ? Y : showCheck ? DONE : chrome.sub, flexShrink: 0,
            width: 18, height: 18, borderRadius: 5, display: "flex", alignItems: "center", justifyContent: "center",
            border: `1px solid ${open ? Y : showCheck ? DONE : chrome.line}`,
          }}>{showCheck ? "✓" : step}</span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate" style={{ fontSize: 13, fontWeight: 700, color: chrome.text }}>{label}</span>
          {subtitle && <span className="block truncate" style={{ fontSize: 10.5, color: chrome.sub }}>{subtitle}</span>}
        </span>
      </button>
      {open && (
        <div className="p-3" style={{ borderTop: `1px solid ${chrome.line}` }}>
          {children}
        </div>
      )}
    </div>
  );
}

export function Field({ label, children }) {
  return (
    <div className="mb-3">
      <div className="mb-1.5" style={{ ...fonts.ui, fontSize: 11, fontWeight: 600, color: chrome.sub, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</div>
      {children}
    </div>
  );
}

export function ColorInput({ value, onChange }) {
  return (
    <label className="relative cursor-pointer inline-block flex-shrink-0" style={{ width: 34, height: 34, borderRadius: 8, background: value, border: `2px solid ${chrome.line}` }}>
      <input type="color" value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
    </label>
  );
}

export function Slider({ label, value, min, max, onChange, suffix }) {
  return (
    <div className="mb-3">
      <div className="flex justify-between mb-1" style={{ ...fonts.ui, fontSize: 11, color: chrome.sub }}>
        <span style={{ fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase" }}>{label}</span>
        <span style={{ ...fonts.mono, color: chrome.text }}>{value}{suffix}</span>
      </div>
      <input type="range" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full" style={{ accentColor: Y }} />
    </div>
  );
}
