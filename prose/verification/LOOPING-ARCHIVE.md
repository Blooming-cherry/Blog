# 循环档案阵列验证

开发分支：codex/looping-archive，基于查看器光照修订 6d01e1f。

## 逻辑与实际场景

- scripts/check-loop.mjs：正反两个方向合计 20,000 次切换，检查跨首尾始终沿操作方向移动一个位置、内容对应正确、负坐标周期映射、窗口无重复和缺列；通过。
- reference/loop-review.html：使用实际 ArchiveScene 完成 61 次移动，反复跨过上下、左右边界；固定实例池为 288，归位副本最终归零；通过。
- 在循环位置进入详情可获得 4.05 的完整抬起与旋转净空；收回期间在原高度先转正，快速重新选中恢复归位副本的高度；通过。
- 将逻辑位置推至数千行列后进行坐标重置，实际位置、速度和呼吸相位保持不变，误差小于 1e-9；通过。
- 循环后重播原片，检查原片 27.60、29.16、31.56、39.00 秒的阵列：159 个背景位置加一个抽出模型，额外列全部隐藏，位置误差最大约 5.48e-7；通过。

## 页面实测

- 从机构档案第一份按上键，选中第八份 X-018，物理行由 12 前进到 11。
- 连续向左跨过第一列，选中特别项目 X-008，物理列为 -1，阵列仍覆盖画面。
- 向右返回机构档案，恢复 X-018 的选择；连续向下八次仍按同一方向运行并回到相同内容。
- 点击画面中的卡片可正确选中 X-013；向右循环五列后仍保留该档案，详情页和 360° 查看器均显示相应编号与标题。
- 实际截图检查了初始、越界后和循环后的阵列，未出现可见队列尽头。

## 回归

- check-archive.mjs、check-appearance.mjs、check-motion.mjs 通过。
- TypeScript 与 Vite 构建通过；仍有既有的包体积提示。
- 原有 Blender 模型资源未修改。

---

# 循环阵列越界修复 · 2026-09-26

基线 `186d304`。用户报告「文苑实时渲染动画无法循环而越出界面」。查出两个独立缺陷，均已修复；本轮停在本地未提交状态，未部署。

## 主因：候选列求逆漏掉 trackX

`src/archive-visibility.ts` 用世界空间视锥范围反推候选列号，却没有加回 `trackX`；而同文件与 `src/scene.ts` 的实际绘制位置是 `x = (lane - 2) * COLUMN_SPACING - trackX`。阵列作为整体横向平移（自由平面拖动与惯性都会改变物理 lane），候选列却留在原地，进入视锥的格子随之减少，直到整屏没有卡片。

RED（修复前，均直接运行真实 `ArchiveVisibility`）：

- `node --experimental-strip-types scripts/check-archive-visibility.mjs` → 退出码 1，`Whole-cell track movement preserves view coverage: 30 !== 317`（旧断言）。
- 增强后的同一脚本在 1920×1080 预览相机、k = −100 时得到空集合（`0 vs 317`），退出码 1。

修复：只给 `minLane` / `maxLane` 加回 `trackX`，overscan、卡片包围盒与视锥裁剪一概不动。

GREEN：退出码 0。660 组逐格集合比较（11 个横向整数位移 × 3 个纵向整数位移 × 标准／额外余量 × 5 种分辨率 × 预览／详情）在候选集合与实际相交集合上分别断言「平移后的 `(lane−k, row−m)` 集合等于基线」，不是只比数量；另有 11 个位移（含 k + 0.5、z + 0.5 一类分数位移）的大范围参考格网覆盖检查，避免只对整数位移过拟合。

修复后 1920×1080 横移 0 / 5 / 10 / 15 / −15 / 100 列的可绘制卡片均为 317，候选恒为 454：覆盖随视口变化，不锁定固定值，也不随累计位移增长。修复前同一测量的对照值（横移 0 / 5 / 10 / 15 列 = 317 / 229 / 30 / 0）来自 SPEC 记录。

## 次因：坐标归零仍按旧「五列八篇」

