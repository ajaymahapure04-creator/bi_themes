import { buildPowerBITheme } from "../theme-builder";

// Maps this app's visual kinds onto Power BI's internal visualType strings.
const VISUAL_TYPE = {
  kpi: "card", column: "clusteredColumnChart", bar: "clusteredBarChart",
  line: "lineChart", area: "areaChart", donut: "donutChart", table: "tableEx", text: "textbox",
};

// nativeQueryRef is present on every projection in real Desktop-authored
// PBIR output (verified against github.com/RuiRomano/pbip-demo) -- without
// it a visual's query silently fails to resolve and the visual never
// renders on the canvas, even though it's valid per the public schema.
const measureField = (table, measure) => ({
  field: { Measure: { Expression: { SourceRef: { Entity: table } }, Property: measure } },
  queryRef: `${table}.${measure}`,
  nativeQueryRef: measure,
  active: true,
});
const columnField = (table, column) => ({
  field: { Column: { Expression: { SourceRef: { Entity: table } }, Property: column } },
  queryRef: `${table}.${column}`,
  nativeQueryRef: column,
  active: true,
});

// Title belongs under visualContainerObjects (container chrome -- same
// place background/border/padding live), not the visual-specific "objects"
// -- confirmed against a real Desktop-authored visual.json.
function titleObjects(text) {
  if (!text) return undefined;
  return { title: [{ properties: { text: { expr: { Literal: { Value: `'${String(text).replace(/'/g, "\\'")}'` } } } } }] };
}

function visualJson(v, name) {
  const position = { x: Math.round(v.geom.x), y: Math.round(v.geom.y), z: v.cellIndex, width: Math.round(v.geom.width), height: Math.round(v.geom.height), tabOrder: v.cellIndex };

  if (v.kind === "text") {
    return {
      "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.0.0/schema.json",
      name, position,
      visual: {
        visualType: "textbox",
        objects: { general: [{ properties: { paragraphs: [{ textRuns: [{ value: v.body || v.title || "" }] }] } }] },
        drillFilterOtherVisuals: true,
      },
    };
  }

  const queryState = {};
  const visualContainerObjects = {};

  if (v.kind === "kpi") {
    queryState.Values = { projections: [measureField(v.measure.tableName, v.measure.measureName)] };
    Object.assign(visualContainerObjects, titleObjects(v.label));
  } else if (["column", "bar", "donut"].includes(v.kind)) {
    queryState.Y = { projections: [measureField(v.measure.tableName, v.measure.measureName)] };
    if (v.categoryCol) queryState.Category = { projections: [columnField(v.categoryTable, v.categoryCol)] };
    Object.assign(visualContainerObjects, titleObjects(v.title));
  } else if (["line", "area"].includes(v.kind)) {
    queryState.Y = { projections: [measureField(v.measure1.tableName, v.measure1.measureName), measureField(v.measure2.tableName, v.measure2.measureName)] };
    if (v.categoryCol) queryState.Category = { projections: [columnField(v.categoryTable, v.categoryCol)] };
    Object.assign(visualContainerObjects, titleObjects(v.title));
  } else if (v.kind === "table") {
    queryState.Values = { projections: v.columns.map((c) => columnField(v.tableName, c)) };
    Object.assign(visualContainerObjects, titleObjects(v.title));
  }

  // drillFilterOtherVisuals is present on every real Desktop-authored visual
  // we've inspected -- included defensively even though the public schema
  // doesn't mark it required.
  const visual = { visualType: VISUAL_TYPE[v.kind], query: { queryState }, drillFilterOtherVisuals: true };
  if (Object.keys(visualContainerObjects).length) visual.visualContainerObjects = visualContainerObjects;

  return {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.0.0/schema.json",
    name, position,
    visual,
  };
}

function slicerVisualJson(s, name, i) {
  return {
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/visualContainer/2.0.0/schema.json",
    name,
    position: { x: Math.round(s.geom.x), y: Math.round(s.geom.y), z: 2000 + i, width: Math.round(s.geom.width), height: Math.round(s.geom.height), tabOrder: 2000 + i },
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
  config: { version: "2.0", logicalId: "00000000-0000-0000-0000-000000000001" },
}, null, 2);

