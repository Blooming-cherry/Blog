import content from "../content/archives.json" with { type: "json" };

// 原型版（throwaway）：字段收敛为散文预览需要的五个 ——
// title / date / description（诗引）/ tag / subtitle，外加 id、slug、category 三个内部字段。
export interface ArchiveRecord {
  id: string;
  title: string;
  date: string;
  subtitle: string;
  description: string;
  tag: string;
  slug: string;
  category: string;
}

export const records: ArchiveRecord[] = content.records;
export const categories = ["全部档案", ...content.categories];
export const archiveColumns = content.columns;

// 阵列的 x 原点在 lane 2（scene.ts 的 x = (lane - 2) * COLUMN_SPACING）。
// 单列时若把这一列放在 lane 0，它会落在屏幕外 —— 视锥里根本没有那条 lane。
// 所以单列必须落位到 2，与阵列原点重合。
const HOME_LANE = 2;

export function columnFiles(lane: number) {
  return records
    .map((record, index) => ({ record, index }))
    .filter(
      ({ record }) =>
        record.category === archiveColumns[wrapLane(lane)],
    )
    .map(({ index }) => index);
}
function wrapLane(lane: number) {
  const n = archiveColumns.length;
  return ((lane % n) + n) % n;
}
export function fileLocation(index: number) {
  const lane =
    archiveColumns.length === 1
      ? HOME_LANE
      : archiveColumns.indexOf(records[index].category);
  const row = 12 + columnFiles(lane).indexOf(index);
  return { lane, row, slot: lane * 32 + row };
}
export function fileAtSlot(slot: number) {
  const files = columnFiles(Math.floor(slot / 32));
  return files[Math.max(0, Math.min(files.length - 1, (slot % 32) - 12))];
}
