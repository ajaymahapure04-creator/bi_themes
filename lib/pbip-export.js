import { buildExportPlan } from "./pbip/plan";
import { buildSemanticModelFiles } from "./pbip/tmdl";
import { buildReportFiles } from "./pbip/report";

// Assembles a full PBIP (Power BI Project) folder -- <Name>.pbip pointer file
// + <Name>.Report/ + <Name>.SemanticModel/, each just plain JSON/TMDL text --
// and zips it for download. Power BI Desktop (Nov 2023+, "Preview features
// > Power BI Project (.pbip) save option" enabled) opens the unzipped
// <Name>.pbip file directly: no compiler, no server round-trip.
//
// This is a best-effort v1 built from the documented PBIP/TMDL schema shape.
// The TMDL (semantic model) side is the well-documented, stable part; the
// per-visual-type report JSON (visualType/queryState/objects) is the riskiest
// part to get exactly right and hasn't been opened against a real Power BI
// Desktop install to confirm it loads clean -- this environment doesn't have
// one. If Desktop reports an error opening it, that's expected for a first
// pass, not a sign the whole approach is wrong -- see README's PBIP export
// section for how to report back what broke.
export async function buildPbipProject({ theme, layout, domainKey, dataset, projectName }) {
  const name = (projectName || theme.name || "Accelerator Report").replace(/[\\/:*?"<>|]/g, "_").trim() || "Accelerator Report";

  const plan = buildExportPlan({ theme, layout, domainKey, dataset });
  const files = {
    [`${name}.pbip`]: JSON.stringify({
      "$schema": "https://developer.microsoft.com/json-schemas/fabric/pbip/pbipProperties/1.0.0/schema.json",
      version: "1.0",
      artifacts: [{ report: { path: `${name}.Report` } }],
      settings: { enableAutoRecovery: true },
    }, null, 2),
    ...buildSemanticModelFiles(plan, name),
    ...buildReportFiles(plan, theme, name),
  };

  return { name, files, plan };
}

// Bundles the file map into a downloadable .zip Blob. Dynamically imports
// jszip so it's only pulled into the client bundle when someone actually
// orders a Power BI project, not on every page load.
export async function zipPbipProject(files) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  for (const [path, content] of Object.entries(files)) zip.file(path, content);
  return zip.generateAsync({ type: "blob" });
}
