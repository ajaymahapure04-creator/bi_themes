import { DOMAINS, PRESETS } from "./data";
import { resolveCellData } from "./binding-engine";
import { unwrapResolved } from "./useReportVisuals";
import { liftForDark, hexToRgb } from "./utils";

// Standalone "web dashboard" export -- turns the same theme/layout/dataset the
// PBIP export uses into a single self-contained HTML file (all CSS + JS inline,
// no network, works offline, embeddable anywhere). Deliberately NOT a Power BI
// look-alike: this is the premium-dark, glass-and-glow treatment HTML can do
// and Power BI can't -- count-up KPIs, draw-in charts, hover tooltips, an
// insights rail. Data is a snapshot baked in at export time.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const rgba = (hex, a) => { const [r, g, b] = hexToRgb(hex); return `rgba(${r},${g},${b},${a})`; };

// Leading numeric part of a display string ("€48.2M" -> {prefix:"€", num:48.2,
// suffix:"M"}), so the count-up animates only the number and keeps the framing.
function splitNumeric(str) {
  const m = String(str ?? "").match(/^(\D*?)(-?[\d,]+(?:\.\d+)?)(.*)$/);
  if (!m) return { prefix: "", num: null, suffix: String(str ?? "") };
  return { prefix: m[1], num: Number(m[2].replace(/,/g, "")), suffix: m[3], decimals: (m[2].split(".")[1] || "").length };
}

// ---------- data model (mirrors useReportVisuals, as plain functions) ----------
function buildModel({ theme, layout, domainKey, dataset }) {
  const d = DOMAINS[domainKey];
  const p = PRESETS[layout.preset];
  const activeFilters = (layout.filters || []).filter((f) => f.selected?.length).map((f) => ({ table: f.table, column: f.column, values: new Set(f.selected) }));

  let kpis;
  if (p?.strip) {
    kpis = d.kpis.map((k, i) => resolveCellData("kpi", layout.kpiStripBindings?.[i] ?? null, dataset, { kpis: [k] }, activeFilters).kpis[0]);
  } else {
    kpis = layout.cells.map((cell, i) => ({ cell, i })).filter(({ cell }) => cell.type === "kpi")
      .map(({ cell, i }) => { const r = resolveCellData("kpi", cell.binding, dataset, d, activeFilters); return r.kpis[i % r.kpis.length]; });
  }
  if (!kpis.length) kpis = d.kpis.slice(0, 4);

  const cells = layout.cells.map((cell, i) => ({ i, cell }))
    .filter(({ cell }) => cell.type !== "kpi" && cell.type !== "text")
    .map(({ i, cell }) => {
      const resolved = resolveCellData(cell.type, cell.binding, dataset, d, activeFilters);
      const data = unwrapResolved(cell.type, resolved, i);
      return { type: cell.type, title: data?.title || "", data };
    })
    .filter((c) => c.data);

  return { d, kpis, cells, title: theme.name || d.label, domainLabel: d.label, commentary: d.text };
}

// ---------- auto insights ----------
function buildInsights(model) {
  const out = [];
  const g = (k) => k.isGood ?? k.up;
  const up = model.kpis.filter((k) => g(k) === true), down = model.kpis.filter((k) => g(k) === false);
  if (up.length) out.push({ icon: "▲", tone: "good", text: `${up.length} of ${model.kpis.length} KPIs are trending up${up[0]?.label ? `, led by ${up[0].label}` : ""}.` });
  if (down.length) out.push({ icon: "▼", tone: "bad", text: `Watch ${down.map((k) => k.label).filter(Boolean).slice(0, 2).join(" and ") || "the flagged metric"} — moving the wrong way.` });
  for (const c of model.cells) {
    if ((c.type === "column" || c.type === "bar") && c.data.cats?.length) {
      const vals = c.data.vals || [], mi = vals.indexOf(Math.max(...vals));
      if (mi >= 0) out.push({ icon: "◆", tone: "accent", text: `${c.title || "Top category"}: ${c.data.cats[mi]} leads (${c.data.valueLabels?.[mi] ?? vals[mi]}).` });
    } else if (c.type === "donut" && c.data.segs?.length) {
      const top = [...c.data.segs].sort((a, b) => b.v - a.v)[0];
      out.push({ icon: "●", tone: "accent", text: `${c.title || "Mix"}: ${top.n} is the largest share at ${top.v}%.` });
    } else if ((c.type === "line" || c.type === "area") && c.data.s1?.length > 1) {
      const s = c.data.s1, chg = s[0] ? ((s[s.length - 1] - s[0]) / Math.abs(s[0])) * 100 : 0;
      out.push({ icon: chg >= 0 ? "↗" : "↘", tone: chg >= 0 ? "good" : "bad", text: `${c.title || "Trend"}: ${chg >= 0 ? "up" : "down"} ${Math.abs(chg).toFixed(0)}% across the period.` });
    }
    if (out.length >= 5) break;
  }
  if (model.commentary?.body) out.push({ icon: "✎", tone: "muted", text: model.commentary.body });
  return out.slice(0, 5);
}

