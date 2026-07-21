import { buildPowerBITheme } from "../theme-builder";
import { BASE_THEME_NAME, BASE_THEME_JSON } from "./base-theme";

// Every schema version, structural shape, and visualType string below is
// matched to a real Power BI Desktop-authored .pbip (a saved reference report),
// not to the public schema docs. Earlier versions guessed these and Desktop
// silently rejected the whole report definition -- model loaded, but the page
// rendered blank and unthemed. The reference is the source of truth.

// visualContainer schema -- Desktop writes 2.10.0.
const VC_SCHEMA = "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.10.0/schema.json";

// this app's visual kinds -> Power BI's internal visualType strings, matched to
// the reference save (card is "cardVisual" with a "Data" well; column/bar are
// the plain *Chart names, not the clustered* variants).
const VISUAL_TYPE = {
  kpi: "cardVisual", column: "columnChart", bar: "barChart",
  line: "lineChart", area: "areaChart", donut: "donutChart", table: "tableEx", text: "textbox",
};
// Which query "well" each visual's primary measure(s) go in.
const MEASURE_WELL = { kpi: "Data", column: "Y", bar: "Y", line: "Y", area: "Y", donut: "Y", table: "Values" };

// 20-char lowercase hex id, matching the reference's page/visual folder names.
function hexId() {
  let s = "";
  for (let i = 0; i < 20; i++) s += Math.floor(Math.random() * 16).toString(16);
  return s;
}
function guid() {
  // crypto.randomUUID exists in the browser; keep a fallback for safety.
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

// A measure projection -- field.Measure wrapper, matched to the reference. Our
// synthetic/real measures are genuine model measures, so Measure (not the
// column-Aggregation wrapper Desktop writes for a dragged raw column) is right.
const measureField = (table, measure) => ({
  field: { Measure: { Expression: { SourceRef: { Entity: table } }, Property: measure } },
  queryRef: `${table}.${measure}`,
  nativeQueryRef: measure,
});
// A column projection -- field.Column wrapper + active: true (reference carries
// active on category/slicer columns).
const columnField = (table, column) => ({
  field: { Column: { Expression: { SourceRef: { Entity: table } }, Property: column } },
  queryRef: `${table}.${column}`,
  nativeQueryRef: column,
  active: true,
});

// Literal-value wrappers -- matched to a real Desktop save (see the "get a
// real reference" round in report.js's history): booleans are NOT bare JSON
// booleans here, they're string "true"/"false" wrapped the same as any other
// literal. Numbers get a type suffix ("D" for double/float).
const strLit = (s) => ({ expr: { Literal: { Value: `'${String(s).replace(/'/g, "''")}'` } } });
const boolLit = (b) => ({ expr: { Literal: { Value: b ? "true" : "false" } } });
const numLit = (n) => ({ expr: { Literal: { Value: `${n}D` } } });
const intLit = (n) => ({ expr: { Literal: { Value: `${n}L` } } });

function visualJson(v, name) {
  const position = { x: Math.round(v.geom.x), y: Math.round(v.geom.y), z: v.zOrder, width: Math.round(v.geom.width), height: Math.round(v.geom.height), tabOrder: v.zOrder };

  // Header/commentary text box -- objects.general.paragraphs shape matched to
  // the reference's textbox visual exactly.
  if (v.kind === "text") {
    return {
      "$schema": VC_SCHEMA,
      name, position,
      visual: {
        visualType: "textbox",
        objects: { general: [{ properties: { paragraphs: [{ textRuns: [{ value: v.body || v.title || "", textStyle: { fontWeight: "bold", fontSize: "20pt" } }] }] } }] },
        drillFilterOtherVisuals: true,
      },
    };
  }

  const queryState = {};
  const well = MEASURE_WELL[v.kind] || "Y";

  if (v.kind === "kpi") {
    queryState[well] = { projections: [measureField(v.measure.tableName, v.measure.measureName)] };
  } else if (["column", "bar", "donut"].includes(v.kind)) {
    queryState[well] = { projections: [measureField(v.measure.tableName, v.measure.measureName)] };
    if (v.categoryCol) queryState.Category = { projections: [columnField(v.categoryTable, v.categoryCol)] };
  } else if (["line", "area"].includes(v.kind)) {
    queryState[well] = { projections: [measureField(v.measure1.tableName, v.measure1.measureName), measureField(v.measure2.tableName, v.measure2.measureName)] };
    if (v.categoryCol) queryState.Category = { projections: [columnField(v.categoryTable, v.categoryCol)] };
  } else if (v.kind === "table") {
    queryState[well] = { projections: v.columns.map((c) => columnField(v.tableName, c)) };
  }

  // Title lives under visualContainerObjects (a sibling of "objects"), NOT
  // inside "objects" itself -- confirmed against a real Desktop save.
  //
  // Cards and tables have no natural "field by field" auto-title, so they
  // need an explicit text override. Charts do -- Desktop composes
  // "<Y-axis field> by <category field>" (or "<measure1> and <measure2> by
  // <category>" for two-measure line/area) on its own whenever "text" is
  // left unset, confirmed against the same reference: donut/line/column
  // visualContainerObjects.title there carries only fontSize, no text, and
  // still renders "Failure Root Causes by Segment" / "Actual and Target by
  // Period". Fighting that with an explicit override is what caused the
  // earlier "Updates by Region by Region" duplication -- plan.js's
  // measureLabelFor() already names bar/column measures so the
  // auto-composed result matches the app's own chart title.
  const explicitTitle = ["kpi", "table"].includes(v.kind);
  const autoTitle = ["column", "bar", "donut", "line", "area"].includes(v.kind);
  const titleText = v.title || v.label;
  // fontSize is a flat 10pt across every visual type in the reference
  // (cards, chart, table alike) -- not tied to the theme's own titleSize.
  const visualContainerObjects = ((explicitTitle && titleText) || autoTitle) ? {
    title: [{
      properties: {
        ...(explicitTitle && titleText ? { text: strLit(titleText) } : {}),
        fontSize: numLit(10),
      },
    }],
  } : undefined;

  // Cards: hide the redundant field-name caption under the big number (the
  // "Callout value" section's own label, separate from the container title
  // above) since the title now carries the name instead, and pin the
  // callout number's own font size to 18pt. Both shape/values matched to a
  // real Desktop save.
  const objects = v.kind === "kpi" ? {
    value: [
      { properties: { fontSize: numLit(18) }, selector: { id: "default" } },
      { properties: { show: boolLit(true) } },
    ],
    label: [{ properties: { show: boolLit(false) }, selector: { id: "default" } }],
  } : undefined;

  return {
    "$schema": VC_SCHEMA,
    name, position,
    visual: {
      visualType: VISUAL_TYPE[v.kind],
      query: { queryState },
      ...(objects ? { objects } : {}),
      ...(visualContainerObjects ? { visualContainerObjects } : {}),
      drillFilterOtherVisuals: true,
    },
  };
}

// Decorative rectangle sat behind a KPI card, shifted up a few pixels so a
// thin colored sliver peeks out above the card -- an accent-bar effect.
// Matched to a real Desktop save: a manually inserted "shape" visual
// ("howCreated": "InsertVisualButton"), same position/size as its card
// minus the y-offset, lower z so the card's own background covers the rest
// of it, filled via ThemeDataColor (not a literal hex) so it follows
// whichever custom theme is active rather than needing its own color logic.
const ACCENT_Y_OFFSET = 6;

// colorId is nullable -- the reference's first card's shape has no "fill"
// object at all (left at Desktop's own default), only the other three carry
// an explicit ThemeDataColor. Replicated exactly rather than guessing a
// color for that first one.
function accentShapeJson(cardGeom, name, zOrder, colorId) {
  return {
    "$schema": VC_SCHEMA,
    name,
    position: {
      x: Math.round(cardGeom.x), y: Math.round(cardGeom.y) - ACCENT_Y_OFFSET, z: zOrder,
      height: Math.round(cardGeom.height), width: Math.round(cardGeom.width), tabOrder: zOrder,
    },
    visual: {
      visualType: "shape",
      objects: {
        shape: [{ properties: { tileShape: strLit("rectangle"), roundEdge: intLit(4) } }],
        rotation: [{ properties: { shapeAngle: intLit(0) } }],
        outline: [{ properties: { show: boolLit(false) } }],
        ...(colorId != null ? {
          fill: [{
            properties: { fillColor: { solid: { color: { expr: { ThemeDataColor: { ColorId: colorId, Percent: 0 } } } } } },
            selector: { id: "default" },
          }],
        } : {}),
      },
      visualContainerObjects: {
        title: [{ properties: { show: boolLit(false) } }],
        visualHeader: [{ properties: { show: boolLit(false) } }],
        border: [{ properties: { show: boolLit(false) } }],
      },
      drillFilterOtherVisuals: true,
    },
    howCreated: "InsertVisualButton",
  };
}

function slicerVisualJson(s, name, zOrder) {
  return {
    "$schema": VC_SCHEMA,
    name,
    position: { x: Math.round(s.geom.x), y: Math.round(s.geom.y), z: zOrder, width: Math.round(s.geom.width), height: Math.round(s.geom.height), tabOrder: zOrder },
    visual: {
      visualType: "slicer",
      query: { queryState: { Values: { projections: [columnField(s.tableName, s.column)] } } },
      drillFilterOtherVisuals: true,
    },
  };
}

const PLATFORM_JSON = (name) => JSON.stringify({
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",
  metadata: { type: "Report", displayName: name },
  config: { version: "2.0", logicalId: guid() },
}, null, 2);

// Builds every file under <Name>.Report/. Structure, schema versions, and the
// themeCollection shape are all matched to a real Desktop-authored report --
// notably definition.pbir (version 4.0), report.json (report/3.3.0 with
// reportVersionAtImport as an object, and a base+custom themeCollection), and
// the shipped base theme -- so Desktop accepts the definition instead of
// falling back to a blank page. Positions come from buildLayoutSpec's pixel
// math (lib/theme-builder.js), the same geometry as the layout-spec.json sheet.
export function buildReportFiles(plan, theme, projectName) {
  const files = {};
  const root = `${projectName}.Report`;
  const themeName = ((theme.name || "Accelerator Theme").replace(/[^\w -]/g, "").trim() || "Accelerator Theme") + " " + Math.floor(Math.random() * 1e16);
  const themeFile = `${themeName}.json`;
  const pageName = hexId();

  files[`${root}/.platform`] = PLATFORM_JSON(plan.reportTitle || projectName);

  files[`${root}/definition.pbir`] = JSON.stringify({
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/2.0.0/schema.json",
    version: "4.0",
    datasetReference: { byPath: { path: `../${projectName}.SemanticModel` } },
  }, null, 2);

  // Custom theme = our exported Power BI theme; base theme = the built-in one
  // Desktop layers under it, shipped verbatim so report.json's baseTheme
  // reference resolves exactly like a real save.
  files[`${root}/StaticResources/RegisteredResources/${themeFile}`] = JSON.stringify(buildPowerBITheme({ ...theme, name: themeName }), null, 2);
  files[`${root}/StaticResources/SharedResources/BaseThemes/${BASE_THEME_NAME}.json`] = JSON.stringify(BASE_THEME_JSON, null, 2);

  files[`${root}/definition/version.json`] = JSON.stringify({
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json",
    version: "2.0.0",
  }, null, 2);

  files[`${root}/definition/report.json`] = JSON.stringify({
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/3.3.0/schema.json",
    themeCollection: {
      baseTheme: { name: BASE_THEME_NAME, reportVersionAtImport: { visual: "2.9.0", report: "3.3.0", page: "2.3.1" }, type: "SharedResources" },
      // name must match the theme file's own internal "name" property (set to
      // themeName below, no extension) -- themeFile (with ".json") is only
      // correct for the resource "path". Using themeFile here silently broke
      // custom-theme resolution: Desktop fell back to its default palette
      // instead of the brand colors, while the base theme (whose name/path
      // already matched) kept applying background/border/title styling.
      customTheme: { name: themeName, reportVersionAtImport: { visual: "2.10.0", report: "3.4.0", page: "2.3.1" }, type: "RegisteredResources" },
    },
    resourcePackages: [
      { name: "SharedResources", type: "SharedResources", items: [{ name: BASE_THEME_NAME, path: `BaseThemes/${BASE_THEME_NAME}.json`, type: "BaseTheme" }] },
      { name: "RegisteredResources", type: "RegisteredResources", items: [{ name: themeName, path: themeFile, type: "CustomTheme" }] },
    ],
    settings: {
      useStylableVisualContainerHeader: true,
      exportDataMode: "AllowSummarized",
      defaultDrillFilterOtherVisuals: true,
      useEnhancedTooltips: true,
    },
  }, null, 2);

  files[`${root}/definition/pages/pages.json`] = JSON.stringify({
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.1.0/schema.json",
    pageOrder: [pageName], activePageName: pageName,
  }, null, 2);

  files[`${root}/definition/pages/${pageName}/page.json`] = JSON.stringify({
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.1.0/schema.json",
    name: pageName, displayName: "Page 1", displayOption: "FitToPage",
    height: Math.round(plan.page.height), width: Math.round(plan.page.width),
  }, null, 2);

  // z / tabOrder: sequential from 0, matching how the reference orders visuals
  // (small ascending integers), rather than reusing cell indices which could be
  // negative (header) or large (KPI-strip offsets).
  let z = 0;
  const visualDir = `${root}/definition/pages/${pageName}/visuals`;

  if (plan.header) {
    const name = hexId();
    files[`${visualDir}/${name}/visual.json`] = JSON.stringify(visualJson({ kind: "text", geom: plan.header.geom, body: plan.header.text, zOrder: z++ }, name), null, 2);
  }
  // Exact ColorId sequence from the reference's 4 KPI-card shapes -- the
  // first card had no fill override at all (null), the rest were 3, 4, 5.
  const ACCENT_COLOR_IDS = [null, 3, 4, 5];
  let kpiIndex = 0;
  plan.visuals.forEach((v) => {
    if (v.kind === "kpi") {
      // Accent shape must be emitted (and z-ordered) before its card so the
      // card's own background sits on top, leaving only the top sliver visible.
      const shapeName = hexId();
      const colorId = ACCENT_COLOR_IDS[kpiIndex++ % ACCENT_COLOR_IDS.length];
      files[`${visualDir}/${shapeName}/visual.json`] = JSON.stringify(accentShapeJson(v.geom, shapeName, z++, colorId), null, 2);
    }
    const name = hexId();
    files[`${visualDir}/${name}/visual.json`] = JSON.stringify(visualJson({ ...v, zOrder: z++ }, name), null, 2);
  });
  plan.slicers.forEach((s) => {
    const name = hexId();
    files[`${visualDir}/${name}/visual.json`] = JSON.stringify(slicerVisualJson(s, name, z++), null, 2);
  });

  return files;
}
