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
├── page.jsx                      # entry — renders the Studio
├── layout.jsx                    # fonts (next/font) + metadata
├── globals.css                   # Tailwind + chrome styling
└── api/generate-theme/route.js   # server-side Claude call (key stays here)
components/
├── Studio.jsx                    # state, orchestration, auto-save
├── ReportPreview.jsx             # live Power BI-style canvas
├── CellVisual.jsx                # per-cell visual renderer + slicers
├── charts.jsx                    # SVG chart primitives
├── ui.jsx                        # shared chrome primitives
└── panels/                       # the 5 workflow panels
lib/
├── data.js                       # domains, visuals, presets — add a domain here
├── theme-builder.js              # Power BI theme.json + layout spec builders
├── utils.js                      # color math, logo palette extraction
└── chrome.js                     # studio design tokens
```

## Security notes

- The Anthropic key is read from `process.env` inside the API route only. The browser calls `/api/generate-theme`, never Anthropic directly.
- `.env.local` is git-ignored. Never commit it.
- The route validates prompt length (max 1000 chars). For a public deployment, add rate limiting (e.g. Vercel KV or upstash) before sharing the URL widely.

## Roadmap ideas

- Data-aware AI: paste your dataset's column names → AI maps fields to visuals
- Cell spanning (wide charts) and drag-to-reorder
- Page background PNG generation to match the theme
- `.pbit` starter file generation from the layout spec
- Team theme gallery with shareable links
