// Server-side AI theme + layout (+ optional data-binding) generation.
// The Anthropic API key lives ONLY here (process.env) — never in the browser.

const REPORT_FONTS = ["Segoe UI", "DIN", "Arial", "Verdana", "Calibri", "Tahoma"];
const AGGS = ["sum", "avg", "min", "max", "count", "countDistinct"];
const PRESETS = {
  kpicharts: { cells: 4, defaults: ["column", "line", "donut", "table"] },
  g2x2: { cells: 4, defaults: ["kpi", "column", "line", "donut"] },
  g2x4: { cells: 8, defaults: ["kpi", "kpi", "kpi", "kpi", "column", "line", "donut", "table"] },
  g3x3: { cells: 9, defaults: ["kpi", "kpi", "kpi", "column", "line", "donut", "bar", "table", "text"] },
};

function hasFactTable(dataset) {
  return !!dataset?.tables && Object.values(dataset.tables).some((t) => t.role === "fact");
}

// Dev-only stand-in for the real Anthropic call — lets you exercise the whole
// bindings/sanitization/UI path against your own uploaded data without a
// working API key. Opt-in only (AI_MOCK_MODE=1 in .env.local); the real path
// below is completely untouched when it's off.
function pickMockPreset(prompt) {
  const p = (prompt || "").toLowerCase();
  if (/kpi strip/.test(p)) return "kpicharts";
  if (/3x3|3×3|3 x 3|dense/.test(p)) return "g3x3";
  if (/2x4|2×4|2 x 4/.test(p)) return "g2x4";
  return "g2x2";
}

function buildMockBindings(cells, dataset) {
  const fact = Object.values(dataset?.tables || {}).find((t) => t.role === "fact");
  if (!fact) return cells.map(() => null);
  const numericCols = fact.columns.filter((c) => c.type === "number").map((c) => c.name);
  const textCols = fact.columns.filter((c) => c.type !== "number").map((c) => c.name);
  if (!numericCols.length) return cells.map(() => null);

  let n = 0;
  const nextCol = () => numericCols[n++ % numericCols.length];
  const groupBy = textCols.length ? { table: fact.id, column: textCols[0] } : null;

  return cells.map((type) => {
    if (type === "kpi") {
      const c = nextCol();
      return { label: `Total ${c}`, metric: { table: fact.id, column: c, agg: "sum" } };
    }
    if (type === "column" || type === "bar" || type === "donut") {
      return { metric: { table: fact.id, column: nextCol(), agg: "sum" }, groupBy };
    }
    if (type === "line" || type === "area") {
      const c1 = nextCol(), c2 = nextCol();
      return {
        groupBy,
        series: [
          { label: c1, metric: { table: fact.id, column: c1, agg: "sum" } },
          { label: c2, metric: { table: fact.id, column: c2, agg: "sum" } },
        ],
      };
    }
    if (type === "table") {
      return { mode: "raw", table: fact.id, columns: fact.columns.slice(0, 6).map((c) => c.name), limit: 8 };
    }
    return null; // text cells never bind
  });
}

function buildMockResponse({ prompt, currentColors, dataset, image }) {
  const preset = pickMockPreset(prompt);
  const cells = PRESETS[preset].defaults;
  const dark = /dark/i.test(prompt || "");
  const palette = Array.isArray(currentColors) && currentColors.length >= 4
    ? currentColors.slice(0, 8)
    : ["#2563EB", "#0EA5E9", "#8B5CF6", "#F59E0B", "#10B981", "#EF4444", "#64748B", "#EC4899"];
  while (palette.length < 8) palette.push(palette[palette.length % palette.length]);
  const useDataset = hasFactTable(dataset);

  return {
    name: "Mock AI Theme",
    dataColors: palette,
    background: dark ? "#1B1F2A" : "#FFFFFF",
    secondaryBackground: dark ? "#12151C" : "#F5F6F8",
    foreground: dark ? "#F5F6FA" : "#1F2430",
    secondaryForeground: dark ? "#9CA3AF" : "#6B7280",
    tableAccent: palette[0],
    good: "#10B981",
    bad: "#EF4444",
    neutral: "#F59E0B",
    fontFamily: "Segoe UI",
    calloutSize: 30,
    titleSize: 13,
    labelSize: 10,
    cardRadius: 8,
    layout: { preset, cells, slicerPos: /left/i.test(prompt || "") ? "left" : "top" },
    bindings: useDataset ? buildMockBindings(cells, dataset) : cells.map(() => null),
    kpiStripBindings: useDataset && preset === "kpicharts" ? buildMockBindings(["kpi", "kpi", "kpi", "kpi"], dataset) : [null, null, null, null],
    rationale: `(Mock AI response — AI_MOCK_MODE is on, no Anthropic call was made.) Picked "${preset}" from your prompt${useDataset ? " and bound the cells it could to your uploaded data" : ""}.${image ? " (A screenshot was attached but isn't analyzed in mock mode.)" : ""}`,
  };
}

