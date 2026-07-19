"use client";
import { alpha } from "../lib/utils";

/* Lightweight SVG chart primitives tuned to look like Power BI visuals. */

export function ColumnChart({ data, color, sub, fg, labelSize }) {
  // Guarded against empty/all-zero data (reachable mid-binding, before a user
  // data source has a column picked yet) -- a naive max of 0 divides to NaN.
  const max = (data.vals.length ? Math.max(...data.vals) : 0) * 1.15 || 1;
  const bw = 100 / (data.vals.length || 1);
  return (
    <svg viewBox="0 0 100 58" preserveAspectRatio="xMidYMid meet" className="w-full h-full block">
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1="0" x2="100" y1={50 - g * 48} y2={50 - g * 48} stroke={sub} strokeWidth="0.25" opacity="0.35" />
      ))}
      {data.vals.map((v, i) => {
        const h = (v / max) * 48;
        return (
          <g key={i}>
            <rect x={i * bw + bw * 0.18} y={50 - h} width={bw * 0.64} height={h} rx="0.8" fill={color} />
            {data.showDataLabels && (
              <text x={i * bw + bw / 2} y={50 - h - 1.5} textAnchor="middle" fontSize={labelSize * 0.32} fill={fg}>{data.valueLabels?.[i]}</text>
            )}
          </g>
        );
      })}
      {data.cats.map((c, i) => (
        <text key={c} x={i * bw + bw / 2} y={56} textAnchor="middle" fontSize={labelSize * 0.36} fill={sub}>{c}</text>
      ))}
    </svg>
  );
}

export function HBarChart({ data, color, sub, fg, labelSize }) {
  const max = (data.vals.length ? Math.max(...data.vals) : 0) * 1.1 || 1;
  const rh = 56 / (data.vals.length || 1);
  return (
    <svg viewBox="0 0 100 58" preserveAspectRatio="xMidYMid meet" className="w-full h-full block">
      {data.vals.map((v, i) => {
        const w = (v / max) * 66;
        const y = i * rh + rh * 0.2;
        return (
          <g key={i}>
            <text x="0" y={y + rh * 0.42} fontSize={labelSize * 0.36} fill={sub}>{data.cats[i]}</text>
            <rect x="20" y={y} width={w} height={rh * 0.56} rx="0.8" fill={color} />
            {/* Always-on by design (no numeric axis to read exact values from
                otherwise) -- uses the formatted label when available (bound
                data), falling back to the raw value for demo data. */}
            <text x={22 + w} y={y + rh * 0.42} fontSize={labelSize * 0.34} fill={fg}>{data.valueLabels?.[i] ?? v}</text>
          </g>
        );
      })}
    </svg>
  );
}

export function LineChart({ data, c1, c2, sub, fg, labelSize, area }) {
  const all = [...data.s1, ...data.s2];
  const max = (all.length ? Math.max(...all) : 1) * 1.1;
  const min = (all.length ? Math.min(...all) : 0) * 0.9;
  const span = (max - min) || 1;
  const xPos = (i, len) => (len > 1 ? i / (len - 1) : 0.5) * 96 + 2;
  const pt = (v, i, arr) => [xPos(i, arr.length), (50 - ((v - min) / span) * 44)];
  const p1 = data.s1.map((v, i) => pt(v, i, data.s1).join(",")).join(" ");
  const p2 = data.s2.map((v, i) => pt(v, i, data.s2).join(",")).join(" ");
  const areaPath = `${p1} 98,50 2,50`;
  return (
    <svg viewBox="0 0 100 58" preserveAspectRatio="xMidYMid meet" className="w-full h-full block">
      {[0.25, 0.5, 0.75, 1].map((g) => (
        <line key={g} x1="2" x2="98" y1={50 - g * 44} y2={50 - g * 44} stroke={sub} strokeWidth="0.25" opacity="0.35" />
      ))}
      {area && <polygon points={areaPath} fill={alpha(c1, 0.22)} />}
      <polyline points={p2} fill="none" stroke={c2} strokeWidth="0.9" strokeDasharray="2 1.4" />
      <polyline points={p1} fill="none" stroke={c1} strokeWidth="1.4" />
      {data.s1.map((v, i) => {
        const [x, y] = pt(v, i, data.s1);
        return (
          <g key={i}>
            <circle cx={x} cy={y} r="1.1" fill={c1} />
            {/* Primary series only -- labeling both lines on a small chart is
                too cluttered to read. */}
            {data.showDataLabels && (
              <text x={x} y={y - 2} textAnchor="middle" fontSize={labelSize * 0.32} fill={fg}>{data.valueLabels?.[i]}</text>
            )}
          </g>
        );
      })}
      {data.cats.map((c, i) => (
        <text key={c} x={xPos(i, data.cats.length)} y={56} textAnchor="middle" fontSize={labelSize * 0.36} fill={sub}>{c}</text>
      ))}
    </svg>
  );
}

export function Donut({ segs, colors, fg, sub, labelSize }) {
  const total = segs.reduce((a, s) => a + s.v, 0);
  let acc = 0;
  const R = 19, C = 2 * Math.PI * R;
  return (
    <div className="h-full flex items-center gap-3">
      <svg viewBox="0 0 60 60" style={{ height: "100%", width: "auto", maxWidth: "50%", aspectRatio: "1", flexShrink: 0 }}>
        {segs.map((s, i) => {
          const frac = total > 0 ? s.v / total : 0;
          const dash = `${frac * C - 1.2} ${C - frac * C + 1.2}`;
          const off = -acc * C + C * 0.25;
          acc += frac;
          return <circle key={s.n} cx="30" cy="30" r={R} fill="none" stroke={colors[i % colors.length]} strokeWidth="9" strokeDasharray={dash} strokeDashoffset={off} />;
        })}
        <text x="30" y="32.5" textAnchor="middle" fontSize="8" fontWeight="700" fill={fg}>{total}%</text>
      </svg>
      <div className="flex flex-col gap-1 min-w-0">
        {segs.map((s, i) => (
          <div key={s.n} className="flex items-center gap-1.5">
            <span style={{ width: 7, height: 7, borderRadius: 2, background: colors[i % colors.length], flexShrink: 0 }} />
            <span className="truncate" style={{ fontSize: labelSize, color: sub }}>{s.n}</span>
            <span style={{ fontSize: labelSize, color: fg, fontWeight: 600, marginLeft: "auto" }}>{s.v}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}
