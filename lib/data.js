// Domain templates: dummy data, slicer fields, starter palettes.
// Add a new domain by adding one object here — the whole app picks it up.

export const DOMAINS = {
  workforce: {
    label: "Workforce / RMG", icon: "◫", desc: "Bench, demand vs supply, utilization",
    palette: ["#2563EB", "#0EA5E9", "#8B5CF6", "#F59E0B", "#10B981", "#EF4444", "#64748B", "#EC4899"],
    slicers: ["Grade", "Location", "Skill Cluster"],
    kpis: [
      { label: "Total Headcount", value: "7,214", delta: "+3.2%", up: true },
      { label: "Bench Strength", value: "612", delta: "-8.4%", up: true },
      { label: "Utilization", value: "87.6%", delta: "+1.9%", up: true },
      { label: "Open Demands", value: "1,038", delta: "+12%", up: false },
    ],
    bar: { title: "Bench by Grade", cats: ["A4", "A5", "B1", "B2", "C1", "C2"], vals: [42, 118, 176, 148, 86, 42] },
    line: { title: "Demand vs Supply Trend", cats: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], s1: [820, 870, 910, 980, 1010, 1038], s2: [760, 800, 860, 890, 940, 970] },
    donut: { title: "Bench by Skill Cluster", segs: [{ n: "Data & AI", v: 34 }, { n: "Cloud", v: 26 }, { n: "SAP", v: 18 }, { n: "Testing", v: 12 }, { n: "Other", v: 10 }] },
    table: { title: "Top Skills in Demand", cols: ["Skill", "Demands", "Fit %"], rows: [["Power BI", "142", "78%"], ["Azure Data Eng.", "118", "64%"], ["GenAI / LLM", "96", "41%"], ["SAP HANA", "84", "72%"]] },
    text: { title: "Analyst Commentary", body: "Bench reduced 8.4% MoM driven by Data & AI redeployments. Demand pipeline remains ahead of supply — prioritize cross-skilling on GenAI." },
  },
  automotive: {
    label: "Automotive / OTA", icon: "◉", desc: "OTA campaigns, fleet, software quality",
    palette: ["#0F766E", "#22D3EE", "#84CC16", "#F97316", "#A855F7", "#F43F5E", "#475569", "#EAB308"],
    slicers: ["Region", "Model", "Campaign"],
    kpis: [
      { label: "Vehicles Online", value: "1.82M", delta: "+4.1%", up: true },
      { label: "OTA Success Rate", value: "96.3%", delta: "+0.8%", up: true },
      { label: "Active Campaigns", value: "47", delta: "+6", up: true },
      { label: "Avg. Install Time", value: "18m", delta: "-2m", up: true },
    ],
    bar: { title: "Updates by Region", cats: ["EU", "NA", "CN", "APAC", "LATAM", "MEA"], vals: [640, 410, 520, 280, 120, 80] },
    line: { title: "Campaign Rollout Curve", cats: ["W1", "W2", "W3", "W4", "W5", "W6"], s1: [8, 24, 46, 68, 84, 96], s2: [6, 18, 38, 60, 78, 92] },
    donut: { title: "Failure Root Causes", segs: [{ n: "Network", v: 38 }, { n: "Battery", v: 24 }, { n: "Storage", v: 16 }, { n: "ECU Busy", v: 14 }, { n: "Other", v: 8 }] },
    table: { title: "Campaign Health", cols: ["Campaign", "Fleet", "Success"], rows: [["MEB 3.2.1", "420K", "97.1%"], ["ICAS1 Hotfix", "180K", "95.4%"], ["Infotain 5.4", "610K", "96.8%"], ["Nav Maps Q2", "310K", "98.2%"]] },
    text: { title: "Release Notes", body: "Rollout velocity up 12% after staged-wave tuning. Network-related failures concentrated in underground parking scenarios — retry window extended." },
  },
  finance: {
    label: "Finance", icon: "◍", desc: "P&L, revenue, margin, cash flow",
    palette: ["#1E3A8A", "#3B82F6", "#0891B2", "#D97706", "#059669", "#DC2626", "#6B7280", "#7C3AED"],
    slicers: ["Business Unit", "Quarter", "Region"],
    kpis: [
      { label: "Revenue YTD", value: "€48.2M", delta: "+11.4%", up: true },
      { label: "Gross Margin", value: "34.8%", delta: "+2.1pp", up: true },
      { label: "OPEX", value: "€9.6M", delta: "+4.0%", up: false },
      { label: "DSO", value: "52 days", delta: "-6", up: true },
    ],
    bar: { title: "Revenue by Business Unit", cats: ["Consult", "Eng.", "Cloud", "Data", "Ops", "Other"], vals: [14.2, 11.8, 9.4, 6.8, 4.2, 1.8] },
    line: { title: "Actuals vs Budget", cats: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], s1: [6.8, 7.4, 8.1, 8.4, 8.9, 9.6], s2: [7.0, 7.2, 7.8, 8.2, 8.6, 9.0] },
    donut: { title: "Cost Structure", segs: [{ n: "People", v: 58 }, { n: "Infra", v: 16 }, { n: "Licenses", v: 12 }, { n: "Travel", v: 8 }, { n: "Other", v: 6 }] },
    table: { title: "BU Performance", cols: ["Unit", "Rev €M", "Margin"], rows: [["Consulting", "14.2", "38%"], ["Engineering", "11.8", "32%"], ["Cloud", "9.4", "35%"], ["Data & AI", "6.8", "41%"]] },
    text: { title: "CFO Summary", body: "Revenue tracking 6.7% above budget. Margin expansion led by Data & AI mix shift. Watch OPEX creep in travel — up 4% against flat plan." },
  },
  sales: {
    label: "Sales", icon: "◭", desc: "Pipeline, wins, conversion, quota",
    palette: ["#BE185D", "#F472B6", "#7C3AED", "#2DD4BF", "#FB923C", "#22C55E", "#64748B", "#3B82F6"],
    slicers: ["Segment", "Owner", "Stage"],
    kpis: [
      { label: "Pipeline", value: "$12.4M", delta: "+18%", up: true },
      { label: "Win Rate", value: "31.2%", delta: "+2.4pp", up: true },
      { label: "Avg. Deal Size", value: "$86K", delta: "-4%", up: false },
      { label: "Quota Attainment", value: "92%", delta: "+7pp", up: true },
    ],
    bar: { title: "Pipeline by Stage", cats: ["Lead", "Qual", "Prop", "Nego", "Close"], vals: [4.2, 3.1, 2.6, 1.6, 0.9] },
    line: { title: "Bookings Trend", cats: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], s1: [1.2, 1.5, 1.4, 1.9, 2.1, 2.4], s2: [1.0, 1.2, 1.3, 1.5, 1.7, 2.0] },
    donut: { title: "Wins by Segment", segs: [{ n: "Enterprise", v: 44 }, { n: "Mid-market", v: 28 }, { n: "SMB", v: 16 }, { n: "Public", v: 12 }] },
    table: { title: "Top Opportunities", cols: ["Account", "Value", "Stage"], rows: [["Volkswagen AG", "$1.2M", "Nego"], ["Siemens", "$840K", "Prop"], ["Bosch", "$620K", "Qual"], ["Airbus", "$540K", "Nego"]] },
    text: { title: "Pipeline Notes", body: "Enterprise segment carrying the quarter. Two Nego-stage deals above $500K expected to close by month-end — coverage ratio at 3.1x." },
  },
  supply: {
    label: "Supply Chain", icon: "◱", desc: "Inventory, OTIF, logistics, suppliers",
    palette: ["#166534", "#4ADE80", "#0EA5E9", "#FACC15", "#F97316", "#EF4444", "#64748B", "#A78BFA"],
    slicers: ["Warehouse", "Supplier", "Category"],
    kpis: [
      { label: "OTIF", value: "94.1%", delta: "+1.2%", up: true },
      { label: "Inventory Value", value: "$8.2M", delta: "-6%", up: true },
      { label: "Stockouts", value: "23", delta: "-11", up: true },
      { label: "Lead Time", value: "12.4d", delta: "+0.8d", up: false },
    ],
    bar: { title: "Inventory by Warehouse", cats: ["Pune", "Chennai", "Berlin", "Lyon", "Austin", "Osaka"], vals: [2.1, 1.8, 1.4, 1.2, 1.0, 0.7] },
    line: { title: "OTIF Trend", cats: ["Jan", "Feb", "Mar", "Apr", "May", "Jun"], s1: [91, 92, 93, 92.5, 93.8, 94.1], s2: [93, 93, 93, 94, 94, 94] },
    donut: { title: "Spend by Supplier Tier", segs: [{ n: "Tier 1", v: 52 }, { n: "Tier 2", v: 28 }, { n: "Tier 3", v: 14 }, { n: "Spot", v: 6 }] },
    table: { title: "Supplier Scorecard", cols: ["Supplier", "OTIF", "Quality"], rows: [["Continental", "96%", "A"], ["ZF Group", "94%", "A-"], ["Valeo", "91%", "B+"], ["Denso", "97%", "A"]] },
    text: { title: "Ops Commentary", body: "OTIF above target for the second month. Stockouts down 32% after safety-stock recalibration. Lead time creep traced to one Tier-2 supplier." },
  },
  marketing: {
    // Colors, KPI totals, weekly trends and event rows lifted straight from
    // the WebAnalytics.pbip reference project (WebAnalyticsTheme.json +
    // DailyMetrics/Events/KeyEvents partitions) -- not invented placeholder
    // data. groupedBars/tables (plural) back the "webAnalytics" preset's 2
    // clustered-column charts + 2 tables; bar/line/donut/table (singular)
    // still back the standard presets (g2x2/g2x4/g3x3) same as every other
    // domain -- see CellVisual.jsx for the idx-cycling that picks between them.
    label: "Marketing / Web Analytics", icon: "◈", desc: "Sessions, users, engagement, key events",
    // Unlike the other 5 domains, this one is built to reproduce one specific
    // reference dashboard exactly -- picking it in the domain picker also
    // applies this preset + this palette (see Studio.jsx's pickDomain), the
    // one deliberate exception to "colors/layout stay as they are".
    recommendedPreset: "webAnalytics",
    palette: ["#1B4F9C", "#4FB3E8", "#2BBBAD", "#6C3FB5", "#E85D75", "#9B4DB0", "#3EC98E", "#5B6ECF"],
    slicers: ["Date Range", "Device", "Channel"],
    kpis: [
      { label: "Active users", value: "79K", delta: "+20.2%", up: true },
      { label: "New users", value: "72K", delta: "+21.9%", up: true },
      { label: "Sessions", value: "131K", delta: "+16.9%", up: true },
      { label: "Duration (seconds)", value: "298.65", delta: "-6.5%", up: false },
      { label: "Key events", value: "9K", delta: "+14.6%", up: true },
      { label: "Engaged sessions", value: "68K", delta: "+17.9%", up: true },
      { label: "Engagement rate", value: "51.68%", delta: "+0.43pp", up: true },
    ],
    bar: { title: "Sessions by Week", cats: ["Mar 9", "Mar 16", "Mar 23", "Mar 30", "Apr 6"], vals: [25.4, 31.9, 31.4, 36.7, 5.9] },
    line: { title: "Active vs New Users", cats: ["Mar 9", "Mar 16", "Mar 23", "Mar 30", "Apr 6"], s1: [15.4, 19.0, 18.4, 22.1, 3.5], s2: [14.2, 17.6, 16.8, 20.5, 3.2] },
    donut: { title: "Engaged vs Non-engaged Sessions", segs: [{ n: "Engaged", v: 52 }, { n: "Non-engaged", v: 48 }] },
    table: { title: "Top Events", cols: ["Event name", "Active users", "Event count", "Completion rate"], rows: [["Event 52", "68,224", "113,641", "90.42%"], ["Event 63", "67,560", "377,902", "89.54%"], ["Event 38", "63,498", "63,982", "84.16%"], ["Event 35", "48,584", "117,357", "64.39%"]] },
    text: { title: "Analyst Commentary", body: "Sessions reached 131K, up 16.9% week-over-week, with Active Users up 20.2% to 79K. Engagement Rate held at 51.68% (+0.43pp WoW) and Key Events grew to 9,239 (+14.6% WoW) — Event 52 remains the top-completing event at 90.42%." },
    // The real dashboard's 2 side-by-side clustered-column charts (chartL/chartR
    // in the reference .pbip), both driven by the same weekly buckets as `line` above.
    groupedBars: [
      { title: "Active users vs New users", cats: ["Mar 9", "Mar 16", "Mar 23", "Mar 30", "Apr 6"], s1: [15.4, 19.0, 18.4, 22.1, 3.5], s2: [14.2, 17.6, 16.8, 20.5, 3.2], s1Label: "Active users", s2Label: "New users" },
      { title: "Sessions vs Engaged sessions", cats: ["Mar 9", "Mar 16", "Mar 23", "Mar 30", "Apr 6"], s1: [25.4, 31.9, 31.4, 36.7, 5.9], s2: [13.2, 16.8, 16.0, 18.8, 3.0], s1Label: "Sessions", s2Label: "Engaged sessions" },
    ],
    // The real dashboard's 2 side-by-side tables (tblEvents/tblKey).
    tables: [
      { title: "Top Events", cols: ["Event name", "Active users", "Event count", "Completion rate"], rows: [["Event 52", "68,224", "113,641", "90.42%"], ["Event 63", "67,560", "377,902", "89.54%"], ["Event 38", "63,498", "63,982", "84.16%"], ["Event 35", "48,584", "117,357", "64.39%"]] },
      { title: "Key Events", cols: ["Key event name", "Active users", "Event count", "Completion rate"], rows: [["Key event 4", "3,646", "4,689", "4.83%"], ["Key event 1", "2,750", "2,775", "3.64%"], ["Key event 3", "832", "842", "1.10%"], ["Key event 2", "554", "633", "0.73%"]] },
    ],
  },
};

