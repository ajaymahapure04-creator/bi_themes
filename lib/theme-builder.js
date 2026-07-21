import { shade, isDarkColor, liftForDark, dropForLight } from "./utils";
import { DOMAINS, PRESETS, VISUALS, PAGE_SIZES } from "./data";

// Builds a valid Power BI report theme (import via View → Themes → Browse).
export function buildPowerBITheme(t) {
  return {
    name: t.name || "BI Theme Studio Export",
    dataColors: t.dataColors,
    good: t.good, neutral: t.neutral, bad: t.bad,
    maximum: t.dataColors[0], center: t.neutral, minimum: t.bad,
    background: t.background, foreground: t.foreground, tableAccent: t.tableAccent,
    textClasses: {
      callout: { fontSize: t.calloutSize, fontFace: t.fontFamily, color: t.foreground },
      title: { fontSize: t.titleSize, fontFace: t.fontFamily, color: t.foreground },
      header: { fontSize: t.titleSize, fontFace: t.fontFamily, color: t.foreground },
      label: { fontSize: t.labelSize, fontFace: t.fontFamily, color: t.secondaryForeground },
    },
    visualStyles: {
      "*": {
        "*": {
          background: [{ color: { solid: { color: t.background } }, transparency: 0 }],
          border: [{ show: true, color: { solid: { color: shade(t.background, -18) } }, radius: t.cardRadius }],
          visualHeader: [{ show: true }],
          title: [{ show: true, fontColor: { solid: { color: t.foreground } }, fontSize: t.titleSize, fontFamily: t.fontFamily, alignment: "left" }],
        },
      },
      page: {
        "*": {
          background: [{ color: { solid: { color: t.secondaryBackground } }, transparency: 0 }],
          outspace: [{ color: { solid: { color: t.secondaryBackground } } }],
        },
      },
    },
  };
}

// Derives the opposite-mode twin of a theme (light↔dark). Design edits always
// apply to the base theme; the twin follows automatically so the pair stays coherent.
export function deriveTwin(t) {
  const makeDark = !isDarkColor(t.background);
  if (makeDark) {
    return {
      ...t,
      name: (t.name || "Theme") + " (Dark)",
      background: "#1E2129",
      secondaryBackground: "#14161B",
      foreground: "#E8EAF0",
      secondaryForeground: "#9CA3AF",
      dataColors: t.dataColors.map(liftForDark),
      tableAccent: liftForDark(t.tableAccent),
      good: liftForDark(t.good),
      bad: liftForDark(t.bad),
      neutral: liftForDark(t.neutral),
    };
  }
  return {
    ...t,
    name: (t.name || "Theme") + " (Light)",
    background: "#FFFFFF",
    secondaryBackground: "#F5F6F8",
    foreground: "#1F2430",
    secondaryForeground: "#6B7280",
    dataColors: t.dataColors.map(dropForLight),
    tableAccent: dropForLight(t.tableAccent),
    good: dropForLight(t.good),
    bad: dropForLight(t.bad),
    neutral: dropForLight(t.neutral),
  };
}

// Computes exact pixel geometry on the Power BI canvas (default 1280×720 16:9).
// Reserves space top-to-bottom: page margin → header band (logo + title) →
// top slicer strip → KPI strip (if preset has one) → the visual grid.
// A left slicer rail reserves width instead. Every cell gets x/y/width/height
// that a developer can type straight into Power BI's Format → Position pane.
export function buildLayoutSpec(layout, domainKey) {
  const p = PRESETS[layout.preset];
  const page = PAGE_SIZES[layout.pageSize] || PAGE_SIZES["16:9"];
  const M = 16;  // page margin
  const G = 12;  // gutter between visuals
  const rows = Math.ceil(p.cells / p.cols);

  let y = M;
  let contentX = M;
  let contentW = page.w - 2 * M;

  const headerBand = layout.header?.show
    ? { x: M, y, width: contentW, height: layout.header.height, contains: "logo + dashboard title" }
    : null;
  if (headerBand) y += layout.header.height + G;

  // 81 matches Power BI Desktop's own default slicer height (see
  // lib/pbip/plan.js's SLICER_H) -- the reserved band has to match what the
  // individual slicer visuals actually are, or content below starts too high.
  const topSlicer = layout.slicerPos === "top"
    ? { x: contentX, y, width: contentW, height: 81 }
    : null;
  if (topSlicer) y += 81 + G;

  const leftSlicer = layout.slicerPos === "left"
    ? { x: contentX, y, width: 183, height: page.h - y - M }
    : null;
  if (leftSlicer) { contentX += 183 + G; contentW -= 183 + G; }

  let kpiStrip = null;
  if (p.strip) {
    const kw = Math.floor((contentW - 3 * G) / 4);
    kpiStrip = Array.from({ length: 4 }, (_, i) => ({
      kpiCard: i + 1, x: contentX + i * (kw + G), y, width: kw, height: 90,
    }));
    y += 90 + G;
  }

  const gridH = page.h - y - M;
  const cellW = Math.floor((contentW - (p.cols - 1) * G) / p.cols);
  const cellH = Math.floor((gridH - (rows - 1) * G) / rows);

  return {
    generator: "BI Theme Studio",
    domain: DOMAINS[domainKey].label,
    page: { size: page.label === "Fit width" ? "16:9" : page.label, width: page.w, height: page.h, margin: M, gutter: G },
    headerBand,
    slicers: { position: layout.slicerPos, topStrip: topSlicer, leftRail: leftSlicer },
    kpiStrip,
    grid: { preset: p.label, rows, columns: p.cols, cellWidth: cellW, cellHeight: cellH },
    cells: layout.cells.map((cell, i) => {
      const r = Math.floor(i / p.cols), c = i % p.cols;
      return {
        cell: i + 1, row: r + 1, column: c + 1, visual: VISUALS[cell.type]?.label || cell.type,
        x: contentX + c * (cellW + G), y: y + r * (cellH + G), width: cellW, height: cellH,
      };
    }),
  };
}
