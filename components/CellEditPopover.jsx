"use client";
import { VISUALS } from "../lib/data";
import { Y, chrome } from "../lib/chrome";
import { CellBindingEditor } from "./panels/CorePanels";
import { ColorInput } from "./ui";
import Popover from "./Popover";

// Fast in-place editor for a single cell -- the same visual-type picker + data
// source form as the Layout tab's sidebar editor, opened from the cell itself
// so binding a chart doesn't require scrolling the left panel. Positioning,
// dragging, and the portal/backdrop/Escape shell all live in Popover.jsx,
// shared with FilterConfigPopover.
export default function CellEditPopover({ anchorRect, cellType, binding, dataset, lockType, onSetVisual, onSetBinding, onClose, headerBg, onSetHeaderBg }) {
  return (
    <Popover anchorRect={anchorRect} title="Edit cell" onClose={onClose}>
      {!lockType && (
        <div className="mb-3">
          <div className="mb-1.5" style={{ fontSize: 11, fontWeight: 600, color: chrome.sub, letterSpacing: 0.4, textTransform: "uppercase" }}>Visual type</div>
          <div className="flex flex-wrap gap-1.5">
            {Object.entries(VISUALS).map(([k, v]) => (
              <button key={k} onClick={() => onSetVisual(k)} className="px-2.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5"
                style={{
                  background: cellType === k ? Y : chrome.bg,
                  color: cellType === k ? "#17181D" : chrome.text,
                  border: `1px solid ${cellType === k ? Y : chrome.line}`,
                }}>
                <span>{v.icon}</span>{v.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <CellBindingEditor cell={{ type: cellType, binding }} dataset={dataset} onSetBinding={onSetBinding} />

      {onSetHeaderBg && (
        <div className="mt-3 pt-3" style={{ borderTop: `1px solid ${chrome.line}` }}>
          <div className="mb-1.5" style={{ fontSize: 11, fontWeight: 600, color: chrome.sub, letterSpacing: 0.4, textTransform: "uppercase" }}>Title background</div>
          <div className="flex items-center gap-2">
            <ColorInput value={headerBg || "#FFFFFF"} onChange={onSetHeaderBg} />
            <button onClick={() => onSetHeaderBg(null)} style={{ fontSize: 11, color: chrome.sub }}>Default</button>
          </div>
        </div>
      )}
    </Popover>
  );
}
