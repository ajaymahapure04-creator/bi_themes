// REPL driver for the BI Theme Studio (Next.js web app).
// Mirrors chromium-cli's command vocabulary so it's a drop-in stand-in
// when chromium-cli isn't installed in this environment. Run under
// tmux: send-keys one command per line, capture-pane to read output.
import { chromium } from 'playwright';
import * as readline from 'node:readline';
import * as fs from 'node:fs';
import * as path from 'node:path';

const SHOT_DIR = process.env.SCREENSHOT_DIR || path.join(import.meta.dirname, 'screenshots');
fs.mkdirSync(SHOT_DIR, { recursive: true });

let browser = null;
let page = null;
let consoleErrors = [];

function resolveTarget(sel) {
  // "text=Foo" -> role/text lookup across common clickable elements.
  // Anything else is treated as a raw CSS selector.
  if (sel.startsWith('text=')) {
    const needle = sel.slice(5);
    return { kind: 'text', needle };
  }
  return { kind: 'css', needle: sel };
}

const COMMANDS = {
  async nav(url) {
    if (!browser) {
      browser = await chromium.launch({ args: ['--no-sandbox'] });
      page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      page.on('console', (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
      page.on('pageerror', (err) => consoleErrors.push(String(err)));
    }
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    console.log('nav ->', url);
  },

  async 'wait-for'(arg) {
    if (!page) return console.log('ERROR: nav first');
    const t = resolveTarget(arg);
    try {
      if (t.kind === 'text') await page.getByText(t.needle, { exact: false }).first().waitFor({ timeout: 15_000 });
      else await page.waitForSelector(t.needle, { timeout: 15_000 });
      console.log('found:', arg);
    } catch { console.log('TIMEOUT:', arg); }
  },

  async screenshot(name) {
    if (!page) return console.log('ERROR: nav first');
    const f = path.join(SHOT_DIR, (name || `ss-${Date.now()}`) + '.png');
    await page.screenshot({ path: f });
    console.log('screenshot:', f);
  },

  async 'screenshot-element'(rest) {
    if (!page) return console.log('ERROR: nav first');
    const [sel, name] = rest.split(/\s+(?=[^\s]+$)/);
    const f = path.join(SHOT_DIR, (name || `ss-el-${Date.now()}`) + '.png');
    await page.locator(sel).first().screenshot({ path: f });
    console.log('screenshot-element:', f);
  },

  async click(arg) {
    if (!page) return console.log('ERROR: nav first');
    const t = resolveTarget(arg);
    try {
      if (t.kind === 'text') await page.getByText(t.needle, { exact: false }).first().click({ timeout: 10_000 });
      else await page.locator(t.needle).first().click({ timeout: 10_000 });
      console.log('click', arg, '-> OK');
    } catch (e) { console.log('click', arg, '-> ERROR:', e.message.split('\n')[0]); }
  },

  async fill(rest) {
    if (!page) return console.log('ERROR: nav first');
    const [sel, ...valueParts] = rest.split(/\s+/);
    const value = valueParts.join(' ');
    try { await page.locator(sel).first().fill(value, { timeout: 10_000 }); console.log('fill', sel, '-> OK'); }
    catch (e) { console.log('fill', sel, '-> ERROR:', e.message.split('\n')[0]); }
  },

  async type(text) { if (page) await page.keyboard.type(text, { delay: 20 }); },
  async press(key) { if (page) await page.keyboard.press(key); },

  async text(sel) {
    if (!page) return console.log('ERROR: nav first');
    console.log(await page.evaluate(s => (s ? document.querySelector(s) : document.body)?.innerText ?? '(null)', sel || null));
  },

  async eval(expr) {
    if (!page) return console.log('ERROR: nav first');
    try { console.log(JSON.stringify(await page.evaluate(expr))); }
    catch (e) { console.log('ERROR:', e.message); }
  },

  console(flag) {
    if (flag === '--errors' || !flag) {
      console.log(consoleErrors.length ? consoleErrors.join('\n') : '(no console errors)');
    }
  },

  async quit() { if (browser) await browser.close().catch(() => {}); browser = null; page = null; },
  help() { console.log('commands:', Object.keys(COMMANDS).join(', ')); },
};

const stdin = process.stdin;
const rl = readline.createInterface({ input: stdin, output: process.stdout, prompt: 'driver> ' });

// A piped/heredoc stdin delivers every line to the 'line' event back-to-back,
// without waiting for the async handler to finish. Without this queue, `quit`
// (and everything else) races ahead of `nav`'s browser launch and the driver
// exits before any command actually ran. Chain each line after the last.
let queue = Promise.resolve();
let shouldExit = false;

rl.on('line', (line) => {
  queue = queue.then(async () => {
    const trimmed = line.trim();
    const spaceIdx = trimmed.indexOf(' ');
    const cmd = spaceIdx === -1 ? trimmed : trimmed.slice(0, spaceIdx);
    const rest = spaceIdx === -1 ? '' : trimmed.slice(spaceIdx + 1);
    if (!cmd) return !rl.closed && rl.prompt();
    const fn = COMMANDS[cmd];
    if (!fn) { console.log('unknown:', cmd, '- try: help'); return !rl.closed && rl.prompt(); }
    try { await fn(rest); } catch (e) { console.log('ERROR:', e.message); }
    if (cmd === 'quit') { shouldExit = true; rl.close(); return; }
    // Piped/heredoc stdin hits EOF (and closes the interface) long before
    // this queue drains, since readline doesn't wait for line handlers.
    // Guard every prompt() call or a later one throws ERR_USE_AFTER_CLOSE.
    if (!rl.closed) rl.prompt();
  });
});
rl.on('close', async () => {
  await queue;
  if (!shouldExit) await COMMANDS.quit();
  process.exit(0);
});

console.log('bi-theme-studio driver - "help" for commands, "nav <url>" to start');
rl.prompt();
