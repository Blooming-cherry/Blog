---
title: 2026-09-07-adaydream-mobile-live2d-fix-log
date: 2026-09-07
layout: page
comments: false
---

# 主站移动端适配 + Live2D 看板娘语音防抖修复日志 — 2026-09-07

## 目标

当天两条主线：

1. **主站导航页移动端适配**（`D:\my-blog\terminal\index.html`）：把 Rhine Lab 主题导航页从桌面优先改成移动优先（手机竖屏 / 平板 / 矮横屏），并修复夜间模式下 crest「分区失效、左边整块填充」与入场动效不出现两个回归。
2. **Live2D 看板娘语音播放防抖修复**（`technical/source/_data/body-end.swig`，本地未提交）：消除看板娘连续触发语音时的 `.wav` 请求堆积与旧冷却逻辑导致的静默/延迟。

---

## 一、主站导航页移动端适配

### 1. 窄屏 / 平板响应式合并（21:24，commit `9c8a6a6`）

- 断点合并为 `max-width: 1024px`，窄屏改单列纵向堆叠：标题/按钮 → 中心图形 → GitHub 文案；
- 窄屏隐藏桌面端绿色 Rhine 水印（顶栏已带 RHINE LAB 品牌）；
- `height: 100vmin` 改为 `min-height: 100svh / 100dvh` 兜底移动端动态地址栏；
- 字号统一改 `clamp()`，消除横向溢出与底部裁切。

### 2. 手机端 v2 重做（22:19，commit `8edf763`）

拆出「手机竖屏（≤600px）」与「矮横屏（landscape 且高 ≤560px）」两套布局：

| 区域 | 手机竖屏行为 |
|---|---|
| 页眉 | 固定高 44px，只留左对齐「RHINE LAB」品牌；Blog / Sonnect / GitHub 按钮移入正文介绍区 |
| 主视觉 | Rhine crest 居中，纯 CSS 缩放入场（`phoneCrestIn`：scale .94→1 + fade），**不走**桌面 JS 手绘 |
| 标题 / 介绍 | ADAYDREAM 居中；下方为「粗体站名链接 + 虚线分隔 + 描述」的介绍行；Lumuen 指 GitHub 仓库 |
| 背景装饰 | 方块细化为低透明度（opacity ≤ .28）背景层，不作为主体 |
| 矮横屏 | crest 居左 + 文字居右的横排紧凑布局，无横向/纵向溢出 |

> v1（`f613e42`）与 v2（`8edf763`）发布后，本地曾出现多次自动 `git revert`（见文末备注）。**最终以 commit `861182c`（含下述两处修复）为准**，该版本为已推送内容。

### 3. 修复一：夜间模式 crest「左边整块填充」丢失分区（commit `861182c`）

**现象**：日间分区正常的 Rhine crest，在手机夜间模式 / 浏览器自动深色下，左边连成整块、看不到镂空分区。

**根因**：分区原本依赖 SVG `<mask>` 内的黑/白镂空；自动深色反色算法反转了 mask 的明度语义，镂空区域被填回 → 整块实心。

**修法**：把「镂空」从 mask 改成**路径真实挖洞** —— 主 crest 路径加 `fill-rule="evenodd"`，并把原镂空子路径并入同一段 `d`，删除 `#rhineHollow` mask。分区因此成为真实几何，任何反色算法都无法破坏。

**验证**：无头 Edge `WebContentsForceDark` 下，修复后 crest 逐像素分区结构与日间完全一致；静态终态与旧 mask 版本在 crest 区域**像素差 0**（桌面亦无回归）。

### 4. 修复二：入场动效在「减弱动效」下不播放（commit `861182c`）

**现象**：手机端 crest / 文字入场动效完全看不到。

**根因**：为尊重系统偏好写的 `@media (prefers-reduced-motion)` 把**所有**动画时长压成 `.001s`；安卓设备一旦开启「减弱动效 / 省电」即命中，入场退化为瞬现。

**修法**：减弱动效下仅收敛大幅/循环类动画；**手机端（竖屏 ≤600 与矮横屏）的 crest / 标题 / 介绍 / 按钮短促入场显式豁免**，仍按约 0.7s 淡入缩放播放。

**验证**：强制 `prefers-reduced-motion` 下，入场 400ms → 900ms 绿墨覆盖 14074 → 21345 持续增长，证明动效确实在播放。

### 5. 上线

沿用 08-13 建立的 GitHub Actions 工作流 `deploy-terminal.yml`：push `terminal/` → rsync 到服务器 `/var/www/adaydream`（宝塔 / Nginx / SSL）。本次最终修复 `861182c` 已推送，线上 `adaydream.cn` 已验证：含 evenodd 挖洞、无 `#rhineHollow` 残留、含 v2 全部标记。

---

## 二、Live2D 看板娘语音防抖修复（body-end.swig · 本地未提交）

看板娘（sagiri 模型，配合 `waifu-tips.js`）点击动作会触发语音。原音频钩子用「7000ms 冷却 + `new Audio(url)` 立即预载」，有两个问题：

1. `new Audio(url)` 默认 `preload="auto"`，构造瞬间就发起 `.wav` 请求 —— 即使后续被冷却丢弃，请求也**已经发出**，网络面板不断堆积；
2. 冷却窗口内的多次点击被直接丢弃 → 快速连点时表现为静默 / 不稳定。

改为**尾部防抖（trailing debounce，600ms）**，并延迟预载：

```js
var DEBOUNCE = 600;                     // 防抖窗口：连续触发只放行最后一次
var pendingPlay = {}, debounceTimer = {};

a.play = function () {
  pendingPlay[model] = a;               // 覆盖为“最后一次”
  if (debounceTimer[model]) clearTimeout(debounceTimer[model]);
  debounceTimer[model] = setTimeout(function () {
    debounceTimer[model] = null;
    var target = pendingPlay[model];
    if (!target) return;
    pendingPlay[model] = null;
    stopOthers(model);
    liveAudios[model].push(target);
    target.preload = 'auto';            // 真正放行才预载，杜绝“丢弃仍发请求”
    _play.call(target).catch(function () {});
  }, DEBOUNCE);
  return Promise.resolve();             // 兼容 waifu-tips 的 play().then() 调用链
};
```

要点：

- 一波连续触发压成**最后一次**播放：N 个请求 → 1 个；
- `preload` 由 `'none'` 延迟到真正放行才切 `'auto'`，从源头消除被丢弃请求；
- `ended` / `pause` 统一走 `cleanup()` 从播放表中移除，避免数组泄漏。

> 状态：该改动目前在 `technical/source/_data/body-end.swig` **本地未提交**（按约定保持 unstaged，待单独验证后再提交）。

---

## 备注：本地出现自动 revert（排查中）

当日对 `terminal/index.html` 的几次提交（`f613e42`、`8edf763`、`861182c`），均在提交/推送后约 **2.5–4 分钟**被本地仓库的一条 `git revert` 撤销（reflog 动作均为 `revert:`），其中一次（`7bf3c3c`）还被 push 到了远端。已排查：无 git hooks、无异常 config、非工作会话所为。远端当前保持最终修复版 `861182c`；本地多余 revert 已被清理。该自动 revert 的来源仍在排查。
