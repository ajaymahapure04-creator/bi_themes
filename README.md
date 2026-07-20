# ◪ Accelerator Dashboard

A guided, client-facing path to a themed Power BI report: **Brand & Identity → Data → Layout → Validate & Order**. Pick an industry and a company, decide whether the report runs on starter demo data or the client's own import, lay out the grid cell by cell, check it in a live report preview, then order a ready-to-assemble **Power BI theme.json + layout build sheet** package. An optional AI Assist drawer can design the theme and layout from a plain-English description at any point in the flow.

Built with **Next.js 15 · React 19 · Tailwind CSS · Claude API**.

## The guided flow

1. **Brand & Identity** — pick an industry, then a company (colors applied from a 540-brand reference list) or set colors manually; upload a logo; pick a report font from a safe, widely-installed list (a client's real brand font is deliberately *not* auto-applied — see "Design decisions" below).
2. **Data** — use the industry's starter demo data (zero setup), or quick-import the client's own CSV tables; a link to the full Data Model page handles multi-table relationships.
3. **Layout** — grid preset, slicer position, page size, and per-cell visual type + data binding (demo data or the imported dataset).
4. **Validate & Order** — a pre-flight checklist (data colors set, at least one real visual, no stale bindings) gates the Order button; ordering runs a short pipeline and hands back the downloadable package once it's ready.

The live report preview (Insights and Edit Report modes) is always visible alongside every step, so "validate" means literally looking at the real report, not reading a JSON diff.

## Features

- **5 domain templates** — Workforce/RMG, Automotive/OTA, Finance, Sales, Supply Chain — each with realistic dummy data, slicer fields, and a starter palette
- **Layout builder** — 4 grid presets (2×2, 2×4, 3×3, KPI strip + 2×2), tap any cell to assign one of 8 visual types (KPI card, column, bar, line, area, donut, table, text box), slicer position toggle (top / left / none)
- **Brand step** — logo upload with automatic brand-color extraction, 8 editable data colors, text/semantic colors, report font, size sliders
- **AI Assist** — describe the report in plain English; Claude designs the full theme *and* layout with a one-line rationale
- **Live preview** — a faithful Power BI-style report canvas that re-renders on every change; preview cells are tappable
- **Theme pair (light + dark)** — design one theme, the dark/light twin is auto-derived with re-tuned colors; ☀/☾ preview toggle and dual export, plus the bookmark-method guide for a dark-mode toggle in Power BI
- **16:9 canvas aware** — preview locks to the real Power BI page proportions (16:9 / 4:3 / fit-width), with a configurable header band (logo + title, adjustable height)
- **Exports** — light + dark Power BI `theme.json` pair (View → Themes → Browse) and a `layout-spec.json` build sheet with exact x/y/width/height pixel coordinates for the header band, slicers, KPI strip and every cell (type straight into Power BI's Position pane; the input for future .pbit generation)
- **Share as PNG/PDF** — download whichever preview page is active as a themed, full-resolution image or PDF
- **Insights mode** — a 2-page, read-only view of your report (Prev/Next to flip): **Summary** (every chart/table cell gets a short AI-written "AI Summary" caption, one batched Claude call per "⟲ Regenerate insights" click) and **KPI Deep Dive** (click any KPI to drill into it — a bigger hero stat, the real Filters bar, and the same related visuals rendered larger with fuller captions). A separate **Edit Report** mode holds the actual editable Power BI-style canvas (Layout tab cell picking/binding, "Tap any cell to edit") — switching modes never resets your work, since all pages stay mounted underneath
- **Auto-save** — the whole project persists in the browser between sessions

## Getting started

```bash
# 1. Install dependencies
npm install

# 2. Configure your API key
cp .env.local.example .env.local
#    → open .env.local and paste your Anthropic API key

# 3. Run locally
npm run dev
#    → http://localhost:3000
```

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (for AI tab) | Your Anthropic API key. Server-side only — never exposed to the browser. |
| `ANTHROPIC_MODEL` | No | Defaults to `claude-haiku-4-5` (fast + cheap, ideal for this task). |

Everything except the AI tab works without a key.

## Deploy

### Vercel (recommended)
1. Push this folder to a GitHub repo
2. [vercel.com](https://vercel.com) → **Add New Project** → import the repo (Next.js is auto-detected)
3. Project → **Settings → Environment Variables** → add `ANTHROPIC_API_KEY`
4. Deploy — every future `git push` redeploys automatically

### Render
1. New → **Web Service** → connect the repo
2. Build command: `npm install && npm run build` · Start command: `npm start`
3. Add `ANTHROPIC_API_KEY` under **Environment**

## Architecture

```
app/
├── page.jsx                        # entry — renders the Studio
├── layout.jsx                      # fonts (next/font) + metadata
├── globals.css                     # Tailwind + chrome styling
└── api/
    ├── generate-theme/route.js     # server-side Claude call: theme + layout (key stays here)
    └── generate-insights/route.js  # server-side Claude call: Summary page captions
components/
├── Studio.jsx                    # state, orchestration, auto-save; owns the guided wizard (stepper, validation, Order pipeline) + view mode (Insights <-> Edit Report) + AI-caption fetch
├── Summary.jsx                   # Insights page 1 — read-only AI insights grid, clickable KPIs
├── KpiDeepDive.jsx               # Insights page 2 — one KPI's detail view (hero stat, real filters, larger related visuals)
├── ReportPreview.jsx             # Edit Report mode — the actual editable Power BI-style canvas
├── CellVisual.jsx                # per-cell visual renderer, KPI card, + slicers
├── charts.jsx                    # SVG chart primitives
├── ui.jsx                        # shared chrome primitives (Stepper, AccordionSection, ValidationRow, ...)
└── panels/                       # Brand & Identity / Data / Layout / Validate & Order (+ optional AI Assist) panels
lib/
├── data.js                       # domains, visuals, presets — add a domain here
├── theme-builder.js              # Power BI theme.json + layout spec builders
├── useReportVisuals.js           # shared KPI/chart-cell derivation hook (Summary, KpiDeepDive, Studio's AI-caption fetch)
├── export-image.js               # shared PNG/PDF rasterization (Studio + Summary + KpiDeepDive)
├── utils.js                      # color math, logo palette extraction
└── chrome.js                     # studio design tokens
```

## Design decisions

- **Brand sets colors, never font.** A client's real brand font is usually not installed on every machine that opens the report, and Power BI silently falls back when it's missing — so picking a company only ever applies chart-safe colors; font stays a manual pick from a short, reliably-installed list.
- **Data source is chosen before Layout, not after.** Starter demo data and an imported dataset are interchangeable inputs to the same binding system (`lib/binding-engine.js`) — deciding up front means every cell binding in Layout can point at real columns from the start instead of being rebuilt later.
- **Order is gated, not an always-on download.** The old Export tab produced files regardless of whether the design was in a sane state; Validate & Order now runs a pre-flight checklist (data colors present, at least one real visual, no bindings pointing at a removed table) and only unlocks the Order button once it passes.
- **Order is a real (if simulated) pipeline.** Today's package is the same theme + layout-spec output as before — native `.pbit`/`.pbix` generation (real DAX measures over real tables, no manual assembly in Power BI Desktop) is the next phase; see Roadmap.

## Security notes

- The Anthropic key is read from `process.env` inside the API routes only. The browser calls `/api/generate-theme` or `/api/generate-insights`, never Anthropic directly.
- `.env.local` is git-ignored. Never commit it.
- Both routes validate their input (prompt length, visual count/shape). For a public deployment, add rate limiting (e.g. Vercel KV or upstash) before sharing the URL widely.

## Roadmap ideas

- Data-aware AI: paste your dataset's column names → AI maps fields to visuals
- Cell spanning (wide charts) and drag-to-reorder
- Page background PNG generation to match the theme
- `.pbit` starter file generation from the layout spec
- Team theme gallery with shareable links
