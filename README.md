# ◪ BI Theme Studio

AI-assisted UI/UX design tool for Power BI developers. Pick a domain template, design your grid layout cell by cell, apply your brand, let AI generate theme + layout from plain English, and export a ready-to-import **Power BI theme.json** plus a **layout build sheet**.

Built with **Next.js 15 · React 19 · Tailwind CSS · Claude API**.

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
├── Studio.jsx                    # state, orchestration, auto-save; owns view mode (Insights <-> Edit Report) + AI-caption fetch
├── Summary.jsx                   # Insights page 1 — read-only AI insights grid, clickable KPIs
├── KpiDeepDive.jsx               # Insights page 2 — one KPI's detail view (hero stat, real filters, larger related visuals)
├── ReportPreview.jsx             # Edit Report mode — the actual editable Power BI-style canvas
├── CellVisual.jsx                # per-cell visual renderer, KPI card, + slicers
├── charts.jsx                    # SVG chart primitives
├── ui.jsx                        # shared chrome primitives
└── panels/                       # the 5 workflow panels
lib/
├── data.js                       # domains, visuals, presets — add a domain here
├── theme-builder.js              # Power BI theme.json + layout spec builders
├── useReportVisuals.js           # shared KPI/chart-cell derivation hook (Summary, KpiDeepDive, Studio's AI-caption fetch)
├── export-image.js               # shared PNG/PDF rasterization (Studio + Summary + KpiDeepDive)
├── utils.js                      # color math, logo palette extraction
└── chrome.js                     # studio design tokens
```

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
