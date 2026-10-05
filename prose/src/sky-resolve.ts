/** Single colour resolver shared by CSS and WebGL.
 *
 * Sky keyframes are stored as sRGB hex. Hour interpolation converts to OKLab
 * and lerps L/a/b linearly (not OKLCH component lerp), then returns to sRGB
 * with a soft gamut clamp. Surface tokens are stable per family and theme, so
 * text and control contrast never drifts with the clock.
 *
 * The colour maths lives in design/sky-math.mjs so the SPA, the static reader
 * build and the reader's inline runtime all run the same function bodies.
 */
import design from "../design/sky-palettes.json";
import pool from "../design/sky-pool.json";
import { mixColors, resolveSkyKeyframes } from "../design/sky-math.mjs";

export type SkyStep = "zenith" | "upper" | "lower" | "haze" | "horizon";
export type SurfaceKey = "paper" | "ink" | "muted" | "line" | "edge" | "highlight" | "accent" | "panel" | "field" | "floor";
export type SkyPalette = keyof typeof design.palettes | keyof typeof pool.palettes;

export interface SkyKeyframe { h: number; zenith: string; upper: string; lower: string; haze: string; horizon: string; }
export interface ResolvedSky { sky: Record<SkyStep, string>; surface: Record<SurfaceKey, string>; }
export interface ResolvedHour { light: ResolvedSky; dark: ResolvedSky; }

const steps: SkyStep[] = [...design.steps] as SkyStep[];

export { mixColors };

/** Resolve a palette + hour to light and dark sky/surface (both theme ends). */
export function resolveSkyHour(palette: SkyPalette, hour: number): ResolvedHour {
  if (Object.hasOwn(pool.palettes, palette)) {
    const family = pool.palettes[palette as keyof typeof pool.palettes];
    return { light: family.light, dark: family.dark };
  }
  const family = design.palettes[palette as keyof typeof design.palettes] ?? design.palettes.dawn;
  return {
    light: { sky: resolveSkyKeyframes(family.light.sky, hour, steps) as Record<SkyStep, string>, surface: family.light.surface as Record<SurfaceKey, string> },
    dark: { sky: resolveSkyKeyframes(family.dark.sky, hour, steps) as Record<SkyStep, string>, surface: family.dark.surface as Record<SurfaceKey, string> },
  };
}
export function isValidPalette(value: unknown): value is SkyPalette {
  return typeof value === "string" && (Object.hasOwn(design.palettes, value) || Object.hasOwn(pool.palettes, value));
}
export const skySteps: SkyStep[] = steps;
export const surfaceKeys: SurfaceKey[] = ["paper", "ink", "muted", "line", "edge", "highlight", "accent", "panel", "field", "floor"];
