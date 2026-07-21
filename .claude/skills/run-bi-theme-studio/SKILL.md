---
name: run-bi-theme-studio
description: Build, run, and drive the Accelerator Dashboard (bi-theme-studio) Next.js web app. Use when asked to start the app, run the dev server, take a screenshot of its UI, or interact with the running app (industry/company picker, layout builder, insights view).
---

Accelerator Dashboard is a Next.js 15 / React 19 web app (no separate
backend). Start the dev server, then drive it with the Playwright REPL
at `.claude/skills/run-bi-theme-studio/driver.mjs` — `chromium-cli` is
not installed in this environment, so this driver stands in for it
with the same command vocabulary (`nav`, `wait-for`, `click`,
`screenshot`, `console --errors`, ...).

All paths below are relative to the repo root.

## Prerequisites

Verified on Windows with Node v24.18.0 / npm 11.16.0. No OS packages
needed — Playwright's bundled Chromium runs headless without xvfb on
this platform.

## Setup

```bash
npm install                        # installs playwright (devDependency) too
npx playwright install chromium    # only needed once; no-op if already cached
```

`ANTHROPIC_API_KEY` (optional) — only required for the "AI Assist" tab
and the "Regenerate insights" button. Everything else, including the
flow below, works without it. To enable it: `cp .env.local.example
.env.local` and paste a key.

## Build

No build step for local/agent use — run in dev mode (see below).
`npm run build` exists for production but wasn't exercised here.

## Run (agent path)

Start the dev server on an explicit port — don't rely on the default.
Next.js silently bumps to the next free port instead of erroring on
`EADDRINUSE`, so an unpinned port makes the driver's target URL a
guess. Pin one that's unlikely to collide with a human's own `npm run
dev` (commonly left running on 3000):

```bash
npm run dev -- -p 3100 &
timeout 30 bash -c 'until curl -sf http://localhost:3100 >/dev/null; do sleep 1; done'
```

Drive it by piping commands to the REPL over stdin — no tmux needed
(tmux isn't available in this environment; a heredoc works everywhere
and is the primary path here):

```bash
node .claude/skills/run-bi-theme-studio/driver.mjs <<'EOF'
nav http://localhost:3100
wait-for text=Accelerator Dashboard
screenshot 01-initial
click text=Automotive / OTA
wait-for text=OTA Success Rate
screenshot 02-automotive
console --errors
quit
EOF
```

Screenshots land in `.claude/skills/run-bi-theme-studio/screenshots/`
(override: `SCREENSHOT_DIR`; the directory is gitignored).

For iterative use on a platform with tmux, wrap the same launch line
and `send-keys` one command at a time instead of piping a heredoc:

```bash
tmux new-session -d -s app -x 200 -y 50
tmux send-keys -t app 'node .claude/skills/run-bi-theme-studio/driver.mjs' Enter
timeout 20 bash -c 'until tmux capture-pane -t app -p | grep -q "driver>"; do sleep 0.2; done'
tmux send-keys -t app 'nav http://localhost:3100' Enter
tmux send-keys -t app 'wait-for text=Accelerator Dashboard' Enter
tmux send-keys -t app 'screenshot landing' Enter
tmux capture-pane -t app -p
```

Stop the dev server with `kill %1` (or find/kill the port-3100
listener) once done — Windows npm doesn't forward Ctrl-C/SIGTERM
reliably to the child `next` process either way, so verify the port is
actually free before relaunching.

### Driver commands

| command | what it does |
|---|---|
| `nav <url>` | launch Chromium (first call) and navigate |
| `wait-for text=<text>` / `wait-for <css-sel>` | wait up to 15s for text or a selector |
| `click text=<text>` / `click <css-sel>` | click first match |
| `fill <css-sel> <value>` | fill an input |
| `type <text>` / `press <key>` | keyboard input |
| `screenshot [name]` | → `screenshots/<name>.png` |
| `screenshot-element <css-sel> [name]` | crop to one element |
| `text [css-sel]` | print innerText (body if no selector) |
| `eval <js>` | evaluate in page, print JSON result |
| `console --errors` | print buffered `console.error`/`pageerror` messages since `nav` |
| `quit` | close the browser, exit |

## Run (human path)

```bash
npm run dev   # → http://localhost:3000 (or next free port — check the log line)
```

Ctrl-C to stop.

## Gotchas

- **Piped/heredoc stdin fires every `line` event immediately**, without
  waiting for the async command handler to finish — a naive REPL loop
  races `quit` ahead of `nav`'s browser launch and exits having done
  nothing. `driver.mjs` chains commands through a promise queue to
  force sequential execution; don't remove that queue.
- **Readline closes mid-queue on EOF**, before all queued commands have
  run, which then throws `ERR_USE_AFTER_CLOSE` on the next
  `rl.prompt()` call. Every `rl.prompt()` in the driver is guarded with
  `!rl.closed` for this reason.
- **Port 3000 is often already occupied** by a leftover dev server from
  a previous session (same app, still healthy) — check before treating
  that as an error, and use `-p <port>` to get a predictable URL either
  way rather than parsing Next's auto-bumped port from its log output.
- **`next lint` isn't actually configured** — no ESLint config exists
  yet, and running it drops into an interactive "How would you like to
  configure ESLint?" prompt that hangs in a non-TTY shell. Don't rely
  on `npm run lint` as a smoke check.
- **Domain switch changes KPI labels entirely**, not just values — e.g.
  Workforce/RMG shows "Bench Strength", Automotive/OTA shows "OTA
  Success Rate". `wait-for` on a KPI label from the wrong domain times
  out; check `lib/data.js` for the right one per `DOMAINS` key.
- **Clicking the industry toggle (e.g. "Automotive / OTA") reliably
  triggers a React hydration-mismatch warning** in dev mode — Next's
  own dev overlay shows a "1 Issue" badge, and `console --errors`
  reports it. It's an inline-style diff (`background`/`color`/`border`
  shorthand vs. longhand) on the industry-search `<input>` and the
  `type="color"` swatch inputs, present on a clean checkout with no
  changes applied — **pre-existing, non-fatal, app stays fully
  interactive** (confirmed via screenshot). Don't mistake it for a
  regression introduced by whatever you're testing; only treat new
  *additional* console errors as suspect.

## Troubleshooting

- **`Cannot find module 'playwright'`**: run `npm install` (it's a
  devDependency, not global).
- **Chromium launch hangs/fails**: run `npx playwright install
  chromium` — the browser binary is a separate download from the npm
  package.
- **`curl: (7) Failed to connect` while polling**: dev server not up
  yet, or crashed — check the `npm run dev` output for a compile error
  before assuming the poll loop is broken.
- **`Error: listen EADDRINUSE: address already in use :::3100`** (or
  whatever port) even right after stopping a prior run: stopping the
  background task doesn't reliably kill the child `next` process on
  Windows — the port stays held. Find and kill it directly:
  `netstat -ano | grep ":3100" | grep LISTENING` → `taskkill //PID
  <pid> //F`. Then relaunch.
