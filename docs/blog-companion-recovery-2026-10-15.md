# 博客鲸鱼娘恢复与本地验收记录

日期：2026-10-15。状态：已整合到正式博客工作目录并完成本地验收；未提交、推送或部署。

## 悬案结论

10 月 7 日的对话（会话 ID：01a114a3-a88e-73a0-9566-dc8922fccea0）曾讨论定制鲸鱼娘、自托管、手机按需加载、交互和语音。成果实际保存在 C:\Users\admin\Documents\Codex\workspace-blog-ui-20261008 工作树的未提交文件中，没有进入 D:\my-blog。桌面综合方案存在，但它描述的待实施状态不足以反映工作树里的实现。本次恢复该实现，原工作树保留。

## 已落实

- technical/source/js/companion/：独立控制器、偏好、渲染器、语音控制器、样式、启动脚本及运行依赖。
- technical/source/assets/companion/：真实 Cubism 鲸鱼娘模型、静态鲸鱼图标、资源清单与作者/许可说明。
- technical/source/_data/body-end.swig：只替换旧 Live2D 区段，移除全局 fetch/Audio 覆写；保留现有音乐播放器及其他页面逻辑。
- technical/_config.yml：模型资源和第三方运行库原样输出，避免 Hexo 改写。
- technical/tools/check-companion.cjs 和 check-companion-browser.mjs：恢复检查，并增加生成后完整博客模式、桌面自动加载、原生 API 和真实文章 PJAX 往返检查。

桌面空闲时加载形象；手机首屏显示静态入口，主动打开后加载模型。支持拖动吸边、大小、收起、关闭后恢复、设置菜单、键盘焦点、失败重试和减少动态效果；收起或页面隐藏时暂停连续渲染。资源来自本站路径。

## 本轮证据

以下命令均在 D:\my-blog\technical 执行，退出码 0：

```powershell
npm run build
node tools/check-companion.cjs
$env:COMPANION_SITE_ROOT='D:\my-blog\technical\public'
node tools/check-companion-browser.mjs
Remove-Item Env:\COMPANION_SITE_ROOT
git diff --check
```

Edge 无头浏览器实际加载真实模型，状态 ready，零未捕获脚本异常。确认手机首屏无模型/运行库请求、打开后一个画布、五轮模拟 PJAX 生命周期、菜单 Escape/焦点、搜索焦点、收起暂停、减少动态效果、销毁重建。生成后的完整博客另通过桌面自动加载、fetch/Audio 未被替换、现有音乐初始暂停且未设置音源、真实首页→文章→首页 PJAX 往返；模型与音乐保留原实例。临时浏览器配置及测试 HTTP 服务由脚本清理。

逻辑脚本报告“18 companion assertions”；该名称沿用旧脚本，表示一组覆盖项，不作为精确断言计数。语音事件与音乐 duck 测试使用 Audio fixture，不能当作真实语音联动验收。

## 当前限制

- 没有鲸鱼娘配套语音，manifest.voices 为空，默认静音。语音控制器已保留，但正式旧播放器没有 setCompanionDucking 接口；以后接入声音前，仍需补齐这个接口并验收实际音乐压低/恢复，不能称为语音联动已完成。
- 本轮保留素材包的来源和许可文件；来源固定提交 ea40a34fe8d33576c4db59993e3d50d9962feac9。文件声明模型为 CC BY-NC-SA 4.0，并列出上善无形、ZipZipPipe、氵六青。本轮没有重新进行上游授权审计。
- 未迁入独立工作树中的音乐 UI 改版、音乐页或其他工作区改动。旧模型资源仍保留，当前模板不再加载旧控件。
- 验收是本机自动化行为检查；没有进行线上验证、人工审美验收或真实手机长时间性能检查。
- 原有分类入口缺少生成页面，最初误选它导致 PJAX 探针超时；改用真实文章链接后通过。本轮没有修改分类功能。

## 后续与回退

本地构建结果位于 technical/public。正式上线需要后续发布操作。本轮没有 commit/push/部署。

回退时仅还原本轮 technical/_config.yml 的两条 skip_render 和 body-end.swig 的看板娘区段，并移走本轮新增 companion 资源与检查脚本，再重新构建；勿对整个仓库 reset/clean，避免损失其他工作。原独立工作树保留了完整旧成果，便于追溯。