import assert from "node:assert/strict";
import { archiveColumns, columnFiles, fileLocation } from "../src/data.ts";
import {
  fileAtCell,
  selectionCell,
  visibleCell,
  poolCell,
  cellKey,
  contentPeriods,
  contentRowPeriod,
  coordinateShift,
  periodShift,
  rebaseTracks,
  shiftCell,
  wrap,
  HOME_LANE,
  HOME_ROW,
  LOOP_COLUMNS,
  LOOP_ROWS,
  REBASE_THRESHOLD,
} from "../src/archive-loop.ts";

const COLUMN_COUNT = archiveColumns.length;
const COLUMN_FILES = archiveColumns.map((_, lane) => columnFiles(lane).length);
assert.ok(COLUMN_COUNT > 0, "至少要有分类");
assert.ok(COLUMN_FILES.every((count) => count > 0), "真实内容里不应有空分类");

// 「这一格是哪一篇」的寻址规则（fileAtCell 用的就是它）。用 fixture 的篇数重述，
// 好让「多分类、每列篇数不等」也能被检查；归零算法本身一律走生产函数。
const contentIndex = (cell, counts) => {
  const column = wrap(cell.lane, counts.length);
  const files = counts[column];
  return files ? `${column}#${wrap(cell.row - HOME_ROW, files)}` : `${column}#empty`;
};

// 独立的最小公倍数 oracle：按倍数递增试除，不用 gcd —— 与生产实现不同路。
function smallestCommonPeriod(counts) {
  const list = counts.filter(Boolean);
  if (!list.length) return 1;
  let period = list[0];
  for (const count of list.slice(1)) {
    let candidate = period;
    while (candidate % count !== 0) {
      candidate += period;
      if (candidate > Number.MAX_SAFE_INTEGER) return null;
    }
    period = candidate;
  }
  return period;
}

// ---------- 1. 内容周期：列周期与每列篇数 ----------
let seams = 0;
for (let lane = -23 * COLUMN_COUNT; lane <= 23 * COLUMN_COUNT; lane++) {
  const files = columnFiles(wrap(lane, COLUMN_COUNT));
  for (let row = -35; row <= 35; row++) {
    assert.equal(
      fileAtCell({ lane, row }),
      fileAtCell({ lane: lane + COLUMN_COUNT, row }),
      "跨一个分类周期必须是同一篇",
    );
    assert.equal(
      fileAtCell({ lane, row }),
      fileAtCell({ lane, row: row + files.length }),
      "跨该列一个篇数周期必须是同一篇",
    );
    seams++;
  }
}

// ---------- 2. 正反方向逐格切换：断言与列记忆都改用真实数据 ----------
const columnMemory = archiveColumns.map((_, lane) => columnFiles(lane)[0]);
let checks = 0;
const startCell = fileLocation(0);
for (const direction of [-1, 1]) {
  let cell = { lane: startCell.lane, row: startCell.row };
  let index = fileAtCell(cell);
  const memory = [...columnMemory];
  const memorySlot = (value) =>
    wrap(fileLocation(value).lane, COLUMN_COUNT);
  for (let step = 0; step < 10000; step++) {
    const axis = step % 17 < 10 ? "row" : "lane";
    const lane = fileLocation(index).lane;
    if (axis === "row") {
      const files = columnFiles(lane);
      index = files[wrap(files.indexOf(index) + direction, files.length)];
    } else index = memory[wrap(lane + direction, COLUMN_COUNT)];
    const next = selectionCell(index, cell, { axis, direction });
    assert.equal(
      next[axis] - cell[axis],
      direction,
      "跨首尾必须仍沿操作方向移动一格",
    );
    assert.equal(
      fileAtCell(next),
      index,
      "选中的物理格必须装着请求的那一篇",
    );
    memory[memorySlot(index)] = index;
    cell = next;
    checks++;
  }
}

// ---------- 3. 可见窗口与固定参考实例 ----------
for (const center of [
  { lane: HOME_LANE, row: HOME_ROW },
  { lane: -8.3, row: -19.2 },
  { lane: 10002.49, row: -32001.49 },
]) {
  const cells = Array.from({ length: LOOP_COLUMNS * LOOP_ROWS }, (_, i) =>
    visibleCell(i, center),
  );
  assert.equal(new Set(cells.map(cellKey)).size, LOOP_COLUMNS * LOOP_ROWS);
  const lanes = [...new Set(cells.map((c) => c.lane))].sort((a, b) => a - b);
  const rows = [...new Set(cells.map((c) => c.row))].sort((a, b) => a - b);
  assert.equal(lanes.length, LOOP_COLUMNS);
  assert.equal(rows.length, LOOP_ROWS);
  assert.equal(lanes.at(-1) - lanes[0], LOOP_COLUMNS - 1);
  assert.equal(rows.at(-1) - rows[0], LOOP_ROWS - 1);
  assert.ok(lanes[0] < center.lane - 3 && lanes.at(-1) > center.lane + 3);
  assert.ok(rows[0] < center.row - 14 && rows.at(-1) > center.row + 14);
}
for (let i = 0; i < 160; i++) {
  assert.deepEqual(
    poolCell(i),
    { lane: Math.floor(i / 32), row: i % 32 },
    "原片参考实例顺序必须保持",
  );
}

