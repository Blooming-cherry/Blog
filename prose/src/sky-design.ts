import design from "../design/sky-palettes.json";
import { isValidPalette, mixColors, resolveSkyHour, skySteps, surfaceKeys, type ResolvedHour, type SkyPalette } from "./sky-resolve";

export type { SkyPalette } from "./sky-resolve";
export type DesignStage = "intro" | "archive" | "read";
export const designParameters: { palette: SkyPalette; presence: number; titleScale: number } = {
  palette: design.defaults.palette as SkyPalette,
  presence: design.defaults.presence,
  titleScale: design.defaults.titleScale,
};
const stageWeights = { intro: 0, archive: 1, read: .35 };
export const designState = { stage: "intro" as DesignStage, weight: 0, revision: 0, hour: 12 };
export function designStrength() { return designParameters.presence * designState.weight; }
/** Three author parameters, with no visitor menu or independent theme storage. */
export function setDesignParameters(values: Partial<typeof designParameters>) {
  if (values.palette !== undefined) designParameters.palette = isValidPalette(values.palette) ? values.palette : "dawn";
  if (Number.isFinite(values.presence)) designParameters.presence = Math.max(0, Math.min(1, values.presence!));
  if (Number.isFinite(values.titleScale)) designParameters.titleScale = Math.max(.9, Math.min(1.1, values.titleScale!));
  designState.revision++;
}
/** Runtime clock input; not a stored theme authority. */
export function setSkyHour(hour: number) {
  if (!Number.isFinite(hour)) return;
  const next = ((hour % 24) + 24) % 24;
  if (Math.abs(next - designState.hour) < .0001) return;
  designState.hour = next;
  designState.revision++;
}
export function currentResolved(): ResolvedHour {
  return resolveSkyHour(designParameters.palette, designState.hour);
}
/** Optional weight lets the existing scene's progress drive its material relay. */
export function setDesignStage(stage: DesignStage, weight = stageWeights[stage]) {
  weight = Math.max(0, Math.min(1, weight));
  if (designState.stage === stage && Math.abs(designState.weight - weight) < .0001) return;
  designState.stage = stage; designState.weight = weight; designState.revision++;
}
export function colorRGB(hex: string) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); }
let previousAmount = NaN, previousRevision = -1;
/** Interpolate the resolved light and dark ends by theme amount, then publish
 * the five sky steps and surface tokens as CSS custom properties. */
export function applyDesignTheme(amount: number) {
  if (amount === previousAmount && designState.revision === previousRevision) return;
  previousAmount = amount; previousRevision = designState.revision;
  const root = document.documentElement, resolved = currentResolved();
  root.dataset.skyPalette = designParameters.palette; root.dataset.skyStage = designState.stage;
  root.dataset.skyHour = designState.hour.toFixed(2);
  const strength = designStrength();
  const paperLight = resolved.light.surface.paper, paperDark = resolved.dark.surface.paper;
  for (const name of surfaceKeys) {
    const value = mixColors(resolved.light.surface[name], resolved.dark.surface[name], amount);
    const channels = colorRGB(value).join(", ");
    root.style.setProperty(`--theme-${name}`, value);
    root.style.setProperty(`--theme-${name}-rgb`, channels);
    root.style.setProperty(`--sky-${name}-rgb`, channels);
  }
  // Sky steps fade toward the paper surface as the scene weight falls (intro/read).
  for (const name of skySteps) {
    const light = mixColors(paperLight, resolved.light.sky[name], strength);
    const dark = mixColors(paperDark, resolved.dark.sky[name], strength);
    const value = mixColors(light, dark, amount);
    const channels = colorRGB(value).join(", ");
    root.style.setProperty(`--theme-${name}`, value);
    root.style.setProperty(`--theme-${name}-rgb`, channels);
  }
  root.style.setProperty("--sky-presence", String(designParameters.presence));
  root.style.setProperty("--sky-title-scale", String(designParameters.titleScale));
  root.style.setProperty("--sky-strength", String(strength));
  root.style.setProperty("--sky-hour", String(designState.hour));
  const paper = mixColors(resolved.light.surface.paper, resolved.dark.surface.paper, amount);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", paper);
}