`src/scene.ts` 的 `rebaseCoordinates` 在坐标超过 ±2048 后横向按 5、纵向按 8 的倍数平移全部逻辑坐标。实际内容寻址（`archive-loop.ts` 的 `fileAtCell`）按当前分类数与该列篇数循环，两者早已不一致：视觉位置保住了，文章身份却换人。

实测（本机生成物 19 篇）：`row 2049` 归零 2040 行后，`W-005 庖鱼及宾` 变成 `W-017 林深见鹿`；抽样的 5 个归零格 5/5 错档。

修复（`src/archive-loop.ts` 新增纯函数）：横向周期 = 实际分类数；纵向周期 = 所有非空列篇数的最小公倍数（`contentRowPeriod`，超出安全整数则返回 `null`）。`periodShift` 取离 home 最近的整周期倍数，因此归零只会把坐标拉回、不会推远；公倍数不可精确表示或不适合阈值时返回 0，即「宁可不动，也不按当前列篇数平移」。世界位置、弹簧值、波纹相对距离与呼吸相位的补偿集中到 `rebaseTracks`，速度不做任何缩放；`scene.ts` 只改用这些函数，补偿公式逐项保持不变。

GREEN 后（生成物 19 篇时测得）：`row 2049` → shift 2033 → `row 16`，仍是 `W-005`；`−2049`、`4097`、`−6000`、`3000` 同样一致，5/5 全对。构建把生成物重写为 18 篇后周期自动变为 18，同一格变为 shift 2034 → `row 15`，仍是同一篇。测试不硬编码 18 或 19。

## 命令与退出码

| 命令 | 修复前 | 修复后 |
| --- | --- | --- |
| `node --experimental-strip-types scripts/check-archive-visibility.mjs` | 1 | 0 |
| `node --experimental-strip-types scripts/check-loop.mjs` | 1（旧断言 `10 !== 1`；增强后 `5 !== 1`） | 0 |
| `npm run check:content` | 未运行 | 0 |
| `npm run check:viewport` | 未运行 | 0 |
| `npm run build`（含 `tsc`） | 未运行 | 0 |

`npm run build` 输出 `写入 18 篇 → content/archives.json`、`正文页 18 篇 → dist/w-001 … w-018`；构建后再跑两个脚本仍然通过，`filesPerColumn` 由 19 变 18，周期随之跟随。

## 测试改为数据驱动

`check-loop.mjs` 的分类数、各列篇数、列记忆下标全部改为真实内容数据（`HOME_LANE` 是物理落位，记忆数组下标要 `wrap`）；周期用独立的「按倍数递增试除」oracle 反查，不复用生产的 gcd；归零回归覆盖 19 篇、18 篇、负行号、±2048 阈值两侧、以及 3 / 5 / 8 篇的不等篇数 fixture 和公倍数溢出 fixture，fixture 不写回 `content/archives.json`。旧的固定 5 / 8 算法作为「必须被证明会错档」的见证留在测试里，免得常量被改回去。固定参考实例 `poolCell(0..159)` 与原片分支的断言保持原样。

## 未覆盖与局限

- 浏览器实测（Edge 连续同向拖动 20 个物理列再反向、快速释放惯性、斜向、拖动中反转、重新按住接管、2560×1080 与 390×844 边缘覆盖、详情进出与重播、减少动态效果与完整动效）由 Codex 执行。本轮只有模块级与几何级验证，不能当作运行时验收。
- `reference/loop-review.html` 在当前检出的 `reference/` 中不存在，历史「通过」不代表本轮结果。
- `check-archive.mjs`（第 20 行 `records.length === 40`、第 24 行「每列八篇」）与 `check-appearance.mjs`、`check-decryption.mjs`（`appearance.ts` 无扩展名导入 `./theme-material`，Node ESM 下无法解析）仍然失败。三者与本次改动无关，也不在允许改动范围内，未修改。
- 主题渐变 `ThemeWave` 的 origin 不随归零平移：渐变进行中（约 0.85 秒）若正好触发归零，颜色延迟会按新的绝对距离重算。`theme-motion.ts` 不在允许改动范围内。
- 壁纸音乐接力的 `relayLifts` 以绝对 `cellKey` 为键，同样不随归零平移；仅在 Wallpaper Engine 构建且开启音乐律动时可达。
- 线上 `https://blog.adaydream.cn/prose/` 仍是修复前的构建，本次未提交、未推送、未部署。

