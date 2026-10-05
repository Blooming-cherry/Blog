// Shared OKLab colour core — the single source of truth for sky/paper mixing.
//
// Consumers:
//   1. src/sky-resolve.ts   — bundled by Vite for the SPA/WebGL target colours.
//   2. scripts/prose-pages.mjs — static reader stylesheet + first-paint theme-color.
//   3. the reader's inline runtime — prose-pages.mjs embeds this file's source
//      verbatim (with `export ` stripped) so the static page runs the SAME
//      function bodies instead of a hand-copied coefficient set.
//
// Keep this file dependency-free (no imports) so it can be injected verbatim
// into a classic <script>. Colours in / out are sRGB hex; interpolation is
// OKLab L/a/b linear (never an OKLCH component lerp).

export function hexToLinear(hex) {
  const c = parseInt(hex.slice(1), 16);
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255].map(v => {
    const s = v / 255;
    return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
  });
}

export function linearToHex(red, green, blue) {
  const enc = (v) => {
    // Soft clamp handles the rare out-of-gamut lerp without crushing luminance.
    const c = Math.max(0, Math.min(1, v));
    const s = c <= .0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - .055;
    return Math.round(Math.max(0, Math.min(1, s)) * 255);
  };
  return `#${[enc(red), enc(green), enc(blue)].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}

export function oklabFromLinear(r, g, b) {
  const l = .4122214708 * r + .5363325363 * g + .0514459929 * b;
  const m = .2119034982 * r + .6806995451 * g + .1073969566 * b;
  const s = .0883024619 * r + .2817188376 * g + .6299787005 * b;
  const l_ = Math.cbrt(l), m_ = Math.cbrt(m), s_ = Math.cbrt(s);
  return [
    .2104542553 * l_ + .7936177850 * m_ - .0040720468 * s_,
    1.9779984951 * l_ - 2.4285922050 * m_ + .4505937099 * s_,
    .0259040371 * l_ + .7827717662 * m_ - .8086757660 * s_,
  ];
}

export function linearFromOklab(L, aa, bb) {
  const l_ = L + .3963377774 * aa + .2158037573 * bb;
  const m_ = L - .1055613458 * aa - .0638541728 * bb;
  const s_ = L - .0894841775 * aa - 1.2914855480 * bb;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [
    +4.0767416621 * l - 3.3077115913 * m + .2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - .3413193965 * s,
    -.0041960863 * l - .7034186147 * m + 1.7076147010 * s,
  ];
}

/** Paper/sky strength mixing and hour keyframe interpolation both use this. */
export function mixColors(aHex, bHex, t) {
  const [ar, ag, ab] = hexToLinear(aHex), [br, bg, bb] = hexToLinear(bHex);
  const A = oklabFromLinear(ar, ag, ab), B = oklabFromLinear(br, bg, bb);
  const L = A[0] + (B[0] - A[0]) * t, aa = A[1] + (B[1] - A[1]) * t, b = A[2] + (B[2] - A[2]) * t;
  const [r, g, bl] = linearFromOklab(L, aa, b);
  return linearToHex(r, g, bl);
}

/** Interpolate sky steps between the surrounding hour keyframes (midnight-safe). */
export function resolveSkyKeyframes(keyframes, hour, steps) {
  const sorted = [...keyframes].sort((x, y) => x.h - y.h);
  const first = sorted[0], last = sorted[sorted.length - 1];
  const wrapped = [...sorted, { ...first, h: first.h + 24 }];
  const h = ((hour % 24) + 24) % 24;
  let from = wrapped[0], to = wrapped[1];
  for (let i = 0; i < wrapped.length - 1; i++) {
    if (h >= wrapped[i].h && h <= wrapped[i + 1].h) { from = wrapped[i]; to = wrapped[i + 1]; break; }
  }
  if (h < first.h) { from = { ...last, h: last.h - 24 }; to = first; }
  const span = to.h - from.h || 1;
  const t = Math.max(0, Math.min(1, (h - from.h) / span));
  const out = {};
  for (const step of steps) out[step] = mixColors(from[step], to[step], t);
  return out;
}

const channelToLinear = (v) => { const s = v / 255; return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4; };
const linearChannel = (v) => { const c = Math.max(0, Math.min(1, v)); const s = c <= .0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - .055; return Math.round(Math.max(0, Math.min(1, s)) * 255); };
const relativeLuminance = (channels) => .2126 * channels[0] + .7152 * channels[1] + .0722 * channels[2];

/** Necessary info keeps its shared palette hue but must clear `ratio` against
 * the real composite sky. Luminance moves away from the backdrop until it does.
 * `bands` are sRGB channel triples (0-255) of the painted gradient stops. */
export function readableOverBands(hex, bands, ratio) {
  const fg = hexToLinear(hex);
  const y = relativeLuminance(fg);
  const lums = bands.map(b => relativeLuminance(b.map(channelToLinear)));
  const lmin = Math.min(...lums), lmax = Math.max(...lums);
  const contrast = (a, b) => { const hi = Math.max(a, b), lo = Math.min(a, b); return (hi + .05) / (lo + .05); };
  if (contrast(y, lmin) >= ratio && contrast(y, lmax) >= ratio) return hex;
  const hexOf = channels => "#" + channels.map(v => linearChannel(v).toString(16).padStart(2, "0")).join("");
  if (y >= lmax) {
    const target = Math.min(1, ratio * (lmax + .05) - .05);
    if (y >= target) return hex;
    return hexOf(fg.map(v => v + (1 - v) * ((target - y) / (1 - y))));
  }
  const target = Math.max(0, (lmin + .05) / ratio - .05);
  if (y <= target) return hex;
  return hexOf(fg.map(v => v * (target / y)));
}

/** Presentation-only chroma widening for the sky. Lightness (OKLab L) and hue
 * are held; only the a/b distance from neutral is scaled. Near-neutral colours
 * are left alone, and the boost is relaxed toward 1 until the result stays in
 * the displayable gamut, so dark or already-saturated tones are never forced
 * out of range. Palette values and the resolvers above are untouched. */
export function boostChroma(hex, gain = 1) {
  if (!(gain > 1)) return hex;
  const [r, g, b] = hexToLinear(hex);
  const [L, a, bb] = oklabFromLinear(r, g, b);
  if (Math.hypot(a, bb) < 0.006) return hex;
  let scale = gain, linear = linearFromOklab(L, a, bb);
  for (let attempt = 0; attempt < 6; attempt++) {
    linear = linearFromOklab(L, a * scale, bb * scale);
    if (linear.every(v => v >= -1e-4 && v <= 1 + 1e-4)) break;
    scale = 1 + (scale - 1) * 0.55;
  }
  return linearToHex(linear[0], linear[1], linear[2]);
}
