---
title: 2026-09-18-blog-mobile-crash-remediation
date: 2026-09-18
layout: page
comments: false
---

主站手机端闪退，最后并不是靠“关掉某个特效”草草收场，而是落在了一个更具体的问题上：PJAX 让一部分本该只初始化一次的东西，随着每次页面切换被线性地重复执行。这篇文章记录一次围绕移动端资源泄漏的定位、修复与回归，尽量把“已经确认的事实”和“由数据支持的判断”分开写。

## 症状与第一轮排查

反馈集中在移动端：浏览主站首页和文章页时，页面会卡顿甚至直接被系统杀掉。这里先说明一个边界——桌面 Edge 的移动仿真并没有直接复现浏览器进程崩溃，自动化环境里能稳定观察到的，是异常的资源加载和 PJAX 带来的线性累积。因此本文不把“抓到了崩溃堆栈”当作结论，真机上的低内存与 GPU 压力导致系统杀页，是一组 A/B 数据支持的根因判断，而不是从崩溃日志里直接读出来的事实。

顺着这个方向排查，问题很快清晰起来。主站基于 Hexo/NexT，`body-end` 的内容被放在 `#pjax` 容器内，并且每次 `pjax:success` 都会重新执行其中的脚本。这本来是为了让切换后的页面重新挂上交互，但副作用是：凡是缺乏单例保护的初始化逻辑，都会在“首页 → 文章 → 返回首页”这类往返里被重复触发一次。

## RED：旧版究竟泄漏了什么

在旧版线上环境里，用 390×844、DPR 3、Android UA 跑一遍“首页 → 第一篇文章 → 返回首页”，可以稳定地看到：

- `#waifu`：1 → 2 → 3
- `#live2d`：1 → 2 → 3
- `#mouseTrail`：1 → 1 → 1

Live2D 的重复实例是首要嫌疑。它在窄屏下只是通过 CSS 隐藏了视觉层，但 JavaScript、样式、模型、纹理和 800×800 的 canvas 全部照常初始化；更麻烦的是，首屏同时存在静态 `live2d.min.js` 和 `initWidget({ cubism2Path })` 的运行时加载两条路径。桌面端旧版同样出现 Live2D 1 → 2 → 3，说明这是一个 PJAX 幂等性问题，而不只是媒体查询在移动端没生效。

A/B 诊断把资源开销量化了出来：启用与阻断 Live2D 时，页面总资源编码字节约为 3,542,875 对 1,046,095，20 秒内的脚本时间约为 0.486 秒对 0.026 秒；其中一个模型纹理是 2048×2048，压缩传输约 2.22 MiB，解码成 RGBA 后约 16 MiB。对一个本就紧张的移动端内存预算来说，这不再是“看不见所以无所谓”的隐藏元素。

音频路径是另一条独立的资源压力。迷你播放器在用户还没点击时就设置了首曲音频源，源 WAV 的 `Content-Range` 总大小为 63,338,906 字节，一次 30 秒观察中已传输约 4,628,523 编码字节。对返回用户预置 `{i:0,t:12,p:true}` 后，旧版在零交互的情况下就发出了 `/audio/125042` 以及上游 WAV 请求。

除此之外还有两类累积：页脚署名的 `pjax:success` 监听器会重复注册，本地探针观察到手机从 2 → 3 → 4、桌面从 3 → 4 → 5；Siren 的 `music.json` loader 位于 PJAX 片段内，在无缓存或失败回退场景下，本地 RED 中每次页面交换都会重新请求，共 3 次。最后，公网 HTTP 检查没有发现首页 5xx、重定向循环或 Service Worker 缓存循环，所以服务端可用性并不是已经发现的主因。

## 修复：把“只该发生一次的事”真正变成一次

修复的核心不是按 UA 字符串粗暴地关掉功能，而是让初始化具备幂等性，同时让移动端在源头就不加载它用不到的东西。

桌面视觉效果用一条能力查询作为总开关：

```js
window.matchMedia('(min-width: 769px) and (hover: hover) and (pointer: fine)').matches
```