---

# 复核批注 · 2026-09-26（二次核对）

> **本节定位**：只做**增量批注**，不改动上方任何原文。上方「循环阵列越界修复 · 2026-09-26」写于基线 `186d304`，其结论经复核**全部成立**；但其中若干**数字**因基线前移（成因见 A1）已不再是当前检出的事实，故在此给出新值与来源。原文保留不改，便于逐条对照。
>
> **复核环境**：Windows 11 · node `v24.16.0` · 复核时 `HEAD = e19e42c59a63ef75fc047ab21fb9e1070c321df7`
>
> **复核时点文件 sha256**（Codex 可据此确认审的是同一份内容；本文件自身因追加本节而哈希变化，故不列入）：
>
> ```
> f4363392784f193a597a1f8796071be740ae6641dd1ba249767f082d6584ab94  prose/src/archive-loop.ts
> 8f19972332a6d2bfa35ecb8ff30ad3099c792f6e2ff776d45f3a34c0095d3b41  prose/src/archive-visibility.ts
> 648962810265453f0fc50a564927930eeae3581cb96f9831d9752030c7be7aea  prose/src/scene.ts
> 686536bcf05fd44ee450f101599742df6105934885cff3f6a3561eeab1542386  prose/scripts/check-loop.mjs
> f368e5a246e488935f6da9bb64b575a9f40894c8d9a26a457cd025ff9ec96a69  prose/scripts/check-archive-visibility.mjs
> ```
>
> **复核方式**：原文每条主张均重新执行；凡涉及"与本次改动无关"的判断，用 stash 对照法（A5）。下文每个数字都带「来源」，可逐条重跑。

## A1 篇数与周期：18 → 20（基线前移，非修复缺陷）

**当前实测值**：构建写入 **20 篇**；`filesPerColumn = [20]`；`contentPeriods = { lane: 1, row: 20 }`。

**成因**：复核前执行了 `git pull --ff-only origin main`（`186d304 → e19e42c`），带入两个新内容源 —— `technical/source/_posts/翩翩不富.md`、`technical/source/_prose/困于葛藟.md`。算式与原文一致，只是输入变了：

```
源 18(_posts) + 4(_prose) = 22 篇
减 prose: false 两篇（月寒日暖，来煎人寿 / 百衲成衣）= 20 篇
（原文当时：17 + 3 = 20，减 2 = 18 篇）
```

**受影响的原文数字**：

| 原文写的 | 当前实测 |
| --- | --- |
| `npm run build` 输出「写入 18 篇」「正文页 18 篇 → dist/w-001 … w-018」 | 「写入 **20** 篇」「正文页 **20** 篇 → dist/w-001 … w-020」 |
| 周期自动变为 18；同一格 `shift 2034 → row 15` | 周期 **20**；`row 2049` → `shift 2040` → `row 9` |

**结论不受影响，且被加强**：原文「测试不硬编码 18 或 19」经复核成立 —— 在 20 篇下两个脚本仍全绿、周期自动跟随为 20。这是原文未展示的第三个数据点。

**来源**
- `npm run build` → 退出码 `0`，stdout 含 `写入 20 篇 → content/archives.json`、`正文页 20 篇 → dist/w-001 … w-020`
- `node --experimental-strip-types scripts/check-loop.mjs` → 退出码 `0`，stdout 含 `"filesPerColumn": [20]`、`"contentPeriods": {"lane": 1, "row": 20}`
- `node --experimental-strip-types -e "…import('./scripts/prose-source.mjs')…loadRecords()…"` → `20`
- 源计数：`git ls-tree -r --name-only 186d304 technical/source/_posts | wc -l` → `17`，当前 `ls technical/source/_posts/*.md | wc -l` → `18`（`_prose` 为 `3` → `4`）
- 排除项：`grep -rln "^prose:[[:space:]]*false" technical/source/_posts/ technical/source/_prose/` → 命中 `月寒日暖，来煎人寿.md`、`百衲成衣.md`

