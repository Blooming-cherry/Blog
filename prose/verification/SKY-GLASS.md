# 文苑天空与阅读集成验证

日期：2026-10-03。分支 design/sky-glass；仅本地试用。用户最新要求已覆盖档案毛玻璃方案，当前档案外观由透明细高光方案负责；本记录聚焦 D-02 阅读及恢复。

## 实现边界

- 沿既有静态正文生成器及 w-NNN 路由，没有第二套文章站点。正文内容、附件目标及顺序不改。
- 主题仍只读写 rhine-settings；rhine-archive-session 是每标签页导航快照，不是第二套主题偏好。
- 850ms 背景权重过渡可中断，全文导航取消采用 revision；旧退出回调不能关闭新内容。
- 已有 35 秒开场结束节点进入 archive；正文、同会话恢复与 reduced 进入可用终点。
- 字体等待上限 2.5 秒；正文不依赖三维或字体。模型错误保留档案导航、检索与真实全文链接。
- 全文 .sheet 默认纸面 alpha=.96，focus=1，backdrop-filter:none；唯一常驻专注控制刷新重置。
- ArchiveScene 与 ModelViewer dispose 都释放天空环境纹理。

## 本轮实测

运行环境：本机 Chrome、ANGLE Metal；生产 dist 通过本地 HTTP 服务读取。

| 场景 | 预期 | 实际与结果 |
|---|---|---|
| 真实 next、读取档案 | 选中下一篇并显示可读摘要 | W-002；真实按钮事件恢复，摘要最终 opacity=1；通过 |
| 快速返回再读取 | 最新详情可见，不被旧回调关闭 | mode=detail、detail-ui.hidden=false、W-002；通过 |
| 刷新档案 | 同会话恢复选档、循环单元格及参数 | W-002、cell={lane:2,row:13}、tea/.8/1.1；通过 |
| 模型载入失败 | 基本导航及正文入口可用 | threeState=off、W-015 摘要与真实 w-015 链接；通过 |
| 正文字体与模型请求阻断 | 独立文章仍可读 | 1440、390、320 标题 visible/opacity=1，无横溢出；通过 |
| 深色首帧与作者参数 | tea 深色，标题1.1 | root主题dark，纸面rgba(36,34,31,.96)，无blur；通过 |
| 滚动后真实点击专注 | 不改变阅读位置，纸面变实 | 三宽度滚900px后 locator.click，scroll不变，stage=focus；通过 |
| 专注后刷新 | 同文章但恢复普通阅读 | stage=read；通过 |
| 无历史深链返回 | 原文苑路径，选中当前文章 | a.back 为原路径?archive=W-001&palette=tea&presence=1&titleScale=1.1；通过 |
| 非法 palette=toString | 回退 dawn | 三宽度均 dawn；通过 |
| 真实阅读全文与返回 | 同文章目标，恢复对应档案 | W-002 全文标题正确，a.back 返回 W-002 与cell={lane:2,row:13}；通过 |
| 运行时系统 reduced | 当前运动到阅读终点且文字可见 | motion.reduced=true，weight=.35，opacity=1；通过 |
| 六种主题文本对比 | ink/muted 对 paper ≥4.5 | check-sky 六端均通过 |

生产构建 `npm run build` 成功（TypeScript、Vite、21 篇正文、6/6 附件、PWA manifest）。仅既有大包 chunk 提示，无构建错误。

复现：构建并静态服务 dist，设置 REVIEW_URL 为档案目录，PLAYWRIGHT_MODULE 指向可用 Playwright，运行 `node scripts/check-sky.mjs`。检查使用真实 locator.click，不以 DOM 激活代替用户点击。

完整首次普通进入、修饰键新标签、更完整的浏览器历史、视觉截图及原 30 个脚本由整合副本独立验收补全。未把待验证项目记为通过。实测原始输出在任务过程记录 D-02-main-smoke.json、D-02-final-smoke.json；最终统一证据由整合验收输出。