// ---------- 4. 见证：旧的固定 5 列 / 8 篇归零会错档 ----------
// 旧实现把横向按 5 的倍数、纵向按 8 的倍数平移，隐含「五列八篇」的假设。
// 这一节把那个缺陷钉死在测试里，避免常量被改回去。
const LEGACY_LANE_PERIOD = 5;
const LEGACY_ROW_PERIOD = 8;
const legacyShift = (cell) => ({
  lane:
    Math.abs(cell.lane) > REBASE_THRESHOLD
      ? Math.round((cell.lane - HOME_LANE) / LEGACY_LANE_PERIOD) *
        LEGACY_LANE_PERIOD
      : 0,
  row:
    Math.abs(cell.row) > REBASE_THRESHOLD
      ? Math.floor((cell.row - HOME_ROW) / LEGACY_ROW_PERIOD) *
        LEGACY_ROW_PERIOD
      : 0,
});
for (const { counts, cell } of [
  { counts: [19], cell: { lane: HOME_LANE, row: 2049 } },
  { counts: [18], cell: { lane: HOME_LANE, row: 2049 } },
  { counts: [3, 5, 8], cell: { lane: 1, row: 2049 } },
  { counts: [3, 5, 8], cell: { lane: 7, row: 2049 } },
]) {
  assert.notEqual(
    contentIndex(shiftCell(cell, legacyShift(cell)), counts),
    contentIndex(cell, counts),
    `旧算法必须被证明会错档：${counts.join("/")} 篇，格 ${cell.lane}:${cell.row}`,
  );
}
assert.equal(LEGACY_LANE_PERIOD % 3, 2, "旧的横向周期 5 不是三分类周期的整倍数");
assert.equal(LEGACY_ROW_PERIOD % 5, 3, "旧的纵向周期 8 不是五篇列的整倍数");

// ---------- 5. 生产周期取自真实内容 ----------
const periods = contentPeriods();
assert.equal(periods.lane, COLUMN_COUNT, "横向周期就是实际分类数");
if (periods.row === null) {
  assert.ok(
    smallestCommonPeriod(COLUMN_FILES) === null,
    "只有公倍数真的不可精确表示时才允许放弃纵向归零",
  );
} else {
  assert.equal(
    periods.row,
    smallestCommonPeriod(COLUMN_FILES),
    "纵向周期是所有非空列篇数的最小公倍数",
  );
}
for (const counts of [[19], [18], [3, 5, 8], [1, 2, 3], [7], [0, 5], []])
  assert.equal(
    contentRowPeriod(counts),
    smallestCommonPeriod(counts),
    `fixture ${counts.join("/") || "空"} 的周期`,
  );
assert.equal(contentRowPeriod([3000, 3001]), 9003000);
assert.equal(
  contentRowPeriod([2147483647, 4294967291]),
  null,
  "公倍数超出安全整数时不得当成可用周期",
);
assert.equal(
  periodShift(2049, HOME_ROW, null),
  0,
  "没有可用周期时不得归零，而不是按当前列篇数平移",
);

// ---------- 6. 归零前后：真实内容上的文章身份 ----------
const REBASE_ROWS = [
  HOME_ROW,
  0,
  1,
  REBASE_THRESHOLD - 1,
  REBASE_THRESHOLD,
  REBASE_THRESHOLD + 1,
  -(REBASE_THRESHOLD + 1),
  4097,
  -6000,
  1 << 20,
  -(1 << 20),
];
const REBASE_LANES = [
  HOME_LANE,
  0,
  7,
  REBASE_THRESHOLD,
  REBASE_THRESHOLD + 1,
  -(REBASE_THRESHOLD + 1),
  5000,
  -5000,
];
let rebases = 0;
for (const row of REBASE_ROWS)
  for (const lane of REBASE_LANES) {
    const cell = { lane, row };
    const shift = coordinateShift(cell);
    const moved = shiftCell(cell, shift);
    assert.equal(
      fileAtCell(moved),
      fileAtCell(cell),
      `归零前后同一格必须是同一篇：${lane}:${row}`,
    );
    if (Math.abs(lane) <= REBASE_THRESHOLD) assert.equal(shift.lane, 0);
    else assert.equal(wrap(shift.lane, COLUMN_COUNT), 0, "横向归零量是分类数的整倍数");
    if (Math.abs(row) <= REBASE_THRESHOLD) assert.equal(shift.row, 0);
    else
      for (const count of COLUMN_FILES)
        assert.equal(wrap(shift.row, count), 0, "纵向归零量是每一列篇数的整倍数");
    // 归零只能把坐标拉回 home，不能推得更远。
    assert.ok(Math.abs(moved.lane - HOME_LANE) <= Math.abs(lane - HOME_LANE));
    assert.ok(Math.abs(moved.row - HOME_ROW) <= Math.abs(row - HOME_ROW));
    rebases++;
  }