// Brand-picker industries (lib/brands.js) that have a closely-matching DOMAINS
// content template -- picking a company in one of these auto-suggests its
// domain; every other industry falls back to Workforce/RMG content. Shared
// between Studio (to do the auto-suggest) and the brand picker UI (to show
// which industries get a real content match, not just recolored Workforce data).
export const INDUSTRY_TO_DOMAIN = { Automotive: "automotive", Finance: "finance", Logistics: "supply" };

export const REPORT_FONTS = ["Segoe UI", "DIN", "Arial", "Verdana", "Calibri", "Tahoma"];

export const VISUALS = {
  kpi: { label: "KPI Card", icon: "▣" },
  column: { label: "Column", icon: "▥" },
  bar: { label: "Bar", icon: "▤" },
  line: { label: "Line", icon: "⟋" },
  area: { label: "Area", icon: "◺" },
  donut: { label: "Donut", icon: "◔" },
  table: { label: "Table", icon: "☰" },
  text: { label: "Text Box", icon: "¶" },
  columnGrouped: { label: "Clustered Column", icon: "▦" },
};

export const PRESETS = {
  kpicharts: { label: "KPI strip + 2×2", cells: 4, cols: 2, strip: true, defaults: ["column", "line", "donut", "table"] },
  g2x2: { label: "2×2 grid", cells: 4, cols: 2, strip: false, defaults: ["kpi", "column", "line", "donut"] },
  g2x4: { label: "2×4 grid", cells: 8, cols: 4, strip: false, defaults: ["kpi", "kpi", "kpi", "kpi", "column", "line", "donut", "table"] },
  g3x3: { label: "3×3 grid", cells: 9, cols: 3, strip: false, defaults: ["kpi", "kpi", "kpi", "column", "line", "donut", "bar", "table", "text"] },
  // KPI strip shows every one of the domain's KPI cards (not capped at 4 --
  // see ReportPreview's resolvedKpiStrip), matching the reference web-analytics
  // dashboard's 7-card row. The 2 columnGrouped + 2 table cells cycle through
  // a domain's groupedBars/tables arrays by position (CellVisual.jsx), falling
  // back to `line`/`table` for any domain that doesn't define those arrays.
  webAnalytics: { label: "KPI strip + 2 charts + 2 tables", cells: 4, cols: 2, strip: true, defaults: ["columnGrouped", "columnGrouped", "table", "table"] },
};