## A2 编号映射：原文举例的两个篇目已移位

原文以「`W-005 庖鱼及宾` 变成 `W-017 林深见鹿`」举例。20 篇下的实际编号：

| 篇目 | 20 篇下 | 原文（19 篇状态） |
| --- | --- | --- |
| 庖鱼及宾 | W-004 | W-005 |
| 林深见鹿 | W-016 | W-017 |
| 白马翰如 | W-005 | — |
| 西西弗斯 | W-017 | — |

举例的**语义不变**（旧 ÷8 算法会把文章换成别人），只是具体篇名随内容集前移。A4 在 20 篇下另给了一份"旧算法换成谁"的实测实例。

**来源**：`npm run build` 后执行 `node -e "const a=require('D:/my-blog/prose/content/archives.json'); a.records.forEach((r,i)=>console.log(r.id, r.title))"`

## A3 命令复跑：5 条全部退出码 0，与原文一致

| 命令 | 原文 | 复核实测 |
| --- | --- | --- |
| `node --experimental-strip-types scripts/check-archive-visibility.mjs` | 0 | **0** |
| `node --experimental-strip-types scripts/check-loop.mjs` | 0 | **0** |
| `npm run check:content` | 0 | **0**（`tests 16 / pass 16 / fail 0`） |
| `npm run check:viewport` | 0 | **0** |
| `npm run build`（含 `tsc`） | 0 | **0** |

原文另两个可核对的数字也已复现：`check-archive-visibility` 表格中 1920×1080 预览相机一行为 `drawn 317 / candidates 454`；脚本末行自报 `660 track-translation set comparisons passed`（11 横向 × 3 纵向 × 2 余量 × 5 分辨率 × 2 模式 = 660，算术自洽）。

**来源**：逐条执行上表命令并记录 `$?`；数字取自各命令 stdout。

## A4 独立复核：归零后的文档身份保持（自带 oracle，不复用被测代码）

原文的 GREEN 由被测方自己的测试给出，复核另写了一份最小 oracle，并**先自测再用**：

```
自测（拿已知答案 assert 自己）：fileAtCell(row 12) → 0、row 13 → 1、row 32 → 0  ✅
```

注意 `columnFiles()` 返回的是**记录下标数组**，`fileAtCell()` 的返回值是**数字**而非记录对象 —— 首版复核脚本在数字上取 `.id` 得到 `undefined`，造成 `undefined === undefined` 的**假通过**（全绿但什么也没验）。修正后：

| `row` | shift | 归零后 `row` | 新算法 | 旧 ÷8 算法 |
| --- | --- | --- | --- | --- |
| 2049 | 2040 | 9 | W-018 向晦宴息 ✅ 保持 | W-006 芭蕉雨 ❌ 错档 |
| −2049 | −2060 | 11 | W-020 翩翩不富 ✅ | W-004 庖鱼及宾 ❌ |
| 4097 | 4080 | 17 | W-006 芭蕉雨 ✅ | 碰巧对 |
| −6000 | −6020 | 20 | W-009 花瓣的游行 ✅ | W-005 白马翰如 ❌ |
| 3000 | 2980 | 20 | W-009 花瓣的游行 ✅ | W-005 白马翰如 ❌ |
| 2050 | 2040 | 10 | W-019 困于葛藟 ✅ | W-007 朱绂方来 ❌ |
| 4096 | 4080 | 16 | W-005 白马翰如 ✅ | 碰巧对 |
| 12 | 0 | 12 | W-001 贲于丘园，朱绂方来 ✅ | 无位移 |

**新算法 8/8 保持文档身份；旧算法 5/8 错档**（"碰巧对"的三例为 `4096`、`4097` 与无位移的 `12`）—— 原文「旧的固定 5 / 8 算法…作为必须被证明会错档的见证」成立。