// ---------- 7. 归零之后的下一次正反切换 ----------
for (const direction of [-1, 1]) {
  const cell = { lane: HOME_LANE, row: REBASE_THRESHOLD + 1 };
  const shift = coordinateShift(cell);
  const moved = shiftCell(cell, shift);
  // 周期远小于阈值的两倍时，跨过阈值必然发生纵向归零；周期大到归零帮不上忙
  // （见 periodShift）时返回 0 才是正确行为，不算失败。
  assert.ok(
    periods.row === null ||
      periods.row > 2 * REBASE_THRESHOLD ||
      shift.row !== 0,
    "跨过阈值必须发生纵向归零",
  );
  const files = columnFiles(wrap(cell.lane, COLUMN_COUNT));
  const current = fileAtCell(cell);
  const target = files[wrap(files.indexOf(current) + direction, files.length)];
  const undo = { lane: -shift.lane, row: -shift.row };
  const before = selectionCell(target, cell, { axis: "row", direction });
  const after = selectionCell(target, moved, { axis: "row", direction });
  assert.equal(after.row - moved.row, direction);
  assert.equal(before.row - cell.row, direction);
  assert.equal(
    fileAtCell(after),
    fileAtCell(before),
    "归零后的下一次上下切换必须落到同一篇",
  );
  assert.deepEqual(shiftCell(after, undo), before, "切换后的相对位置也要一致");
  const laneBefore = selectionCell(target, cell, { axis: "lane", direction });
  const laneAfter = selectionCell(target, moved, { axis: "lane", direction });
  assert.equal(fileAtCell(laneAfter), fileAtCell(laneBefore));
  assert.deepEqual(shiftCell(laneAfter, undo), laneBefore);
}

// ---------- 8. 归零保留世界位置、相位与相对距离 ----------
// 场景的补偿走生产函数 rebaseTracks / shiftCell；这里断言它们的不变量。
{
  const cell = { lane: HOME_LANE, row: -(REBASE_THRESHOLD + 2) };
  const shift = coordinateShift(cell);
  const moved = shiftCell(cell, shift);
  const before = {
    origin: { lane: 0, row: 0 },
    laneFocus: HOME_LANE,
    shoulder: cell.row,
    columnCamera: (HOME_LANE - 2) * 5.2 + 3.4, // 阻尼中的任意值，不必等于目标
    rail: -2.17 - (cell.row - 15.5) * 0.62,
  };
  const after = rebaseTracks(shift, before);
  const worldX = (target, columnCamera) => (target.lane - 2) * 5.2 - columnCamera;
  const worldZ = (target, rail) => (target.row - 15.5) * 0.62 + rail;
  const phase = (target, origin) => target.row + origin.row;
  // 世界位置是浮点乘加，容差取 1e-9；相位与相对距离是整数运算，要求严格相等。
  const close = (actual, expected, message) =>
    assert.ok(Math.abs(actual - expected) < 1e-9, `${message}: ${actual} vs ${expected}`);
  close(
    worldX(moved, after.columnCamera),
    worldX(cell, before.columnCamera),
    "横向世界位置必须保持",
  );
  close(
    worldZ(moved, after.rail),
    worldZ(cell, before.rail),
    "纵向世界位置必须保持",
  );
  assert.equal(phase(moved, after.origin), phase(cell, before.origin));
  assert.equal(moved.row - after.shoulder, cell.row - before.shoulder);
  assert.equal(moved.lane - after.laneFocus, cell.lane - before.laneFocus);
  // 归位副本与波纹：逐个用同一个 shiftCell 平移，相对距离不变。
  const outgoing = { lane: HOME_LANE, row: cell.row + 3 };
  const pulses = [{ lane: HOME_LANE, row: cell.row - 4 }];
  const pendingPulse = { lane: HOME_LANE + 1, row: cell.row - 4 };
  const ripple = (a, b) => Math.hypot(a.row - b.row, (a.lane - b.lane) * 2.2);
  assert.equal(
    ripple(shiftCell(outgoing, shift), moved),
    ripple(outgoing, cell),
    "归位副本与选中档案的相对距离必须保持",
  );
  for (const pulse of pulses)
    assert.equal(
      ripple(shiftCell(pulse, shift), moved),
      ripple(pulse, cell),
      "波纹到选中的相对距离必须保持",
    );
  assert.equal(
    ripple(shiftCell(pendingPulse, shift), moved),
    ripple(pendingPulse, cell),
    "待发波纹的相对距离必须保持",
  );
}

console.log(
  JSON.stringify(
    {
      columns: COLUMN_COUNT,
      filesPerColumn: COLUMN_FILES,
      seams,
      directionalMoves: checks,
      rebaseCases: rebases,
      contentPeriods: periods,
      poolSize: LOOP_COLUMNS * LOOP_ROWS,
      referenceInstances: 160,
      checks: "passed",
    },
    null,
    2,
  ),
);