// Table -> column schema as plain text for the prompt. Names only, never row
// data (token budget + privacy). Soft-capped at ~60 columns total since
// binding accuracy degrades as the enumeration gets long, not because Haiku's
// context window is remotely at risk.
function buildDatasetSchemaBlock(dataset) {
  const COLUMN_BUDGET = 60;
  const tables = Object.values(dataset.tables);
  const lines = [];
  let colCount = 0;
  let omitted = 0;
  for (const t of tables) {
    if (colCount >= COLUMN_BUDGET) { omitted++; continue; }
    const numeric = t.columns.filter((c) => c.type === "number").map((c) => c.name);
    const text = t.columns.filter((c) => c.type !== "number").map((c) => c.name);
    colCount += t.columns.length;
    lines.push(`- ${t.id} (role: ${t.role}, ${t.rowCount ?? t.rows.length} rows)`);
    if (numeric.length) lines.push(`  NUMERIC: ${numeric.join(", ")}`);
    if (text.length) lines.push(`  TEXT: ${text.join(", ")}`);
  }
  if (omitted > 0) lines.push(`  ...(${omitted} additional table(s) omitted for brevity)`);

  const rels = (dataset.relationships || []).map((r) => `- ${r.factTable}.${r.factColumn} -> ${r.dimTable}.${r.dimColumn}`);

  return `

UPLOADED DATASET (bind visuals to this when the designer's request calls for real data):
${lines.join("\n")}

RELATIONSHIPS (one join hop, fact -> dimension):
${rels.length ? rels.join("\n") : "(none defined)"}

Rules for using this dataset:
- Use table ids and column names EXACTLY as spelled above. Never invent one.
- A column belongs only to the table it's listed under -- never borrow a same-named column from a different table's list (e.g. a "campaign" column may exist on both a fact table and a dimension table; keep them separate).
- Only sum/avg/min/max a NUMERIC column. count/countDistinct work on any column.
- A binding's metric.table must be a fact table (role: fact).
- A binding's groupBy.table must be either that same fact table, or a dimension table joined to it via a relationship listed above.
`;
}

function bindingsPromptFields() {
  return `  "bindings": array, same length and order as "layout.cells" -- for each cell, null (use built-in demo data) or a binding object shaped for that cell's own type:
    kpi: {"label"?: string, "metric": {"table": fact table id, "column": string, "agg": "sum"|"avg"|"min"|"max"|"count"|"countDistinct"}}
    column/bar/donut: {"title"?: string, "metric": {same as above}, "groupBy": {"table": string, "column": string} or null, "topN"?: integer, "sort"?: {"by": "label"|"value", "dir": "asc"|"desc"}}
    line/area: {"title"?: string, "series": [exactly two of {"label": string, "metric": {same as above}}], "groupBy": {same as above} or null}
    table (raw): {"mode": "raw", "table": string, "columns": [string, ...], "limit"?: integer}
    table (grouped): {"mode": "grouped", "groupBy": {same as above} or null, "metrics": [{...metric...}, ...], "sort"?: {...}, "topN"?: integer}
    text: always null
    Only bind a cell when the request calls for real data and a sensible binding exists on the dataset above -- use null freely otherwise.
  "kpiStripBindings": array of exactly 4 entries, each null or a kpi-shaped binding as above. Only meaningful when "layout.preset" is "kpicharts" -- use 4 nulls for every other preset.
`;
}

