import assert from "node:assert/strict";
import * as THREE from "three";
import { ArchiveVisibility } from "../src/archive-visibility.ts";
import { COLUMN_SPACING, ROW_SPACING } from "../src/archive-loop.ts";

// 场景里卡片物理位置的等效公式（scene.ts 的 cellPosition / 实例写入）：
//   x = (lane - 2) * COLUMN_SPACING - trackX
//   z = (row - 15.5) * ROW_SPACING + trackZ
// 候选窗口是这套坐标的逆运算，两边必须同时含 trackX/trackZ，否则阵列移动后
// 候选格会留在原地，画面边缘逐列露空。
const LANE_ORIGIN = 2;
const ROW_ORIGIN = 15.5;
const REST_LIFT = -4.6;
const NEAR = 5;
const xOf = (lane, trackX) => (lane - LANE_ORIGIN) * COLUMN_SPACING - trackX;
const zOf = (row, trackZ) => (row - ROW_ORIGIN) * ROW_SPACING + trackZ;
const keyOf = (cell) => `${cell.lane}:${cell.row}`;
const shiftedKeys = (cells, k, m) =>
  cells.map((cell) => `${cell.lane - k}:${cell.row - m}`).sort();
// 逐格比较，但失败时只报差异摘要 —— 完整的 300 项 diff 读不出问题。
function assertSameSet(actual, expected, message) {
  const seen = new Set(expected);
  const extra = actual.filter((value) => !seen.has(value));
  const kept = new Set(actual);
  const missing = expected.filter((value) => !kept.has(value));
  if (!extra.length && !missing.length && actual.length === expected.length) return;
  assert.fail(
    `${message}: ${actual.length} vs ${expected.length} cells; ` +
      `missing [${missing.slice(0, 6).join(" ")}]; extra [${extra.slice(0, 6).join(" ")}]`,
  );
}

const visibility = new ArchiveVisibility();

function makeView(width, height, detail) {
  const camera = new THREE.PerspectiveCamera(3.0, width / height, NEAR, 300);
  const direction = new THREE.Vector3(
    ...(detail ? [-0.277, 0.238, 0.931] : [-0.81, 0.326, 0.487]),
  ).normalize();
  const distance = detail ? 72 : 140;
  const span = detail ? 5.9 : width < height ? 12 : 7.33;
  camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(span / (2 * distance)));
  camera.position.copy(direction.multiplyScalar(distance));
  camera.lookAt(0, 0, 0);
  camera.updateProjectionMatrix();
  camera.updateMatrixWorld();
  return { width, height, detail, camera, far: distance + 25 };
}

const views = [];
for (const [width, height] of [
  [1920, 1080],
  [2560, 1080],
  [3840, 1080],
  [1400, 1050],
  [1080, 1920],
])
  for (const detail of [false, true]) views.push(makeView(width, height, detail));

const candidatesOf = (view, trackX, trackZ, extra) =>
  visibility.update(view.camera, view.far, trackX, trackZ, extra);
// 实际会被写入实例的集合：候选再用完整卡片包围盒在真实位置裁剪一次。
const drawnOf = (view, trackX, trackZ, extra) =>
  candidatesOf(view, trackX, trackZ, extra).filter((cell) =>
    visibility.intersects(
      xOf(cell.lane, trackX),
      REST_LIFT,
      zOf(cell.row, trackZ),
    ),
  );

const LANE_STEPS = [-100, -15, -10, -5, -1, 0, 1, 5, 10, 15, 100];
const ROW_STEPS = [-100, 0, 100];
const trackOf = (k, m, fx = 0, fz = 0) => ({
  trackX: (k + fx) * COLUMN_SPACING,
  trackZ: (-m + fz) * ROW_SPACING,
});