另独立复测 `contentRowPeriod` 边界（原文未给具体值）：`[3,5,8] → 120`、`[0,7] → 7`、`[] → 1`、三个互质大数 `→ null`。全部符合该函数文档所述。

**来源**：临时脚本 `prose/.tmp-verify-period.mjs`（复核后已删除），`node --experimental-strip-types` 运行，退出码 `0`。

## A5 勘误：仍失败的脚本是 19 个，不是 3 个

原文「未覆盖与局限」只点名 `check-archive.mjs`、`check-appearance.mjs`、`check-decryption.mjs` 三个失败脚本，措辞为"三者与本次改动无关"。实际 `prose/scripts/` 下有 **30 个** `check-*.mjs`。

复核用 **stash 对照法**（先把本组 6 个文件备份并记录 sha256，再 `git stash push` 掉，跑完 `git stash pop`，逐文件校验还原）：

| | 通过 | 失败 |
| --- | --- | --- |
| 无本组改动 | 9 | **21** |
| 有本组改动 | 11 | **19** |

逐脚本比对：**30 个里只有 2 个受本组改动影响** —— `check-archive-visibility.mjs`（`1 → 0`）、`check-loop.mjs`（`1 → 0`），其余 **28 个状态一字未变**。

**结论**：原文"与本次改动无关"这一判断**正确**，但给出的**规模严重偏小**。读者会以为仓库只有 3 个坏脚本，实际有 19 个（本组改动修好 2 个之前是 21 个）。

仍失败的 19 个（有本组改动时）：

```
check-appearance.mjs        check-archive-diagonal.mjs   check-archive-momentum.mjs
check-archive.mjs           check-array-input.mjs        check-bottom-insets.mjs
check-dark-index.mjs        check-decryption.mjs         check-font-loading.mjs
check-font-update.mjs       check-pwa-recovery.mjs       check-pwa.mjs
check-responsive.mjs        check-selection-state.mjs    check-startup-entry.mjs
check-startup-motion.mjs    check-super-performance.mjs  check-three-release.mjs
check-web-integration.mjs
```

其中原文点名的三个，复核确认了原文给出的细节：`check-archive.mjs` 第 20 行确为 `assert.equal(records.length, 40)`、第 24 行确为 `assert.equal(files.length, 8, "Every column has eight readable files")`；`check-appearance.mjs` / `check-decryption.mjs` 的报错原文为 `Cannot find module 'D:\my-blog\prose\src\theme-material' imported from D:\my-blog\prose\src\appearance.ts`。三者均退出码 1。

**来源**：`for s in scripts/check-*.mjs; do node --experimental-strip-types "$s" >/dev/null 2>&1; echo "$s=$?"; done` 两轮（stash 前后各一轮），输出逐行 join 比对。原始对照文件 `/tmp/codes-without-agroup.txt`、`/tmp/codes-with-agroup.txt`（本机临时目录，重启即失；重跑即得）。

## A6 原文未提：测试读的是**生成的** `archives.json`，陈旧时会静默测另一套内容

`check-loop.mjs` 的数据来自 `../src/data.ts`，而 `data.ts` 首行是 `import content from "../content/archives.json"` —— 即**构建生成物**。两个脚本都不自行重建它（`check-loop.mjs` 内无任何写文件调用，已确认）。

后果：生成物陈旧时测试**不报错**，只是拿另一套篇数/周期在跑。复核时实际撞上过：源已是 20 篇，而 `content/archives.json` 仍是拉取前的 18 条，`check-loop.mjs` 便报 `row: 18` 并"通过"。

建议在报告或 `README` 记一句：**跑 `check-loop.mjs` / `check-archive-visibility.mjs` 前先 `npm run build`**（或至少 `node scripts/prose-content.mjs`）。

**来源**：`grep -n "archives.json" src/data.ts` → 第 1 行 `import content from "../content/archives.json" with { type: "json" }`；`grep -nE "writeFile|unlink|rm\(" scripts/check-loop.mjs` → 无命中；实测：未重建时 `contentPeriods.row = 18`，`npm run build` 后同命令为 `20`。

