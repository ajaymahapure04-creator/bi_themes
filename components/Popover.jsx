"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { chrome, fonts } from "../lib/chrome";

const PANEL_WIDTH = 320;
const MARGIN = 12;
const EST_HEIGHT = 340; // rough heuristic for open-up vs open-down at initial placement only

// Initial placement only -- clamped so the box always starts fully on-screen,
// regardless of which branch fires. Deliberately never uses a CSS `bottom`
// anchor: an earlier version did for the "open upward" case, and since this
// popover's content grows as the user fills in fields (title, data labels,
// number format...), a bottom-anchored box grows *upward* off-screen with no
// way to scroll back to what disappeared above the viewport. Anchoring only
// via `top`, clamped to leave at least 100px of the box visible near the
// bottom, means any overflow is at the bottom instead -- reachable through
// the box's own internal scroll (see below) or by dragging it (see Popover).
export function popoverPosition(anchorRect) {
  let left = anchorRect.left;
  if (left + PANEL_WIDTH + MARGIN > window.innerWidth) left = anchorRect.right - PANEL_WIDTH;
  left = Math.max(MARGIN, Math.min(left, window.innerWidth - PANEL_WIDTH - MARGIN));

  const openDown = anchorRect.bottom + MARGIN + EST_HEIGHT <= window.innerHeight;
  let top = openDown ? anchorRect.bottom + 8 : anchorRect.top - EST_HEIGHT - 8;
  top = Math.max(MARGIN, Math.min(top, window.innerHeight - MARGIN - 100));
  return { left, top };
}

// Shared floating-panel shell for CellEditPopover and FilterConfigPopover --
// portal (escapes any ancestor's overflow:hidden), backdrop, Escape-to-close,
// and drag-to-reposition by the header (grab the "Edit ..." title bar and
// move the box anywhere on screen). Never closes on scroll -- an earlier
// version did, which made it disappear while scrolling the popover's own
// content.
export default function Popover({ anchorRect, title, onClose, children }) {
  const [pos, setPos] = useState(() => popoverPosition(anchorRect));
  const dragRef = useRef(null); // { startX, startY, startLeft, startTop } while a drag is in progress

  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    const onMove = (e) => {
      if (!dragRef.current) return;
      const { startX, startY, startLeft, startTop } = dragRef.current;
      setPos({
        left: Math.max(0, Math.min(startLeft + (e.clientX - startX), window.innerWidth - 60)),
        top: Math.max(0, Math.min(startTop + (e.clientY - startY), window.innerHeight - 40)),
      });
    };
    const onUp = () => { dragRef.current = null; };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = (e) => {
    dragRef.current = { startX: e.clientX, startY: e.clientY, startLeft: pos.left, startTop: pos.top };
    e.preventDefault();
  };

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: "fixed", inset: 0, zIndex: 1000 }} />
      <div
        style={{
          position: "fixed", zIndex: 1001, width: PANEL_WIDTH, maxHeight: "70vh", overflowY: "auto",
          background: chrome.panel, border: `1px solid ${chrome.line}`, borderRadius: 10,
          boxShadow: "0 12px 32px rgba(0,0,0,0.45)", padding: 12, ...fonts.ui,
          left: pos.left, top: pos.top,
        }}
      >
        {/* Sticky so the drag handle stays reachable even after scrolling
            down through the popover's own content. */}
        <div
          onMouseDown={startDrag}
          className="flex items-center justify-between mb-2.5"
          style={{ cursor: "grab", position: "sticky", top: 0, background: chrome.panel, zIndex: 2, marginLeft: -12, marginRight: -12, marginTop: -12, padding: "12px 12px 0" }}
        >
          <span style={{ fontSize: 12, fontWeight: 700, color: chrome.text }}>⠿ {title}</span>
          <button onClick={onClose} aria-label="Close" style={{ fontSize: 13, color: chrome.sub, width: 22, height: 22, borderRadius: 6, border: `1px solid ${chrome.line}`, flexShrink: 0 }}>✕</button>
        </div>
        {children}
      </div>
    </>,
    document.body
  );
}
