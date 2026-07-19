export const hexToRgb = (h) => {
  const m = h.replace("#", "");
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
};

export const rgbToHex = (r, g, b) =>
  "#" + [r, g, b].map((x) => x.toString(16).padStart(2, "0")).join("").toUpperCase();

export const shade = (hex, amt) => {
  const [r, g, b] = hexToRgb(hex);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + amt)));
  return rgbToHex(f(r), f(g), f(b));
};

export const alpha = (hex, a) => {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

// Samples the uploaded logo on a small canvas and returns up to 4 dominant
// saturated colors (grays and near-black/white pixels are skipped).
export function extractPaletteFromImage(dataUrl, cb) {
  const img = new Image();
  img.onload = () => {
    const c = document.createElement("canvas");
    const s = 48;
    c.width = s;
    c.height = s;
    const ctx = c.getContext("2d");
    ctx.drawImage(img, 0, 0, s, s);
    const d = ctx.getImageData(0, 0, s, s).data;
    const buckets = {};
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2], a = d[i + 3];
      if (a < 128) continue;
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      const lum = (r + g + b) / 3;
      if (sat < 0.25 || lum < 30 || lum > 235) continue;
      const key = `${Math.round(r / 32)},${Math.round(g / 32)},${Math.round(b / 32)}`;
      if (!buckets[key]) buckets[key] = { r: 0, g: 0, b: 0, n: 0 };
      buckets[key].r += r; buckets[key].g += g; buckets[key].b += b; buckets[key].n++;
    }
    const top = Object.values(buckets)
      .sort((a, b) => b.n - a.n)
      .slice(0, 4)
      .map((v) => rgbToHex(Math.round(v.r / v.n), Math.round(v.g / v.n), Math.round(v.b / v.n)));
    cb(top);
  };
  img.src = dataUrl;
}

// A hex color is usable as a chart data color if it's saturated enough and not
// near-black/near-white (mirrors the filter used for logo palette extraction).
export function isUsableDataColor(hex) {
  const [r, g, b] = hexToRgb(hex);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const sat = max === 0 ? 0 : (max - min) / max;
  const lum = (r + g + b) / 3;
  return sat >= 0.25 && lum >= 30 && lum <= 235;
}

/* ---------- theme pair (light/dark twin) color math ---------- */
export const relLum = (hex) => {
  const [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
export const isDarkColor = (hex) => relLum(hex) < 0.4;

export function hexToHsl(hex) {
  let [r, g, b] = hexToRgb(hex).map((c) => c / 255);
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
    else if (max === g) h = ((b - r) / d + 2) / 6;
    else h = ((r - g) / d + 4) / 6;
  }
  return [h * 360, s * 100, l * 100];
}

export function hslToHex(h, s, l) {
  h /= 360; s /= 100; l /= 100;
  const hue2rgb = (p, q, t) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  let r, g, b;
  if (s === 0) { r = g = b = l; }
  else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }
  return rgbToHex(Math.round(r * 255), Math.round(g * 255), Math.round(b * 255));
}

// Expands 1-3 real brand colors into a full 8-slot chart palette. The real
// colors go first (unchanged, so the brand stays recognizable); remaining
// slots are hue-rotated + lightness-alternated variants of those same colors,
// so every chart in the grid (not just the ones landing on slot 0) reads as
// "this brand" instead of falling back to stale default-palette colors.
export function buildBrandDataPalette(baseColors) {
  if (!baseColors.length) return null;
  const palette = [...baseColors];
  let i = 0;
  while (palette.length < 8) {
    const seed = baseColors[i % baseColors.length];
    const [h, s, l] = hexToHsl(seed);
    const variant = Math.floor(i / baseColors.length) + 1;
    const hue = (h + variant * 55) % 360;
    const sat = Math.min(90, Math.max(40, s));
    const light = variant % 2 === 0 ? Math.min(74, l + 14) : Math.max(30, l - 10);
    palette.push(hslToHex(hue, sat, light));
    i++;
  }
  return palette.slice(0, 8);
}

// Re-tune a data color for a dark canvas: same hue, lifted lightness + saturation.
export const liftForDark = (hex) => {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.min(100, Math.max(s, 45)), Math.max(l, 58));
};
// Re-tune for a light canvas: same hue, pulled down so it reads on white.
export const dropForLight = (hex) => {
  const [h, s, l] = hexToHsl(hex);
  return hslToHex(h, Math.min(100, Math.max(s, 40)), Math.min(l, 46));
};
