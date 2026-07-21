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
        objects: { general: [{ properties: { paragraphs: [{ textRuns: [{ value: v.body || v.title || "" }] }] } }] },
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

  // Minimal, matching the reference charts: visualType + query + the
  // drillFilterOtherVisuals flag. No objects block -- chart titles fall back to
  // the auto-generated field name, which is what the reference does too.
  return {
    "$schema": VC_SCHEMA,
    name, position,
    visual: { visualType: VISUAL_TYPE[v.kind], query: { queryState }, drillFilterOtherVisuals: true },
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

  files[`${root}/.platform`] = PLATFORM_JSON(projectName);

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
      customTheme: { name: themeFile, reportVersionAtImport: { visual: "2.10.0", report: "3.4.0", page: "2.3.1" }, type: "RegisteredResources" },
    },
    resourcePackages: [
      { name: "SharedResources", type: "SharedResources", items: [{ name: BASE_THEME_NAME, path: `BaseThemes/${BASE_THEME_NAME}.json`, type: "BaseTheme" }] },
      { name: "RegisteredResources", type: "RegisteredResources", items: [{ name: themeFile, path: themeFile, type: "CustomTheme" }] },
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
  plan.visuals.forEach((v) => {
    const name = hexId();
    files[`${visualDir}/${name}/visual.json`] = JSON.stringify(visualJson({ ...v, zOrder: z++ }, name), null, 2);
  });
  plan.slicers.forEach((s) => {
    const name = hexId();
    files[`${visualDir}/${name}/visual.json`] = JSON.stringify(slicerVisualJson(s, name, z++), null, 2);
  });

  return files;
}