// Builds every file under <Name>.Report/ -- report.json (theme reference),
// pages.json, one page.json, one visual.json per plan.visuals entry (plus a
// header textbox and any bound slicers), and the custom theme resource the
// report.json points at. Positions come straight from buildLayoutSpec's
// pixel math (lib/theme-builder.js), the same geometry already used for the
// human-readable layout-spec.json build sheet -- one source of truth for
// "where does this cell go" whether the target is a person or Power BI.
export function buildReportFiles(plan, theme, projectName) {
  const files = {};
  const root = `${projectName}.Report`;
  const themeName = (theme.name || "Accelerator Theme").replace(/[^\w -]/g, "").trim() || "Accelerator Theme";

  files[`${root}/.platform`] = PLATFORM_JSON(projectName);
  files[`${root}/definition.pbir`] = JSON.stringify({
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definitionProperties/1.0.0/schema.json",
    version: "1.0",
    datasetReference: { byPath: { path: `../${projectName}.SemanticModel` } },
  }, null, 2);

  files[`${root}/StaticResources/RegisteredResources/${themeName}.json`] = JSON.stringify(buildPowerBITheme(theme), null, 2);

  // Present in every real Desktop-saved PBIP report (verified against two
  // independent reference projects) but not documented as "required" by the
  // public schema docs -- without it Desktop silently falls back to a blank
  // default page instead of loading definition/pages at all.
  files[`${root}/definition/version.json`] = JSON.stringify({
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/versionMetadata/1.0.0/schema.json",
    version: "2.0.0",
  }, null, 2);

  // Shape verified against a real Desktop-generated report.json (Power BI
  // rejects "CustomTheme" as a resourcePackage.type -- only "RegisteredResources"
  // and friends are valid there; the item nested inside is what carries
  // "CustomTheme"). reportVersionAtImport is a required schema field but its
  // value isn't otherwise validated by Desktop.
  files[`${root}/definition/report.json`] = JSON.stringify({
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/report/2.1.0/schema.json",
    themeCollection: { customTheme: { name: `${themeName}.json`, reportVersionAtImport: "5.64", type: "RegisteredResources" } },
    // Documented as "present even when empty" in real report.json usage.
    filterConfig: { filters: [] },
    resourcePackages: [{ name: "RegisteredResources", type: "RegisteredResources", items: [{ name: `${themeName}.json`, path: `${themeName}.json`, type: "CustomTheme" }] }],
  }, null, 2);

  files[`${root}/definition/pages/pages.json`] = JSON.stringify({
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/pagesMetadata/1.0.0/schema.json",
    pageOrder: ["ReportPage1"], activePageName: "ReportPage1",
  }, null, 2);

  files[`${root}/definition/pages/ReportPage1/page.json`] = JSON.stringify({
    "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/report/definition/page/2.0.0/schema.json",
    name: "ReportPage1", displayName: "Report", displayOption: "FitToPage",
    height: Math.round(plan.page.height), width: Math.round(plan.page.width),
  }, null, 2);

  let vi = 0;
  const visualDir = `${root}/definition/pages/ReportPage1/visuals`;

  if (plan.header) {
    const name = `v${++vi}`;
    files[`${visualDir}/${name}/visual.json`] = JSON.stringify(visualJson({ kind: "text", geom: plan.header.geom, body: plan.header.text, cellIndex: -1 }, name), null, 2);
  }
  plan.visuals.forEach((v) => {
    const name = `v${++vi}`;
    files[`${visualDir}/${name}/visual.json`] = JSON.stringify(visualJson(v, name), null, 2);
  });
  plan.slicers.forEach((s, i) => {
    const name = `v${++vi}`;
    files[`${visualDir}/${name}/visual.json`] = JSON.stringify(slicerVisualJson(s, name, i), null, 2);
  });

  return files;
}