## A7 原文未列：`data.ts` 里另有一份 `HOME_LANE` 与硬编码的 `12`

原文把横向/纵向归零周期收敛为 `archive-loop.ts` 的常量与纯函数（`HOME_LANE = 2`、`HOME_ROW = 12`）。但 `src/data.ts` 中存在**第二份**：

```ts
const HOME_LANE = 2;                                  // data.ts 私有，与 archive-loop 的导出同名同值
export function fileLocation(index: number) {
  const row = 12 + columnFiles(lane).indexOf(index);   // 字面量 12，未用 HOME_ROW
  ...
}
```

`fileLocation` 供选中/相机定位使用，`fileAtCell` 供内容寻址使用。二者今天都是 `2` / `12`，**当前不是缺陷**；但 `HOME_ROW` 一旦改动，`fileLocation` 会与 `fileAtCell` 静默脱钩 —— 正是本次修掉的那类"视觉位置与内容身份分家"。原文未将其列入"未覆盖与局限"。

**来源**：`sed -n '16,45p' src/data.ts`；`grep -n "HOME_LANE\|HOME_ROW" src/*.ts`。

## A8 本文件前半部分（`codex/looping-archive` / `6d01e1f` 基线）应视为作废

前半部分（「逻辑与实际场景」「页面实测」「回归」三节）写于另一基线，与本轮结论**互相矛盾**，且其引用的对象已不存在：

- 旧「回归」称 `check-archive.mjs`、`check-appearance.mjs`、`check-motion.mjs` **通过**；A5 实测前两者**退出码 1**。
- 旧节引用的 `reference/loop-review.html` 在当前检出中不存在 —— `prose/reference/` 整个目录都不存在。
- 旧节引用的 `check-motion.mjs` 在当前 `scripts/` 中不存在（现有 30 个脚本无此名）。

建议给旧三节加一条抬头：「以下为 `6d01e1f` 基线结论，已被 2026-09-26 一节及其复核取代」。本次批注**不改动**它们，仅在此登记。

**来源**：`ls reference/` → `No such file or directory`；`ls scripts/check-*.mjs | wc -l` → `30`，其中无 `check-motion.mjs`。

## A9 复核动作的副作用登记

供 Codex 判断工作区状态：

1. **构建产物已重建**（未跟踪文件，不影响被 git 跟踪的内容）：`prose/content/archives.json` 由 18 条 → **20 条**；`prose/dist/` 重新生成（`正文页 20 篇`、`附件目录 6/6`、`Offline release 612b4ecf42ceeafa: 798 files, 33.8 MiB`）。
2. **4 个文件的换行由 CRLF 归一为 LF**：`src/archive-loop.ts`、`src/archive-visibility.ts`、`src/scene.ts`、`verification/LOOPING-ARCHIVE.md`。成因是 A5 的 stash/pop 往返让 git 依 `.gitattributes` 触碰了这些文件。**内容逐字节一致**（`diff --strip-trailing-cr` 通过），5 个代码文件的 `git diff --numstat` 与复核前完全相同（`205/33`、`278/14`、`107/1`、`4/2`、`25/30`），工作区现已无 CRLF 警告 —— 与 `.gitattributes`「文本以 LF 检出」一致。本文件自身的 numstat 因追加本节而增加，属预期。
3. **临时脚本已删除**：`prose/.tmp-verify-period.mjs`、`prose/.tmp-probe.mjs`（用后即删，未留在工作区）。
4. **工作区仍只有原文所述的 6 个文件被修改**，未新增未跟踪文件。
5. 复核**之前**（用户指示，非本次复核所为）：`_posts/` 下 `十朋之龟.md`、`松花酿酒，春水煎茶.md`、`林深见鹿.md` 三个文件曾是"仅 CRLF、零内容差异"的假 diff，已丢弃并归一为 LF，故当前不再出现在 `git status` 中。
