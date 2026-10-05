import { createSkyPoolState } from "../design/sky-pool-state.mjs";
export const skyPoolState = createSkyPoolState();

import { designParameters, setDesignParameters } from "./sky-design";

/** Per-tab navigation context; theme and motion continue to use rhine-settings. */
export const archiveSessionKey = "rhine-archive-session";
export interface ArchiveSnapshot {
  version: 1;
  entered: boolean;
  selectedId: string;
  selectedIndex: number;
  cell?: { lane: number; row: number };
  columnMemory: number[];
  parameters: typeof designParameters;
  archiveUrl: string;
  /** Visible seconds of the shared sky drift; relays the phase across documents. */
  skyPhase?: number;
}
export function readArchiveSnapshot(): ArchiveSnapshot | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(archiveSessionKey) ?? "null");
    if (value?.version !== 1 || !value.entered || typeof value.selectedId !== "string") return;
    if (value.cell && (!Number.isFinite(value.cell.lane) || !Number.isFinite(value.cell.row))) delete value.cell;
    if (!Number.isFinite(value.skyPhase) || value.skyPhase < 0) delete value.skyPhase;
    return value;
  } catch { return; }
}
export function writeArchiveSnapshot(value: ArchiveSnapshot) {
  try { sessionStorage.setItem(archiveSessionKey, JSON.stringify(value)); } catch { /* Navigation also works without storage. */ }
}
export function applyAuthorParameters(params: URLSearchParams, restored?: ArchiveSnapshot) {
  if (restored?.parameters) {
    const author = { ...restored.parameters };
    if (!["dawn", "tea", "slate"].includes(author.palette)) author.palette = "dawn";
    setDesignParameters(author);
  }
  const values: Partial<typeof designParameters> = {};
  if (params.has("palette")) values.palette = (["dawn", "tea", "slate"].includes(params.get("palette") ?? "") ? params.get("palette") : "dawn") as typeof designParameters.palette;
  if (params.has("presence") && params.get("presence")?.trim()) values.presence = Number(params.get("presence"));
  if (params.has("titleScale") && params.get("titleScale")?.trim()) values.titleScale = Number(params.get("titleScale"));
  const state = skyPoolState.restore();
  if (state.pool === "B") values.palette = state.palette as typeof designParameters.palette;
  setDesignParameters(values);
}
export function readingHref(href: string) {
  const url = new URL(href, location.href);
  for (const [name, value] of Object.entries(designParameters)) url.searchParams.set(name, String(value));
  // Relay a fixed author-review hour across documents so the sky stays continuous.
  const hour = new URLSearchParams(location.search).get("hour");
  if (hour !== null) url.searchParams.set("hour", hour);
  return url.href;
}