export const DEFAULT_THEME = (domainKey) => ({
  name: "Untitled Theme",
  dataColors: [...DOMAINS[domainKey].palette],
  background: "#FFFFFF",
  secondaryBackground: "#F5F6F8",
  foreground: "#1F2430",
  secondaryForeground: "#6B7280",
  tableAccent: DOMAINS[domainKey].palette[0],
  good: "#10B981",
  bad: "#EF4444",
  neutral: "#F59E0B",
  fontFamily: "Segoe UI",
  calloutSize: 30,
  titleSize: 13,
  labelSize: 10,
  cardRadius: 8,
  rationale: "",
});

export const DEFAULT_LAYOUT = () => ({
  preset: "g2x4",
  cells: [...PRESETS.g2x4.defaults],
  slicerPos: "top",
  pageSize: "16:9",
  header: { show: true, height: 64 },
  // Only meaningful when preset is "kpicharts" (the fixed 4-card strip above
  // the grid) -- null entries mean "use demo data", same convention as cells.
  kpiStripBindings: [null, null, null, null],
  // Page-wide slicer filters, bound to real dataset columns. Empty = today's
  // behavior (static, non-interactive Filters bar showing the domain's demo
  // slicer labels). Each entry: { id: "<table>::<column>", table, column,
  // selected: string[] } -- selected: [] means "no constraint / All".
  filters: [],
});

export const PAGE_SIZES = {
  "16:9": { label: "16:9", w: 1280, h: 720 },
  "4:3": { label: "4:3", w: 960, h: 720 },
  responsive: { label: "Fit width", w: 1280, h: 720 }, // preview stretches; exports still use 16:9 px
};
