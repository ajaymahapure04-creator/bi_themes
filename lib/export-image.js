// Shared "rasterize a DOM node to PNG/PDF" helpers -- used by Studio.jsx (the
// live report preview) and Summary.jsx (the insights canvas). Both export the
// same kind of thing (a themed report canvas), so the capture logic lives
// here once instead of being copied.
import { toPng, toJpeg } from "html-to-image";
import jsPDF from "jspdf";

// A state update that hides UI chrome before capture (e.g. per-cell edit
// affordances) doesn't reach the DOM until React re-renders and the browser
// paints. Two animation frames is the reliable way to wait for that repaint
// before rasterizing.
export const waitForRepaint = () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));

// PDF export uses JPEG rather than PNG: jsPDF re-encodes PNG input as a raw/
// lightly-compressed bitmap stream instead of keeping PNG's own compression,
// which bloated a ~200KB PNG into an 8MB PDF. JPEG's stream gets embedded by
// jsPDF nearly as-is, so the PDF stays close to the JPEG's own size.
export async function captureNodeImage(node, format, { backgroundColor } = {}) {
  if (!node) throw new Error("Nothing to export yet.");
  const opts = { pixelRatio: 2, cacheBust: true, backgroundColor };
  return format === "jpeg" ? toJpeg(node, { ...opts, quality: 0.95 }) : toPng(node, opts);
}

export async function exportNodeAsPng(node, filename, { backgroundColor } = {}) {
  await waitForRepaint();
  const dataUrl = await captureNodeImage(node, "png", { backgroundColor });
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export async function exportNodeAsPdf(node, filename, { backgroundColor } = {}) {
  await waitForRepaint();
  const w = node.offsetWidth, h = node.offsetHeight;
  const dataUrl = await captureNodeImage(node, "jpeg", { backgroundColor });
  const pdf = new jsPDF({ orientation: w >= h ? "landscape" : "portrait", unit: "px", format: [w, h] });
  pdf.addImage(dataUrl, "JPEG", 0, 0, w, h);
  pdf.save(filename);
}