function buildUserMessage({ prompt, domain, currentColors, schemaBlock, includeBindings, hasImage }) {
  const imageInstruction = hasImage ? `
An reference screenshot of another dashboard is attached. Use it as inspiration ONLY for color palette, light/dark mood, and rough visual arrangement (e.g. how many card-like areas, roughly where a table or chart sits). Every field you output must still come from the exact vocabulary specified below (the same 4 grid presets, the same 8 visual types) — if the screenshot shows something outside that vocabulary (a map, a gauge, a custom layout), approximate it onto the closest supported preset/visual instead of inventing a new one. Never use the screenshot as a source of data or real numbers -- only the uploaded dataset described below (if any) is a valid data source.
` : "";
  return `You are a senior data-visualization designer creating a Power BI report theme AND page layout.

Domain: ${domain || "General"}
Current data colors: ${Array.isArray(currentColors) ? currentColors.join(", ") : "none"}
Designer's request: "${prompt}"
${imageInstruction}${schemaBlock}
Design a professional, accessible theme and a fitting layout. Data colors must be distinguishable from each other and readable on the background. Respond with ONLY a raw JSON object, no markdown fences, no commentary, exactly this shape:
{
  "name": string, "dataColors": [8 hex strings],
  "background": hex, "secondaryBackground": hex (page canvas color, slightly different from background), "foreground": hex (high contrast on background), "secondaryForeground": hex (muted labels),
  "tableAccent": hex, "good": hex, "bad": hex, "neutral": hex,
  "fontFamily": one of ${JSON.stringify(REPORT_FONTS)},
  "calloutSize": number 24-40, "titleSize": number 11-16, "labelSize": number 8-12, "cardRadius": number 0-16,
  "layout": {"preset": one of ["kpicharts","g2x2","g2x4","g3x3"], "cells": array of visual types from ["kpi","column","bar","line","area","donut","table","text"] with exact length 4 for kpicharts, 4 for g2x2, 8 for g2x4, 9 for g3x3, "slicerPos": one of ["top","left","none"]},
${includeBindings ? bindingsPromptFields() : ""}  "rationale": one short sentence explaining theme and layout choices
}`;
}

// Structured Outputs schema (output_config.format). A "binding" is modeled as
// one flat, permissive object shape covering the union of fields across every
// binding kind (kpi / grouped-chart / line-area / table) rather than a
// discriminated union keyed off the cell's own type -- the API schema can't
// see which visual type a given array index is anyway, and the real per-type
// validation happens client-side in lib/binding-engine.js#sanitizeAiBinding,
// which only ever reads the fields relevant to the cell it's validating.
function buildResponseSchema(includeBindings) {
  const metric = {
    type: "object",
    properties: {
      table: { type: "string" },
      column: { type: "string" },
      agg: { enum: AGGS },
    },
    required: ["table", "column", "agg"],
    additionalProperties: false,
  };
  const groupBy = {
    type: ["object", "null"],
    properties: {
      table: { type: "string" },
      column: { type: "string" },
    },
    required: ["table", "column"],
    additionalProperties: false,
  };
  const binding = {
    type: ["object", "null"],
    properties: {
      title: { type: "string" },
      label: { type: "string" },
      metric: { $ref: "#/$defs/metric" },
      groupBy: { $ref: "#/$defs/groupBy" },
      topN: { type: "integer" },
      sort: {
        type: "object",
        properties: { by: { enum: ["label", "value"] }, dir: { enum: ["asc", "desc"] } },
        additionalProperties: false,
      },
      series: {
        type: "array",
        items: {
          type: "object",
          properties: { label: { type: "string" }, metric: { $ref: "#/$defs/metric" } },
          additionalProperties: false,
        },
      },
      mode: { enum: ["raw", "grouped"] },
      table: { type: "string" },
      columns: { type: "array", items: { type: "string" } },
      limit: { type: "integer" },
      metrics: { type: "array", items: { $ref: "#/$defs/metric" } },
    },
    additionalProperties: false,
  };

  const properties = {
    name: { type: "string" },
    dataColors: { type: "array", items: { type: "string" } },
    background: { type: "string" },
    secondaryBackground: { type: "string" },
    foreground: { type: "string" },
    secondaryForeground: { type: "string" },
    tableAccent: { type: "string" },
    good: { type: "string" },
    bad: { type: "string" },
    neutral: { type: "string" },
    fontFamily: { enum: REPORT_FONTS },
    calloutSize: { type: "integer" },
    titleSize: { type: "integer" },
    labelSize: { type: "integer" },
    cardRadius: { type: "integer" },
    layout: {
      type: "object",
      properties: {
        preset: { enum: ["kpicharts", "g2x2", "g2x4", "g3x3"] },
        cells: { type: "array", items: { enum: ["kpi", "column", "bar", "line", "area", "donut", "table", "text"] } },
        slicerPos: { enum: ["top", "left", "none"] },
      },
      required: ["preset", "cells", "slicerPos"],
      additionalProperties: false,
    },
    rationale: { type: "string" },
  };
  const required = ["name", "dataColors", "background", "secondaryBackground", "foreground", "secondaryForeground", "tableAccent", "good", "bad", "neutral", "fontFamily", "calloutSize", "titleSize", "labelSize", "cardRadius", "layout", "rationale"];

  if (includeBindings) {
    properties.bindings = { type: "array", items: { $ref: "#/$defs/binding" } };
    properties.kpiStripBindings = { type: "array", items: { $ref: "#/$defs/binding" } };
    required.push("bindings", "kpiStripBindings");
  }

  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
    $defs: { metric, groupBy, binding },
  };
}