// ---------- SVG chart generators (animation-ready strings) ----------
function columnSvg(data, colors) {
  const vals = data.vals || [], cats = data.cats || [];
  const max = (vals.length ? Math.max(...vals) : 0) * 1.15 || 1;
  const bw = 100 / (vals.length || 1);
  const grid = [0.25, 0.5, 0.75, 1].map((g) => `<line x1="0" x2="100" y1="${50 - g * 46}" y2="${50 - g * 46}" class="grid"/>`).join("");
  const bars = vals.map((v, i) => {
    const h = (v / max) * 46, x = i * bw + bw * 0.2, w = bw * 0.6;
    const lbl = data.valueLabels?.[i] ?? v;
    return `<g class="bar" style="animation-delay:${i * 70}ms"><rect x="${x}" y="${50 - h}" width="${w}" height="${h}" rx="1" fill="url(#barg)" data-tip="${esc(cats[i])}: ${esc(lbl)}"/></g>`;
  }).join("");
  const labels = cats.map((c, i) => `<text x="${i * bw + bw / 2}" y="57" text-anchor="middle" class="axis">${esc(c)}</text>`).join("");
  return svgWrap(`${grid}${bars}${labels}`, colors);
}
function hbarSvg(data, colors) {
  const vals = data.vals || [], cats = data.cats || [];
  const max = (vals.length ? Math.max(...vals) : 0) * 1.1 || 1;
  const rh = 58 / (vals.length || 1);
  const rows = vals.map((v, i) => {
    const w = (v / max) * 62, y = i * rh + rh * 0.22;
    const lbl = data.valueLabels?.[i] ?? v;
    return `<g class="bar" style="animation-delay:${i * 70}ms"><text x="0" y="${y + rh * 0.42}" class="axis">${esc(cats[i])}</text><rect x="26" y="${y}" width="${w}" height="${rh * 0.56}" rx="1" fill="url(#barg)" data-tip="${esc(cats[i])}: ${esc(lbl)}"/><text x="${28 + w}" y="${y + rh * 0.45}" class="val">${esc(lbl)}</text></g>`;
  }).join("");
  return svgWrap(rows, colors, true);
}
function lineSvg(data, colors, area) {
  const s1 = data.s1 || [], s2 = data.s2 || [], cats = data.cats || [];
  const all = [...s1, ...s2], max = (all.length ? Math.max(...all) : 1) * 1.1, min = (all.length ? Math.min(...all) : 0) * 0.9, span = (max - min) || 1;
  const xp = (i, n) => (n > 1 ? i / (n - 1) : 0.5) * 96 + 2;
  const pts = (arr) => arr.map((v, i) => `${xp(i, arr.length)},${50 - ((v - min) / span) * 44}`).join(" ");
  const grid = [0.25, 0.5, 0.75, 1].map((g) => `<line x1="2" x2="98" y1="${50 - g * 44}" y2="${50 - g * 44}" class="grid"/>`).join("");
  const areaPoly = area ? `<polygon points="${pts(s1)} 98,50 2,50" fill="url(#areag)"/>` : "";
  const l2 = s2.length ? `<polyline points="${pts(s2)}" class="l2" fill="none"/>` : "";
  const l1 = `<polyline points="${pts(s1)}" class="l1 draw" fill="none"/>`;
  const dots = s1.map((v, i) => `<circle cx="${xp(i, s1.length)}" cy="${50 - ((v - min) / span) * 44}" r="1.3" class="dot" data-tip="${esc(cats[i])}: ${esc(data.valueLabels?.[i] ?? v)}"/>`).join("");
  const labels = cats.map((c, i) => `<text x="${xp(i, cats.length)}" y="57" text-anchor="middle" class="axis">${esc(c)}</text>`).join("");
  return svgWrap(`${grid}${areaPoly}${l2}${l1}${dots}${labels}`, colors);
}
function svgWrap(inner, colors, noViewboxGrid) {
  const c0 = colors[0], c1 = colors[1] || colors[0];
  return `<svg viewBox="0 0 100 60" preserveAspectRatio="xMidYMid meet" class="chart-svg">
  <defs>
    <linearGradient id="barg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${c0}"/><stop offset="100%" stop-color="${rgba(c0, 0.55)}"/></linearGradient>
    <linearGradient id="areag" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="${rgba(c0, 0.35)}"/><stop offset="100%" stop-color="${rgba(c0, 0)}"/></linearGradient>
  </defs>
  <style>.grid{stroke:${rgba("#FFFFFF", 0.08)};stroke-width:.25}.axis{fill:${rgba("#FFFFFF", 0.45)};font-size:2.6px}.val{fill:${rgba("#FFFFFF", 0.8)};font-size:2.6px}.l1{stroke:${c0};stroke-width:1.4;stroke-linecap:round}.l2{stroke:${rgba(c1, 0.7)};stroke-width:.9;stroke-dasharray:2 1.4}.dot{fill:${c0}}</style>
  ${inner}
</svg>`;
}
function donutHtml(data, colors) {
  const segs = data.segs || [];
  const total = segs.reduce((a, s) => a + s.v, 0) || 1, R = 19, C = 2 * Math.PI * R;
  let acc = 0;
  const arcs = segs.map((s, i) => {
    const frac = s.v / total, dash = `${frac * C - 1.2} ${C - frac * C + 1.2}`, off = -acc * C + C * 0.25;
    acc += frac;
    return `<circle cx="30" cy="30" r="${R}" fill="none" stroke="${colors[i % colors.length]}" stroke-width="8.5" stroke-dasharray="${dash}" stroke-dashoffset="${off}" class="arc" data-tip="${esc(s.n)}: ${s.v}%"/>`;
  }).join("");
  const legend = segs.map((s, i) => `<div class="lg-row"><span class="lg-dot" style="background:${colors[i % colors.length]}"></span><span class="lg-name">${esc(s.n)}</span><span class="lg-val">${s.v}%</span></div>`).join("");
  return `<div class="donut-wrap"><svg viewBox="0 0 60 60" class="donut-svg"><g class="donut-rot">${arcs}</g><text x="30" y="32.5" text-anchor="middle" class="donut-center">${Math.round(total)}%</text></svg><div class="donut-legend">${legend}</div></div>`;
}
function tableHtml(data) {
  const cols = data.cols || [], rows = (data.rows || []).slice(0, 8);
  return `<table class="dtable"><thead><tr>${cols.map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((v) => `<td>${esc(v)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function cellBody(cell, colors) {
  switch (cell.type) {
    case "column": return columnSvg(cell.data, colors);
    case "bar": return hbarSvg(cell.data, colors);
    case "line": return lineSvg(cell.data, colors, false);
    case "area": return lineSvg(cell.data, colors, true);
    case "donut": return donutHtml(cell.data, colors);
    case "table": return tableHtml(cell.data);
    default: return "";
  }
}

// ---------- main ----------
export function buildHtmlDashboard({ theme, layout, domainKey, dataset, logo }) {
  const model = buildModel({ theme, layout, domainKey, dataset });
  const accent = liftForDark(theme.dataColors?.[0] || "#6E56CF");
  // Spread the brand palette so perceptually-similar hues (e.g. two greens that
  // sit adjacent in the raw order) don't land next to each other in the one
  // place many colors appear at once -- the donut. Interleaving even/odd indices
  // maximizes adjacent-hue distance; single-series charts only use colors[0], so
  // they're unaffected. Brand colors are kept, just reordered.
  const lifted = (theme.dataColors?.length ? theme.dataColors : ["#6E56CF"]).map(liftForDark);
  const spread = [...lifted.filter((_, i) => i % 2 === 0), ...lifted.filter((_, i) => i % 2 === 1)];
  const colors = spread;
  const good = liftForDark(theme.good || "#10B981"), bad = liftForDark(theme.bad || "#EF4444");
  const insights = buildInsights(model);

  const kpiCards = model.kpis.map((k) => {
    // KPI "good/bad" flag drives the delta color; the arrow direction follows
    // the delta's own sign (a positive delta points up regardless of whether up
    // is good). isGood is the current field name (was `up`); fall back for safety.
    const good = k.isGood ?? k.up;
    const rising = !String(k.delta ?? "").trim().startsWith("-");
    const { prefix, num, suffix, decimals } = splitNumeric(k.value);
    const val = num == null
      ? `<div class="kpi-val">${esc(k.value)}</div>`
      : `<div class="kpi-val"><span>${esc(prefix)}</span><span class="count" data-to="${num}" data-dec="${decimals || 0}">0</span><span>${esc(suffix)}</span></div>`;
    const delta = k.delta ? `<div class="kpi-delta ${good ? "up" : "down"}">${rising ? "▲" : "▼"} ${esc(k.delta)}</div>` : "";
    return `<div class="kpi glass"><div class="kpi-label">${esc(k.label)}</div>${val}${delta}</div>`;
  }).join("");

  const chartCards = model.cells.map((c, i) => {
    const wide = c.type === "line" || c.type === "area" || c.type === "table" || c.type === "column";
    return `<div class="card glass ${wide ? "wide" : ""}" style="animation-delay:${120 + i * 80}ms"><div class="card-title">${esc(c.title || c.type)}</div><div class="card-body">${cellBody(c, colors)}</div></div>`;
  }).join("");

  const insightRail = insights.map((n) => `<div class="ins ins-${n.tone}"><span class="ins-icon">${n.icon}</span><span>${esc(n.text)}</span></div>`).join("");

  const logoImg = logo ? `<img src="${esc(logo)}" alt="" class="logo"/>` : "";

  return `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>${esc(model.title)} — Dashboard</title>
<style>
:root{--accent:${accent};--accent-soft:${rgba(accent, 0.14)};--good:${good};--bad:${bad};--bg:#090A0F;--ink:#EAECF5;--mut:#8A92A6;--card:${rgba("#FFFFFF", 0.045)};--stroke:${rgba("#FFFFFF", 0.09)}}
*{box-sizing:border-box;margin:0;padding:0}
body{background:var(--bg);color:var(--ink);font-family:'Inter',system-ui,-apple-system,Segoe UI,sans-serif;line-height:1.5;min-height:100vh;overflow-x:hidden}
body::before{content:"";position:fixed;inset:0;background:radial-gradient(900px 500px at 15% -10%,var(--accent-soft),transparent 60%),radial-gradient(700px 500px at 100% 0%,${rgba(colors[2] || accent, 0.1)},transparent 55%);pointer-events:none;z-index:0}
.wrap{position:relative;z-index:1;max-width:1180px;margin:0 auto;padding:32px 24px 48px}
.glass{background:var(--card);border:1px solid var(--stroke);border-radius:18px;backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);box-shadow:0 1px 0 ${rgba("#FFFFFF", 0.06)} inset,0 20px 40px -24px rgba(0,0,0,.7)}
header{display:flex;align-items:center;gap:16px;margin-bottom:26px;opacity:0;animation:rise .7s ease forwards}
.logo{height:38px;max-width:120px;object-fit:contain;background:#fff;border-radius:8px;padding:4px}
.h-badge{width:44px;height:44px;border-radius:12px;background:linear-gradient(135deg,var(--accent),${rgba(accent, 0.5)});display:flex;align-items:center;justify-content:center;font-weight:800;font-size:20px;color:#0b0d12;box-shadow:0 6px 20px -6px var(--accent)}
h1{font-size:22px;font-weight:800;letter-spacing:-.02em}
.sub{color:var(--mut);font-size:12.5px}
.live{margin-left:auto;display:flex;align-items:center;gap:7px;font-size:11.5px;color:var(--mut);border:1px solid var(--stroke);padding:6px 11px;border-radius:999px}
.live .dot{width:7px;height:7px;border-radius:50%;background:var(--good);box-shadow:0 0 10px var(--good);animation:pulse 2s infinite}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:16px}
.kpi{padding:16px 18px;opacity:0;animation:rise .6s ease forwards}
.kpi-label{font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:var(--mut);margin-bottom:8px}
.kpi-val{font-size:30px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.kpi-delta{margin-top:6px;font-size:12px;font-weight:600;display:inline-flex;gap:4px;padding:2px 8px;border-radius:999px}
.kpi-delta.up{color:var(--good);background:${rgba(good, 0.12)}}
.kpi-delta.down{color:var(--bad);background:${rgba(bad, 0.12)}}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px;margin-bottom:16px}
.card{padding:16px 18px;opacity:0;animation:rise .6s ease forwards;min-height:220px;display:flex;flex-direction:column}
.card.wide{grid-column:span 2}
.card-title{font-size:13px;font-weight:700;margin-bottom:12px}
.card-body{flex:1;min-height:150px;display:flex}
.chart-svg{width:100%;height:100%;min-height:160px}
.bar{transform-origin:center bottom;animation:grow .7s cubic-bezier(.2,.8,.2,1) both}
.draw{stroke-dasharray:400;stroke-dashoffset:400;animation:draw 1.4s ease forwards .3s}
.donut-wrap{display:flex;align-items:center;gap:16px;width:100%}
.donut-svg{height:150px;width:auto;flex-shrink:0}
.donut-rot{transform-origin:30px 30px;animation:spin 1s ease both}
.arc{stroke-linecap:butt}
.donut-center{fill:var(--ink);font-size:8px;font-weight:800}
.donut-legend{display:flex;flex-direction:column;gap:7px;min-width:0;flex:1}
.lg-row{display:flex;align-items:center;gap:8px;font-size:12.5px}
.lg-dot{width:9px;height:9px;border-radius:3px;flex-shrink:0}
.lg-name{color:var(--mut);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.lg-val{margin-left:auto;font-weight:700}
.dtable{width:100%;border-collapse:collapse;font-size:12.5px}
.dtable th{text-align:left;color:var(--mut);font-weight:600;font-size:11px;text-transform:uppercase;letter-spacing:.04em;padding:7px 10px;border-bottom:1px solid var(--stroke)}
.dtable td{padding:9px 10px;border-bottom:1px solid ${rgba("#FFFFFF", 0.05)}}
.dtable tbody tr:hover{background:${rgba("#FFFFFF", 0.03)}}
.rail{margin-bottom:8px}
.rail-title{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--mut);margin-bottom:12px;display:flex;align-items:center;gap:8px}
.rail-title::before{content:"";width:14px;height:2px;background:var(--accent);border-radius:2px}
.ins{display:flex;gap:11px;align-items:flex-start;padding:13px 16px;margin-bottom:9px;font-size:13px}
.ins-icon{font-size:12px;margin-top:2px;flex-shrink:0}
.ins-good .ins-icon{color:var(--good)}.ins-bad .ins-icon{color:var(--bad)}.ins-accent .ins-icon{color:var(--accent)}.ins-muted .ins-icon{color:var(--mut)}.ins-muted{color:var(--mut)}
.card:hover,.kpi:hover{transform:translateY(-3px);border-color:${rgba(accent, 0.4)};transition:transform .25s,border-color .25s}
.card,.kpi{transition:transform .25s,border-color .25s}
footer{margin-top:26px;text-align:center;color:var(--mut);font-size:11.5px}
#tip{position:fixed;pointer-events:none;background:#12141c;border:1px solid var(--stroke);color:var(--ink);font-size:12px;padding:6px 10px;border-radius:8px;opacity:0;transition:opacity .12s;z-index:99;white-space:nowrap;box-shadow:0 8px 24px -8px rgba(0,0,0,.8)}
@keyframes rise{from{opacity:0;transform:translateY(14px)}to{opacity:1;transform:none}}
@keyframes grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes draw{to{stroke-dashoffset:0}}
@keyframes spin{from{transform:rotate(-90deg);opacity:0}to{transform:rotate(0);opacity:1}}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
@media(max-width:720px){.grid{grid-template-columns:1fr}.card.wide{grid-column:span 1}}
@media(prefers-reduced-motion:reduce){*{animation:none!important}.draw{stroke-dashoffset:0}}
</style></head>
<body data-palette="${esc(colors.join(","))}">
<div class="wrap">
<header>${logoImg || `<div class="h-badge">${esc((model.title[0] || "B").toUpperCase())}</div>`}
<div><h1>${esc(model.title)}</h1><div class="sub">${esc(model.domainLabel)} · snapshot</div></div>
<div class="live"><span class="dot"></span>Snapshot · ${new Date().toLocaleDateString()}</div></header>
<div class="kpis">${kpiCards}</div>
<div class="grid">${chartCards}</div>
${insightRail ? `<div class="rail"><div class="rail-title">Insights</div>${insightRail}</div>` : ""}
<footer>Generated with BI Theme Studio · interactive web dashboard export</footer>
</div>
<div id="tip"></div>
<script>
(function(){
  // count-up
  var css=document.querySelectorAll('.count');
  function ease(t){return 1-Math.pow(1-t,3)}
  css.forEach(function(el){
    var to=parseFloat(el.getAttribute('data-to')),dec=parseInt(el.getAttribute('data-dec'))||0,dur=1100,st=null;
    function step(ts){if(!st)st=ts;var pr=Math.min((ts-st)/dur,1);el.textContent=(to*ease(pr)).toLocaleString(undefined,{minimumFractionDigits:dec,maximumFractionDigits:dec});if(pr<1)requestAnimationFrame(step)}
    requestAnimationFrame(step);
  });
  // tooltips
  var tip=document.getElementById('tip');
  document.querySelectorAll('[data-tip]').forEach(function(el){
    el.addEventListener('mousemove',function(e){tip.textContent=el.getAttribute('data-tip');tip.style.opacity=1;tip.style.left=(e.clientX+14)+'px';tip.style.top=(e.clientY+14)+'px'});
    el.addEventListener('mouseleave',function(){tip.style.opacity=0});
  });
})();
</script>
</body></html>`;
}