// ---------- 整数轨道位移：集合必须逐格等价，而不只是数量相等 ----------
let comparisons = 0;
const summaries = [];
for (const view of views) {
  const baseline = {};
  for (const extra of [false, true]) {
    baseline[extra] = {
      candidates: shiftedKeys(candidatesOf(view, 0, 0, extra), 0, 0),
      drawn: shiftedKeys(drawnOf(view, 0, 0, extra), 0, 0),
    };
    assert.ok(
      baseline[extra].drawn.length > 0,
      `Baseline view must draw something (${view.width}x${view.height} detail=${view.detail} extra=${extra})`,
    );
  }
  for (const k of LANE_STEPS)
    for (const m of ROW_STEPS) {
      const { trackX, trackZ } = trackOf(k, m);
      for (const extra of [false, true]) {
        const label = `${view.width}x${view.height} detail=${view.detail} extra=${extra} k=${k} m=${m}`;
        assertSameSet(
          shiftedKeys(candidatesOf(view, trackX, trackZ, extra), k, m),
          baseline[extra].candidates,
          `Candidate window follows the array track (${label})`,
        );
        assertSameSet(
          shiftedKeys(drawnOf(view, trackX, trackZ, extra), k, m),
          baseline[extra].drawn,
          `Drawn cards follow the array track (${label})`,
        );
        comparisons++;
      }
    }
  const drawn = drawnOf(view, 0, 0, false);
  const keys = new Set(drawn.map(keyOf));
  assert.equal(keys.size, drawn.length, "Picking cells stay unique");
  const extra = drawnOf(view, 0, 0, true);
  assert.ok(extra.length >= drawn.length, "Extra coverage never shrinks the set");
  summaries.push({
    width: view.width,
    height: view.height,
    detail: view.detail,
    drawn: drawn.length,
    candidates: candidatesOf(view, 0, 0, false).length,
    extra: extra.length,
  });
}
assert.ok(
  summaries[4].drawn > summaries[0].drawn,
  "Wider view increases archive count",
);
// 覆盖范围随视口变化，既不是写死的 288/317，也不是无界实例池。
assert.ok(
  new Set(summaries.map((s) => s.drawn)).size > 1,
  "Coverage tracks the viewport instead of a fixed card count",
);
assert.ok(
  summaries.every((s) => s.candidates < 5000),
  "Candidate window stays bounded",
);

// ---------- 独立大范围参考格网：候选必须覆盖每一张实际可见的卡片 ----------
// 含分数轨道位移，避免只对整数位移过拟合。
const COVERAGE_CASES = [
  { k: 0, m: 0, fx: 0, fz: 0 },
  { k: -100, m: -100, fx: 0, fz: 0 },
  { k: 100, m: 100, fx: 0, fz: 0 },
  { k: -15, m: 0, fx: 0, fz: 0 },
  { k: 15, m: 0, fx: 0, fz: 0 },
  { k: -1, m: 0, fx: 0, fz: 0 },
  { k: 1, m: 0, fx: 0, fz: 0 },
  { k: 7, m: 3, fx: 0.5, fz: 0 },
  { k: -7, m: -3, fx: 0, fz: 0.5 },
  { k: 5, m: -5, fx: 0.35, fz: -0.65 },
  { k: -2, m: 2, fx: -0.5, fz: 0.5 },
];
const coverageViews = views.filter(
  (view) =>
    !view.detail ||
    (view.width === 1920 && view.height === 1080) ||
    (view.width === 1080 && view.height === 1920),
);
const project = new THREE.Vector3();
const probe = new THREE.Vector3();
for (const view of coverageViews)
  for (const { k, m, fx, fz } of COVERAGE_CASES) {
    const { trackX, trackZ } = trackOf(k, m, fx, fz);
    const candidateKeys = new Set(
      candidatesOf(view, trackX, trackZ, false).map(keyOf),
    );
    const viewProjection = new THREE.Matrix4().multiplyMatrices(
      view.camera.projectionMatrix,
      view.camera.matrixWorldInverse,
    );
    for (const y of [-6, 1.6])
      for (let dl = -22; dl <= 22; dl++)
        for (let dr = -130; dr <= 130; dr++) {
          const lane = k + dl,
            row = m + dr;
          for (const dx of [-2.5, 0, 2.5])
            for (const dy of [0, 3.7])
              for (const dz of [-0.3, 0.3]) {
                probe.set(
                  xOf(lane, trackX) + dx,
                  y + dy,
                  zOf(row, trackZ) + dz,
                );
                const depth = -project
                  .copy(probe)
                  .applyMatrix4(view.camera.matrixWorldInverse).z;
                project.copy(probe).applyMatrix4(viewProjection);
                if (
                  Math.abs(project.x) <= 1.18 &&
                  Math.abs(project.y) <= 1.18 &&
                  depth >= NEAR &&
                  depth <= view.far + 8
                )
                  assert.ok(
                    candidateKeys.has(`${lane}:${row}`),
                    `Missing ${view.width}x${view.height} detail=${view.detail} k=${k} m=${m} fx=${fx} fz=${fz} ${lane}:${row} y=${y}`,
                  );
              }
        }
  }

console.table(summaries);
console.log(
  `Projected coverage, extreme heights, unique picking cells, overscan and ${comparisons} track-translation set comparisons passed.`,
);