命中“真正的桌面”环境才继续。手机或粗指针环境下，不再加载 Live2D 的外部 JS、CSS、模型和纹理，也不安装 Live2D 专用的 fetch/audio hook；新插入的鼠标拖尾 canvas 会被移除并且不启动 RAF。桌面端则用 window 级标志保证 Live2D hooks、widget 和 mouse trail 只初始化一次，旧的 mouse trail 生命周期在 PJAX 之后只重新绑定到新 canvas，而不是整段重跑。

页脚署名监听器和 Siren loader 也加上了单例标志，阻止监听器和 `music.json` 请求随着导航增长。播放器不再把 `preload="none"` 当作唯一防线：首屏和暂停切歌时根本不设置 `audio.src`，只有用户显式点击播放，才解析 `/audio/<cid>`、设置源并请求媒体。返回用户保存的曲目与时间仍然保留，但 `p:true` 不再自动恢复播放；新手势后在 `loadedmetadata` 才恢复时间，source generation token 则让过期的 metadata 回调失效，避免快速切歌时的竞态。

## GREEN：把每一类累积都变成可断言的结果

这次新增了 `npm run check:mobile-runtime`，只使用 Node 内置模块启动本地静态服务，再驱动 Microsoft Edge 的 CDP。它覆盖手机（390×844、DPR 3、Android UA、coarse pointer）和桌面（1280×900、DPR 1、fine pointer）两个 profile，都先注入返回用户状态 `{i:0,t:12,p:true}`，再执行两次真实的 PJAX 跳转：首页 → 第一篇文章 → 首页。请求监听直接挂在 `Network.requestWillBeSent` 上，连失败或仍在等待的请求都算数，而不是只统计成功响应。本地还提供了一个 20 秒的小型 WAV fixture，用来验证显式点击后确实设置 `/audio/125042` 并恢复到 12 秒。

本地和线上生产回归都通过：

- 手机三个阶段的 `waifu/live2d/mouseTrail` 均为 `0/0/0`，Live2D 资源请求为 0，Live2D audio hook 为 false。
- 桌面三个阶段均为 `1/1/1`；Live2D canvas 为 800×800，mouse trail 为 1280×900，Live2D runtime 请求总数为 1。
- PJAX listener 计数保持稳定：手机 2/2/2，桌面 3/3/3；`music.json` 在两次 PJAX 跳转中只请求 1 次。
- 两个 profile 在点击前的 `audio.src` 都连续为 null，音频请求为 0；点击后线上恢复位置约为手机 12.70 秒、桌面 12.55 秒，随后暂停切歌没有新的音频请求。
- `npm run build`、`node --check tools/check-mobile-runtime.mjs`、`git diff --check` 均通过。

## 发布与边界

修复提交为 `01d9b239c71a7c1ae4a147a360827672ee61b97d`，提交说明 `fix: stop mobile Live2D resource leak`，GitHub Actions `Deploy Hexo Blog` 运行号 `35326057497` 于 2026-09-18 完成，Checkout、Node 24、npm ci、Hexo build、rsync deploy 全部成功。整个过程没有重启或 reload Nginx，也没有改动 DNS、PM2、证书或凭据，部署完全沿用现有 GitHub Actions 静态发布流程。发布后，用与本地相同的 Edge/CDP 脚本直接测试公开 URL，退出码为 0。

需要写清楚的是，这次修复只覆盖 Hexo 主站和文章页。`/prose/` 是单独部署的 Three.js 应用，不在本次修复范围内，也不应理解为已经被处理。自动化证据来自 Edge/Chromium 的移动仿真，不能等价替代所有 iOS Safari 和低内存 Android 真机。

所以结论可以这样表述：本次问题对应的可复现资源泄漏已经消除，生产回归通过；真机覆盖仍是剩余验证边界。它不承诺“所有手机 100% 永不闪退”，但至少把主站上可重复观察到的移动端桌面特效加载、Live2D/PJAX 累积、监听器累积和零交互音频加载路径，逐条变成了测试里看得见的零。
