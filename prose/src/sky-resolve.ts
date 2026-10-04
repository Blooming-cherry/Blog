/** Single colour resolver shared by CSS and WebGL.
 *
 * Sky keyframes are stored as sRGB hex. Hour interpolation converts to OKLab
 * and lerps L/a/b linearly (not OKLCH component lerp), then returns to sRGB
 * with a soft gamut clamp. Surface tokens are stable per family and theme, so
 * text and control contrast never drifts with the clock.
 */
import design from "../design/sky-palettes.json";

export type SkyStep = "zenith" | "upper" | "lower" | "haze" | "horizon";
export type SurfaceKey = "paper" | "ink" | "muted" | "line" | "edge" | "highlight" | "accent" | "panel" | "field" | "floor";
export type SkyPalette = keyof typeof design.palettes;

export interface SkyKeyframe { h: number; zenith: string; upper: string; lower: string; haze: string; horizon: string; }
export interface ResolvedSky { sky: Record<SkyStep, string>; surface: Record<SurfaceKey, string>; }
export interface ResolvedHour { light: ResolvedSky; dark: ResolvedSky; }

const steps: SkyStep[] = [...design.steps] as SkyStep[];

function hexToLinear(hex: string): [number, number, number] {
  const c = parseInt(hex.slice(1), 16);
  const srgb = [(c >> 16) & 255, (c >> 8) & 255, c & 255].map(v => {
    const s = v / 255;
    return s <= .04045 ? s / 12.92 : ((s + .055) / 1.055) ** 2.4;
  });
  return [srgb[0], srgb[1], srgb[2]];
}
function linearToHex(red: number, green: number, blue: number): string {
  const enc = (v: number) => {
    // Soft clamp handles the rare out-of-gamut lerp without crushing luminance.
    const c = Math.max(0, Math.min(1, v));
    const s = c <= .0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - .055;
    return Math.round(Math.max(0, Math.min(1, s)) * 255);
  };
  return `#${[enc(red), enc(green), enc(blue)].map(v => v.toString(16).padStart(2, "0")).join("")}`;
}
function oklabFromLinear(r: number, g: number, b: number): [number, number, number] {
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
function linearFromOklab(L: number, aa: number, bb: number): [number, number, number] {
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
export function mixColors(aHex: string, bHex: string, t: number): string {
  const [ar, ag, ab] = hexToLinear(aHex), [br, bg, bb] = hexToLinear(bHex);
  const A = oklabFromLinear(ar, ag, ab), B = oklabFromLinear(br, bg, bb);
  const L = A[0] + (B[0] - A[0]) * t, aa = A[1] + (B[1] - A[1]) * t, b = A[2] + (B[2] - A[2]) * t;
  const [r, g, bl] = linearFromOklab(L, aa, b);
  return linearToHex(r, g, bl);
}

/** Interpolate sky steps between the surrounding hour keyframes (midnight-safe). */
function resolveKeyframes(keyframes: SkyKeyframe[], hour: number): Record<SkyStep, string> {
  const sorted = [...keyframes].sort((x, y) => x.h - y.h);
  const first = sorted[0], last = sorted[sorted.length - 1];
  const wrapped: SkyKeyframe[] = [...sorted, { ...first, h: first.h + 24 }];
  const h = ((hour % 24) + 24) % 24;
  let from = wrapped[0], to = wrapped[1];
  for (let i = 0; i < wrapped.length - 1; i++) {
    if (h >= wrapped[i].h && h <= wrapped[i + 1].h) { from = wrapped[i]; to = wrapped[i + 1]; break; }
  }
  if (h < first.h) { from = { ...last, h: last.h - 24 }; to = first; }
  const span = to.h - from.h || 1;
  const t = Math.max(0, Math.min(1, (h - from.h) / span));
  const out = {} as Record<SkyStep, string>;
  for (const step of steps) out[step] = mixColors(from[step], to[step], t);
  return out;
}

/** Resolve a palette + hour to light and dark sky/surface (both theme ends). */
export function resolveSkyHour(palette: SkyPalette, hour: number): ResolvedHour {
  const family = design.palettes[Object.hasOwn(design.palettes, palette) ? palette : "dawn"];
  return {
    light: { sky: resolveKeyframes(family.light.sky, hour), surface: family.light.surface as Record<SurfaceKey, string> },
    dark: { sky: resolveKeyframes(family.dark.sky, hour), surface: family.dark.surface as Record<SurfaceKey, string> },
  };
}
export function isValidPalette(value: unknown): value is SkyPalette {
  return typeof value === "string" && Object.hasOwn(design.palettes, value);
}
export const skySteps: SkyStep[] = steps;
export const surfaceKeys: SurfaceKey[] = ["paper", "ink", "muted", "line", "edge", "highlight", "accent", "panel", "field", "floor"];
