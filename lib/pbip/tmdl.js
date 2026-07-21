import { q } from "./plan";

// Effective model type for a column: a numeric column whose every value is a
// whole number becomes "int64" (a Power BI "Whole number"); a numeric column
// with any fractional value stays "double" (Decimal); everything else is text.
// This is what makes value columns land as real numbers instead of text --
// they need a concrete numeric type in BOTH the TMDL column and the M source.
function effectiveType(col, rows) {
  if (col.type !== "number") return "string";
  let sawValue = false;
  for (const r of rows) {
    const v = r[col.name];
    if (v === null || v === undefined || v === "") continue;
    if (!Number.isFinite(Number(v))) continue;
    sawValue = true;
    if (!Number.isInteger(Number(v))) return "double";
  }
  return sawValue ? "int64" : "double";
}

// Type value used in Table.TransformColumnTypes -- the exact forms a real
// Desktop-authored M query uses (Int64.Type for whole numbers, type number for
// decimals, type text for strings).
const TRANSFORM_TYPE = { int64: "Int64.Type", double: "type number", string: "type text" };
const TMDL_TYPE = { int64: "int64", double: "double", string: "string" };

// M-query literal table partition -- every table in the plan (real or
// synthetic) is small (CSV-import caps at 2,000 rows; synthetic tables are a
// handful of rows), so embedding the data as a literal M table keeps the
// whole model self-contained in the .pbip project -- no external data
// source to reconnect, no refresh credentials needed. A plain #table followed
// by Table.TransformColumnTypes (the exact pattern Desktop itself writes) types
// each column, so numeric values arrive as real numbers instead of the untyped
// "any" that Power BI would otherwise treat as text.
function mLiteralTable(columns, rows, effTypes) {
  const colList = columns.map((c) => `"${c.name.replace(/"/g, '""')}"`).join(", ");
  const rowLits = rows.map((r) => {
    const vals = columns.map((c) => {
      const v = r[c.name];
      if (effTypes[c.name] !== "string") return Number.isFinite(Number(v)) ? String(Number(v)) : "null";
      return `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
    });
    return `{${vals.join(", ")}}`;
  });
  const xforms = columns.map((c) => `{"${c.name.replace(/"/g, '""')}", ${TRANSFORM_TYPE[effTypes[c.name]]}}`).join(", ");
  return [
    `let`,
    `    Source = #table({${colList}}, {${rowLits.join(",\n        ")}}),`,
    `    #"Changed Type" = Table.TransformColumnTypes(Source, {${xforms}})`,
    `in`,
    `    #"Changed Type"`,
  ].join("\n");
}

function columnTmdl(col, effType) {
  // int64/double value columns get summarizeBy: sum (they're measures-in-waiting
  // and should aggregate), a "0" formatString for whole numbers, and the
  // concrete numeric dataType. Text columns stay summarizeBy: none.
  const lines = [`\tcolumn ${q(col.name)}`, `\t\tdataType: ${TMDL_TYPE[effType]}`];
  if (effType === "int64") lines.push(`\t\tformatString: 0`);
  lines.push(`\t\tsummarizeBy: ${effType === "string" ? "none" : "sum"}`);
  // Declaration syntax -- bare/quoted name, never bracketed (brackets are
  // only for referencing a column inside an expression, e.g. 'Table'[Column]).
  lines.push(`\t\tsourceColumn: ${col.name.replace(/'/g, "''")}\n`);
  return lines.join("\n");
}

function tableTmdl(table) {
  const effTypes = Object.fromEntries(table.columns.map((c) => [c.name, effectiveType(c, table.rows)]));
  const columns = table.columns.map((c) => columnTmdl(c, effTypes[c.name])).join("\n");
  const measures = (table.measures || [])
    .map((m) => `\tmeasure ${q(m.measureName)} = ${m.dax}\n`)
    .join("\n");
  const partition = mLiteralTable(table.columns, table.rows, effTypes);
  return [
    `table ${q(table.name)}`,
    measures,
    columns,
    `\tpartition ${q(table.name)} = m`,
    `\t\tmode: import`,
    `\t\tsource =`,
    `\t\t\t\t${partition.split("\n").join("\n\t\t\t\t")}`,
    "",
  ].join("\n");
}

const MODEL_TMDL = `model Model
\tculture: en-US
\tdefaultPowerBIDataSourceVersion: powerBI_V3
\tsourceQueryCulture: en-US

annotation PBI_QueryOrder = []
`;

function guid() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

const PLATFORM_JSON = (name) => JSON.stringify({
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/gitIntegration/platformProperties/2.0.0/schema.json",
  metadata: { type: "SemanticModel", displayName: name },
  config: { version: "2.0", logicalId: guid() },
}, null, 2);

// definition.pbism -- schema + version + empty settings, matched to a real
// Desktop save. (An earlier settings.autoRecovery entry failed schema
// validation on open; the real file's settings object is simply empty.)
const PBISM_JSON = JSON.stringify({
  "$schema": "https://developer.microsoft.com/json-schemas/fabric/item/semanticModel/definitionProperties/1.0.0/schema.json",
  version: "4.2",
  settings: {},
}, null, 2);

// Builds every file under <Name>.SemanticModel/ -- a small, fixed set of
// project boilerplate (.platform, definition.pbism, model-level .tmdl) plus
// one .tmdl per table in the plan and one relationships.tmdl if any real
// relationships were pulled in.
export function buildSemanticModelFiles(plan, projectName) {
  const files = {};
  const root = `${projectName}.SemanticModel`;

  files[`${root}/.platform`] = PLATFORM_JSON(projectName);
  files[`${root}/definition.pbism`] = PBISM_JSON;
  files[`${root}/definition/database.tmdl`] = `database Database\n\tcompatibilityLevel: 1567\n`;
  files[`${root}/definition/model.tmdl`] = MODEL_TMDL;
  files[`${root}/definition/culture.tmdl`] = `cultureInfo en-US\n\n\tlinguisticMetadata =\n\t\t\t{\n\t\t\t\t"Version": "1.0.0",\n\t\t\t\t"Language": "en-US"\n\t\t\t}\n\t\tcontentType: json\n`;

  const measuresByTable = new Map();
  plan.measures.forEach((m) => {
    if (!measuresByTable.has(m.tableName)) measuresByTable.set(m.tableName, []);
    measuresByTable.get(m.tableName).push(m);
  });

  for (const table of plan.tables.values()) {
    const fileSafe = table.name.replace(/[\\/:*?"<>|]/g, "_");
    files[`${root}/definition/tables/${fileSafe}.tmdl`] = tableTmdl({ ...table, measures: measuresByTable.get(table.name) });
  }

  if (plan.relationships.length) {
    files[`${root}/definition/relationships.tmdl`] = plan.relationships
      .map((r, i) => [
        `relationship r${i + 1}`,
        `\tfromColumn: ${q(r.fromTable)}${bq(r.fromColumn)}`,
        `\ttoColumn: ${q(r.toTable)}${bq(r.toColumn)}`,
        "",
      ].join("\n"))
      .join("\n");
  }

  return files;
}
