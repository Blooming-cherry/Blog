# 文苑 · PROSE

博客 `blog.adaydream.cn/prose/` 下的散文栏目。前端取自
[RhineLabUI](https://github.com/LBEILC/RhineLabUI)（MIT，© LBEILC），
视觉气质保留莱茵生命的暖棕/琥珀调，内容则是站主自己的散文。

**文章只写在博客里，这里不存内容。** 唯一的来源是
`../technical/source/_posts/*.md` —— 与博客正文同一批文件，同一套 front-matter。
改一篇散文不需要碰这个目录里的任何代码。

## 加一篇散文

1. 在 `technical/source/_posts/` 新建一个 `.md`，front-matter 写 `title`
   `date` `tag`，正文照常写 Markdown。`subtitle`（副题）与 `description`（诗引）
   可留空 —— 卡片上那两处会留白，不会报错。
2. 提交并推送。CI 会重新生成卡片阵列与正文页，一并部署到 `/prose/`。

编号 `W-001…` 按**日期升序**自动分配，也就是说：往中间插一篇早期文章，
它之后所有文章都会改号，`/prose/w-007/` 这类链接和文章不再一一对应。
想让链接永久稳定，就往日期靠后的位置追加。

## 本地构建

```sh
npm ci          # 首次
npm run dev     # 预览，改 _posts 里的散文会即时反映
npm run build   # 产出 dist/，含 w-NNN 正文页与 Service Worker
npm run check:content   # 校验卡片数据与下载文件是否一致（需先构建过一次）
```

Node 需要 22.12+ 或 24（Vite 7 的要求）；CI 用 24。

内容源默认取 `../technical/source/_posts`，靠相对路径推导，
本地检出和 CI 检出走同一条逻辑。要指向别处的文章时用
`PROSE_POSTS_DIR=/path/to/_posts` 覆盖。

## 目录

| 路径 | 作用 |
| --- | --- |
| `src/` | 三维档案阵列、开场动画、详情面板。上游代码，尽量别动 |
| `scripts/prose-source.mjs` | 读 `_posts`、拆 front-matter、分配 `W-NNN` 编号 |
| `scripts/prose-content.mjs` | 出卡片数据 `content/archives.json`（构建产物，不入库） |
| `scripts/prose-pages.mjs` | 出正文页 `dist/w-NNN/index.html` 与附件副本 |
| `scripts/export-records.mjs` | 出详情面板的 TXT 下载（构建产物，不入库） |
| `public/fonts/` | MiSans 子集，页眉页脚的终端语气用它 |
| `content/README.md` | 卡片数据的字段说明 |

## 排版与博客的关系

正文页的字体、字号、版心、行高、代码块配色都对着博客实测值抄，不是凭感觉调的：

- 正文 `Microsoft YaHei, PingFang SC, Lato, sans-serif`，18px / 行高 2 / 版心 900px
  —— 与博客 `source/_data/styles.styl` 的 `.post-body` 一致，约 50 字/行。
  不用 MiSans 排正文：字面紧、字距收，长文连读发闷。
- 代码块内边距 10px、字号 15.75px、行高 1.6、字体 `consolas, Menlo, monospace`
  —— 对齐 NEXT 的 `$code-*` 变量；高亮用 highlight.js 的 base16 **Tomorrow**
  主题，与博客 `codeblock.highlight_theme: normal` 是同一套。
  **底色是唯一刻意不照抄博客的地方**：这里取透明、跟纸面同色，只用一条
  细线（同 `hr`/`img`/`table` 的 `--line`）勾边，因为 Tomorrow 的 `#f7f7f7`
  灰盒落在暖棕纸面上会浮出一块冷灰。代价是注释色 `#8e908c` 的对比度从
  2.9:1 降到 2.5:1；嫌淡就把 `prose-pages.mjs` 里的 `.hljs-comment` 换成 `#7a7c78`。
- 未标语言的围栏**按纯文本渲染**，不猜。博客的 `auto_detect` 是 `false`，
  散文里有对齐图表和 ASCII 画，猜错会染花。

## 出处与许可

- 上游：<https://github.com/LBEILC/RhineLabUI>，MIT，© 2026 LBEILC，见 `LICENSE`。
- `public/fonts/misans-webfont-4.3.1/`：小米 MiSans，随包分发，见该目录下
  `NOTICE.txt` 与 `MiSans-license.pdf`。
- Novecento Sans Wide 是上游单独授权的 MyFonts 字体，**不在本仓库里**
  （`.gitignore` 已排除 `public/fonts/novecento/`）。缺它时开场字效退回系统字体。

本仓库相对上游去掉了 `reference/`、`docs/`、`wallpaper/` 三类开发与壁纸工程资料，
以及依赖它们的检查脚本与 Wallpaper Engine 构建；其余源码保持原样。
上游原 README 留在 `UPSTREAM-README.md`。
