import design from "../design/sky-palettes.json";

export type SkyPalette = keyof typeof design.palettes;
export type DesignStage = "intro" | "archive" | "read" | "focus";
export const designParameters: { palette: SkyPalette; presence: number; titleScale: number } = {
  palette: design.defaults.palette as SkyPalette,
  presence: design.defaults.presence,
  titleScale: design.defaults.titleScale,
};
const stageWeights = { intro: 0, archive: 1, read: .35, focus: 0 };
export const designState = { stage: "intro" as DesignStage, weight: 0, revision: 0 };
export function designStrength() { return designParameters.presence * designState.weight; }
/** Three author parameters, with no visitor menu or independent theme storage. */
export function setDesignParameters(values: Partial<typeof designParameters>) {
  if (values.palette !== undefined) designParameters.palette = values.palette in design.palettes ? values.palette : "dawn";
  if (Number.isFinite(values.presence)) designParameters.presence = Math.max(0, Math.min(1, values.presence!));
  if (Number.isFinite(values.titleScale)) designParameters.titleScale = Math.max(.9, Math.min(1.1, values.titleScale!));
  designState.revision++;
}
/** Optional weight lets the existing scene's progress drive its material relay. */
export function setDesignStage(stage: DesignStage, weight = stageWeights[stage]) {
  weight = Math.max(0, Math.min(1, weight));
  if (designState.stage === stage && Math.abs(designState.weight - weight) < .0001) return;
  designState.stage = stage; designState.weight = weight; designState.revision++;
}
export function currentPalette() { return design.palettes[designParameters.palette]; }
export function colorRGB(hex: string) { return [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16)); }
let previousAmount = NaN, previousRevision = -1;
export function applyDesignTheme(amount: number) {
  if (amount === previousAmount && designState.revision === previousRevision) return;
  previousAmount = amount; previousRevision = designState.revision;
  const root = document.documentElement, palette = currentPalette();
  root.dataset.skyPalette = designParameters.palette; root.dataset.skyStage = designState.stage;
  for (const name of Object.keys(palette.light) as (keyof typeof palette.light)[]) {
    const from = colorRGB(palette.light[name]), to = colorRGB(palette.dark[name]);
    const value = from.map((v, i) => Math.round(v + (to[i] - v) * amount)).join(", ");
    root.style.setProperty(`--theme-${name}`, `rgb(${value})`);
    root.style.setProperty(`--theme-${name}-rgb`, value);
    root.style.setProperty(`--sky-${name}-rgb`, value);
  }
  root.style.setProperty("--sky-presence", String(designParameters.presence));
  root.style.setProperty("--sky-title-scale", String(designParameters.titleScale));
  root.style.setProperty("--sky-strength", String(designStrength()));
  root.style.setProperty("--sky-glass-opacity", String(.74 - .18 * designParameters.presence));
  root.style.setProperty("--sky-read-opacity", designState.stage === "focus" ? "1" : ".96");
}
