// Server-side AI insight-caption generation for the Summary page. Takes each
// visual's already-resolved data (numbers/labels the user is already looking
// at -- never raw dataset rows) and asks Claude for one short, grounded
// caption per visual. Mirrors generate-theme/route.js's structure (mock mode,
// validation, structured JSON-schema output, retry-once, error codes) so the
// two AI routes stay consistent.

const MAX_VISUALS = 20;
const VISUAL_TYPES = new Set(["column", "bar", "line", "area", "donut", "table"]);

function buildMockResponse(visuals) {
  return {
    captions: visuals.map((v) => ({
      id: v.id,
      caption: `Mock insight for "${v.title}" (AI_MOCK_MODE is on — no Anthropic call was made).`,
    })),
  };
}

function buildUserMessage(domain, visuals) {
  const visualsBlock = visuals
    .map((v) => `- id ${v.id} (${v.type}): "${v.title}"\n  data: ${JSON.stringify(v.data)}`)
    .join("\n");

  return `You are a data analyst writing short captions under Power BI dashboard visuals for a "${domain || "business"}" report.

For each visual below (identified by id, type, title, and its already-computed data), write exactly one caption: two short sentences, roughly 130-170 characters total.
- Sentence 1 must state a specific standout number or comparison taken directly from that visual's data -- never invent a number that isn't present.
- Sentence 2 gives one grounded interpretation or implication -- not generic filler like "this chart shows trends."

Match this tone and length (real approved examples):
"EU leads update volume (640K) with CN close behind (520K) — LATAM and MEA remain under-served, together under 10% of total rollout volume."
"ICAS1 Hotfix has the weakest success rate (95.4%) despite a mid-sized fleet — worth a closer look before the next wave ships."

Visuals:
${visualsBlock}

Respond with ONLY the JSON object described by the schema -- no markdown, no commentary.`;
}

function buildResponseSchema() {
  return {
    type: "object",
    properties: {
      captions: {
        type: "array",
        items: {
          type: "object",
          properties: { id: { type: "integer" }, caption: { type: "string" } },
          required: ["id", "caption"],
          additionalProperties: false,
        },
      },
    },
    required: ["captions"],
    additionalProperties: false,
  };
}

async function callAnthropic({ apiKey, model, userMessage, schema, maxTokens }) {
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
      messages: [{ role: "user", content: userMessage }],
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

function validateVisual(v) {
  return !!v && typeof v === "object"
    && Number.isInteger(v.id)
    && typeof v.type === "string" && VISUAL_TYPES.has(v.type)
    && typeof v.title === "string"
    && v.data && typeof v.data === "object";
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

  const { domain, visuals } = body || {};
  if (!Array.isArray(visuals) || !visuals.length) {
    return Response.json({ error: "At least one visual is required." }, { status: 400 });
  }
  if (visuals.length > MAX_VISUALS) {
    return Response.json({ error: `Too many visuals (max ${MAX_VISUALS}).` }, { status: 400 });
  }
  if (!visuals.every(validateVisual)) {
    return Response.json({ error: "Each visual needs an integer id, a supported type, a title, and resolved data." }, { status: 400 });
  }

  if (mockMode) {
    return Response.json(buildMockResponse(visuals));
  }

  const model = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
  const userMessage = buildUserMessage(domain, visuals);
  const schema = buildResponseSchema();
  const maxTokens = Math.min(3000, 300 + 150 * visuals.length);

  try {
    let result = await callAnthropic({ apiKey, model, userMessage, schema, maxTokens });

    // Fallback (not repair): on truncation or an unparseable response, retry
    // once with a stricter length instruction rather than re-sending the
    // broken JSON back for Claude to fix.
    if (!result.ok && !result.status) {
      const stricterMessage = `${userMessage}\n\nKeep every caption under 120 characters, no exceptions.`;
      result = await callAnthropic({ apiKey, model, userMessage: stricterMessage, schema, maxTokens });
    }

    if (!result.ok) {
      if (result.status) {
        console.error("Anthropic API error:", result.status, result.errText);
        return Response.json({ error: `AI service error (${result.status}). Check your API key and model name.` }, { status: 502 });
      }
      console.error("generate-insights: response truncated or unparseable", result);
      return Response.json({ error: "AI returned an unparseable response. Try again." }, { status: 502 });
    }

    return Response.json(result.parsed);
  } catch (err) {
    console.error("generate-insights route error:", err);
    return Response.json({ error: "Unexpected server error." }, { status: 500 });
  }
}
