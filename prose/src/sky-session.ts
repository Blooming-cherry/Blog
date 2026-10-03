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
}
export function readArchiveSnapshot(): ArchiveSnapshot | undefined {
  try {
    const value = JSON.parse(sessionStorage.getItem(archiveSessionKey) ?? "null");
    if (value?.version !== 1 || !value.entered || typeof value.selectedId !== "string") return;
    if (value.cell && (!Number.isFinite(value.cell.lane) || !Number.isFinite(value.cell.row))) delete value.cell;
    return value;
  } catch { return; }
}
export function writeArchiveSnapshot(value: ArchiveSnapshot) {
  try { sessionStorage.setItem(archiveSessionKey, JSON.stringify(value)); } catch { /* Navigation also works without storage. */ }
}
export function applyAuthorParameters(params: URLSearchParams, restored?: ArchiveSnapshot) {
  if (restored?.parameters) setDesignParameters(restored.parameters);
  const values: Partial<typeof designParameters> = {};
  if (params.has("palette")) values.palette = params.get("palette") as typeof designParameters.palette;
  if (params.has("presence") && params.get("presence")?.trim()) values.presence = Number(params.get("presence"));
  if (params.has("titleScale") && params.get("titleScale")?.trim()) values.titleScale = Number(params.get("titleScale"));
  setDesignParameters(values);
}
export function readingHref(href: string) {
  const url = new URL(href, location.href);
  for (const [name, value] of Object.entries(designParameters)) url.searchParams.set(name, String(value));
  return url.href;
}