async function callAnthropic({ apiKey, model, userMessage, schema, maxTokens, image }) {
  // Vision content-block array only when an image is attached -- the plain
  // string path (the common case) is untouched, so nothing about today's
  // text-only behavior changes.
  const content = image
    ? [{ type: "image", source: { type: "base64", media_type: image.mediaType, data: image.data } }, { type: "text", text: userMessage }]
    : userMessage;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content }],
      output_config: { format: { type: "json_schema", schema } },
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    return { ok: false, status: res.status, errText };
  }

  const data = await res.json();
  if (data.stop_reason === "max_tokens") {
    return { ok: false, truncated: true };
  }

  const text = (data.content || []).map((i) => i.text || "").join("\n");
  const clean = text.replace(/```json|```/g, "").trim();
  try {
    return { ok: true, parsed: JSON.parse(clean) };
  } catch {
    return { ok: false, parseFailed: true };
  }
}

export async function POST(req) {
  const mockMode = process.env.AI_MOCK_MODE === "1" || process.env.AI_MOCK_MODE === "true";

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey && !mockMode) {
    return Response.json({ error: "Server missing ANTHROPIC_API_KEY. Add it to .env.local (see .env.local.example)." }, { status: 500 });
  }

  let body;
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: "Invalid request body." }, { status: 400 });
  }

  const { prompt: rawPrompt, domain, currentColors, dataset, image } = body || {};
  // A screenshot alone is a valid request ("the image says it all") -- only
  // require prompt text when no image is attached.
  const validImage = image && typeof image.mediaType === "string" && image.mediaType.startsWith("image/") && typeof image.data === "string" ? image : null;
  const promptProvided = typeof rawPrompt === "string" && rawPrompt.trim().length > 0;
  if (!promptProvided && !validImage) {
    return Response.json({ error: "A prompt or an attached screenshot is required." }, { status: 400 });
  }
  if (promptProvided && rawPrompt.length > 1000) {
    return Response.json({ error: "Prompt is required (max 1000 characters)." }, { status: 400 });
  }
  const prompt = promptProvided ? rawPrompt : "Design a theme and layout inspired by the attached screenshot.";

  if (mockMode) {
    return Response.json(buildMockResponse({ prompt, currentColors, dataset, image: validImage }));
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";

  const useDataset = hasFactTable(dataset);
  const schemaBlock = useDataset ? buildDatasetSchemaBlock(dataset) : "";
  const userMessage = buildUserMessage({ prompt, domain, currentColors, schemaBlock, includeBindings: useDataset, hasImage: !!validImage });
  const schema = buildResponseSchema(useDataset);

  try {
    let result = await callAnthropic({ apiKey, model, userMessage, schema, maxTokens: useDataset ? 2500 : 1200, image: validImage });

    // Fallback (not repair): on truncation or an unparseable response, retry
    // once with the dataset schema, bindings ask, and image all stripped
    // entirely -- i.e. fall back to exactly the known-good theme+layout-only
    // text prompt. Never send the broken JSON back for Claude to fix.
    if (!result.ok && !result.status && (useDataset || validImage)) {
      const fallbackMessage = buildUserMessage({ prompt, domain, currentColors, schemaBlock: "", includeBindings: false });
      result = await callAnthropic({ apiKey, model, userMessage: fallbackMessage, schema: buildResponseSchema(false), maxTokens: 1200 });
    }

    if (!result.ok) {
      if (result.status) {
        console.error("Anthropic API error:", result.status, result.errText);
        return Response.json({ error: `AI service error (${result.status}). Check your API key and model name.` }, { status: 502 });
      }
      console.error("generate-theme: response truncated or unparseable", result);
      return Response.json({ error: "AI returned an unparseable design. Try rephrasing your request." }, { status: 502 });
    }

    return Response.json(result.parsed);
  } catch (err) {
    console.error("generate-theme route error:", err);
    return Response.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
