// build 期（vite build 之后）：为每篇散文生成一张静态正文页 dist/w-NNN/index.html。
//
// 为什么是静态页而不是 SPA 路由：站点是纯静态托管，静态目录天然就有 404 语义，
// 不需要 try_files 回退；正文页也不需要 WebGL，走另一条渲染链反而更快更稳。
//
// 路径注意：页面 URL 是 /prose/w-NNN/，相对路径的基准就是这个目录。
// 于是正文里原来的 ../attachments/xxx 一层不多一层不少，恰好指向 /prose/attachments/xxx
// —— 前提是我们把附件目录一并搬进 dist/。所以下面要把引用到的附件复制过来，
// 【不要】在这里改写正文里的相对路径。
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import hljs from "highlight.js";
import { POSTS_DIR, loadRecords, readPost } from "./prose-source.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = path.join(ROOT, "dist");
const ATTACH_SRC = path.join(POSTS_DIR, "..", "attachments");

/** 散文里写得很随意：C / Cpp / C++ / ts / TypeScript 都出现过。 */
const LANG_ALIAS = {
  "c++": "cpp", cpp: "cpp", c: "c", cc: "cpp",
  ts: "typescript", typescript: "typescript", js: "javascript", javascript: "javascript",
  sh: "bash", shell: "bash", zsh: "bash", bash: "bash",
  cmd: "dos", bat: "dos", dos: "dos",
  py: "python", python: "python",
  yml: "yaml", yaml: "yaml", json: "json", md: "markdown", markdown: "markdown",
  text: "plaintext", txt: "plaintext", plain: "plaintext", plaintext: "plaintext",
};

/**
 * 代码高亮对齐博客：博客用的是 codeblock.highlight_theme: normal，
 * 也就是 Tomorrow 浅色主题（配色见下面的样式表），高亮器同为 highlight.js。
 *
 * 关键的一条：博客 highlight.auto_detect 是 false，未标语言的围栏【不猜】，
 * 直接按纯文本渲染。29 个围栏没写语言，猜错会把散文里的对齐图表染花，
 * 所以这里同样只对写得明、且高亮器认识的标签上色。
 */
marked.use({
  renderer: {
    code({ text, lang }) {
      const raw = String(lang ?? "").trim().split(/\s+/)[0].toLowerCase();
      const name = LANG_ALIAS[raw] ?? raw;
      const known = name && name !== "plaintext" && hljs.getLanguage(name);
      const inner = known
        ? hljs.highlight(text, { language: name, ignoreIllegals: true }).value
        : esc(text);
      const cls = known ? ` class="language-${name}"` : "";
      return `<pre><code${cls}>${inner}</code></pre>\n`;
    },
  },
});

marked.setOptions({ gfm: true, breaks: false });

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Hexo 主题的 `|700` 尺寸提示混在 alt 里，去掉提到 CSS 变量上。
 * 不能直接写 inline 的 max-width:700px —— inline 会盖掉样式表里的 max-width:100%，
 * 窄屏就横向溢出了。交给样式表做 min(100%, var(--w)) 才两头都成立。
 */
const cleanAlts = (html) =>
  html.replace(/<img\b[^>]*>/g, (tag) => {
    const m = /alt="([^"]*?)\|(\d+)"/.exec(tag);
    let out = tag;
    if (m) {
      out = out.replace(m[0], `alt="${m[1]}"`).replace(/\/?>$/, ` style="--w:${m[2]}px">`);
    }
    return out.includes("loading=") ? out : out.replace(/\/?>$/, ' loading="lazy">');
  });

/**
 * 字体单独一份：753 条 @font-face 有 580KB，而排版规则只有几 KB。
 * 拆开之后改排版不会让整包字体失效，两份都各自吃得下长缓存。
 */
async function buildFontStylesheet() {
  const fonts = await fs.readFile(path.join(ROOT, "src", "fonts.css"), "utf8");
  // 源里写的是 url("/fonts/...")（绝对）。这份 CSS 落在 dist/prose-fonts.css
  // → 对外是 /prose/prose-fonts.css，所以 url() 要相对自身写成 fonts/...，
  // 解析出来才是 /prose/fonts/...（vite 给应用那份做的也是同一件事）。
  const rebased = fonts.replace(/url\("\/fonts\//g, 'url("fonts/');
  if (rebased === fonts) throw new Error("fonts.css 的 url() 形态变了，相对化没生效");
  return rebased;
}

/** 正文页样式：独立一份，不引入应用那 664KB 的 CSS。 */
function buildStylesheet() {
  return `
/* 文苑正文页。刻意只做浅色一种面貌：它是文档，跟着系统翻深色会让
   Rhine Lab 的暖棕/琥珀调子失效。配色全部显式写死，不依赖任何继承。 */
:root {
  color-scheme: light;
  --paper: #eae5e1;
  --ink: #080a08;
  --muted: #77756d;
  --line: #aaa59a;
  --panel: #edebe4;
  --field: #e7e3d9;
  --accent: #9b7247;

  /* 正文用博客那一套，不是 MiSans：MiSans 的字面紧、字距收，
     长文连读会发闷。这一串就是 blog 的 source/_data/styles.styl 里
     .post-body 那份，只在 Lato 之后补了两个跨平台兜底
     （雅黑只在 Windows 有、苹方只在 Apple 有，Linux/旧安卓不至于掉到默认体）。 */
  --read: "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", Lato, sans-serif;
  /* MiSans 退到只服务页眉页脚的终端语气，Rhine Lab 的调子留在那里。 */
  --chrome: "MiSans", "Mi Sans", system-ui, sans-serif;

  /* 版心：对齐博客实测的 900px（1600 视口下正文列宽，18px 时约 50 字/行）。
     gutter 算在 max-width 之外，否则实际行宽会被两侧内边距吃掉 64px。 */
  --measure: 900px;
  --gutter: 32px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: var(--read);
  font-size: 18px;
  line-height: 2;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.sheet {
  max-width: calc(var(--measure) + var(--gutter) * 2);
  margin: 0 auto;
  padding: 72px var(--gutter) 40px;
}

/* 页眉沿用详情面板的终端语气：小号、大写、拉开字距。 */
.rd-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  font-family: var(--chrome);
  font-size: 10px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--muted);
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}
.rd-meta b { font-weight: 400; color: var(--accent); }
h1 {
  font-size: 30px;
  line-height: 1.45;
  font-weight: 600;
  letter-spacing: .5px;
  margin: 26px 0 0;
}
.rd-sub {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 14px;
  letter-spacing: .4px;
}

/* 正文 */
.rd-body { margin-top: 44px; }
.rd-body p { margin: 0 0 1.1em; }
/* 标题级差照 NEXT 的 1.625em − .125em × n 取，跟博客里读到的一致。 */
.rd-body h2,
.rd-body h3,
.rd-body h4 {
  font-weight: 600;
  line-height: 1.5;
  margin: 2.2em 0 .9em;
}
.rd-body h2 { font-size: 1.375em; }
.rd-body h3 { font-size: 1.25em; }
.rd-body h4 { font-size: 1.125em; }
.rd-body a { color: var(--accent); text-underline-offset: 3px; }
.rd-body strong { font-weight: 600; }
.rd-body hr { border: 0; border-top: 1px solid var(--line); margin: 2.4em 0; }
.rd-body ul,
.rd-body ol { padding-left: 1.5em; margin: 0 0 1.15em; }
.rd-body li { margin: .3em 0; }
.rd-body blockquote {
  margin: 1.6em 0;
  padding: .2em 0 .2em 1.2em;
  border-left: 2px solid var(--accent);
  color: var(--muted);
}
.rd-body blockquote p:last-child { margin-bottom: 0; }
.rd-body img {
  display: block;
  /* --w 来自正文里的「|700」尺寸提示（见 cleanAlts）；没写就满栏。 */
  max-width: min(100%, var(--w, 100%));
  height: auto;
  margin: 1.8em auto;
  border: 1px solid var(--line);
  background: var(--panel);
}
/* 代码块。博客 codeblock.highlight_theme 是 normal（= Tomorrow 浅色），
   高亮器同为 highlight.js，所以下面这套 token 配色直接照抄
   highlight.js/styles/base16/tomorrow.css，不做「近似」。
   排版参数照抄 NEXT：
     $code-font-family      consolas, Menlo, monospace, $font-family-chinese
     $table-font-size       $font-size-small = .875em   → 18px 下 15.75px
     $line-height-code-block 1.6
     $code-background       $gainsboro #eee / $code-foreground $black-light #555  ← 行内 code
   唯一【刻意不照抄博客】的一处：pre 底色取透明，跟纸面同色，只留一条细线勾边。
   博客那里是 Tomorrow 的 #f7f7f7 灰盒，在暖棕纸面上会浮出一块冷灰。
   token 颜色因此要落在 #eae5e1 上而不是 #f7f7f7 上——base16 里除注释外的
   槽位都足够深，注释 #8e908c 的对比度会从 2.9:1 掉到 2.5:1，这是这条改动
   唯一付出的代价，介意就把 .hljs-comment 换成 #7a7c78。 */
.rd-body code {
  font-size: .875em;
  background: #eee;
  border-radius: 3px;
  color: #555;
  padding: 2px 4px;
  overflow-wrap: break-word;
}
.rd-body pre,
.rd-body code {
  font-family: consolas, Menlo, monospace, "PingFang SC", "Microsoft YaHei";
}
.rd-body pre {
  /* 跟纸面同色，靠一条细线（与 hr / img / table 同一条 --line）划出边界。
     行内 code 仍是浅底块：它没有独立的行可以画线，去掉底色就没法辨认了。 */
  background: transparent;
  border: 1px solid var(--line);
  color: #4d4d4c;
  line-height: 1.6;
  margin: 0 auto 20px;
  padding: 10px;
  overflow: auto;
}
/* 字号只落在 pre code 上（NEXT 也是这么写的）：pre 若也设 .875em，
   code 会再乘一次变成 13.78px，块里的字比博客小一整档。 */
.rd-body pre code {
  background: none;
  color: #4d4d4c;
  font-size: .875em;
  padding: 0;
  overflow-wrap: normal;
}
/* Tomorrow —— 括号里是 base16 槽位，与 tomorrow.css 逐一对应 */
.rd-body .hljs-comment { color: #8e908c; }                                   /* base03 */
.rd-body .hljs-tag { color: #969896; }                                        /* base04 */
.rd-body .hljs-subst,
.rd-body .hljs-punctuation,
.rd-body .hljs-operator { color: #4d4d4c; }                                   /* base05 */
.rd-body .hljs-operator { opacity: .7; }
.rd-body .hljs-bullet,
.rd-body .hljs-variable,
.rd-body .hljs-template-variable,
.rd-body .hljs-selector-tag,
.rd-body .hljs-name,
.rd-body .hljs-deletion { color: #c82829; }                                   /* base08 */
.rd-body .hljs-symbol,
.rd-body .hljs-number,
.rd-body .hljs-link,
.rd-body .hljs-attr,
.rd-body .hljs-variable.constant_,
.rd-body .hljs-literal { color: #f5871f; }                                    /* base09 */
.rd-body .hljs-title,
.rd-body .hljs-class .hljs-title,
.rd-body .hljs-title.class_ { color: #eab700; }                               /* base0A */
.rd-body .hljs-strong { color: #eab700; font-weight: bold; }
.rd-body .hljs-code,
.rd-body .hljs-addition,
.rd-body .hljs-title.class_.inherited__,
.rd-body .hljs-string { color: #718c00; }                                     /* base0B */
.rd-body .hljs-built_in,
.rd-body .hljs-doctag,
.rd-body .hljs-quote,
.rd-body .hljs-keyword.hljs-atrule,
.rd-body .hljs-regexp { color: #3e999f; }                                     /* base0C */
.rd-body .hljs-function .hljs-title,
.rd-body .hljs-attribute,
.rd-body .ruby .hljs-property,
.rd-body .hljs-title.function_,
.rd-body .hljs-section { color: #4271ae; }                                    /* base0D */
.rd-body .hljs-type,
.rd-body .hljs-template-tag,
.rd-body .diff .hljs-meta,
.rd-body .hljs-keyword { color: #8959a8; }                                    /* base0E */
.rd-body .hljs-emphasis { color: #8959a8; font-style: italic; }
.rd-body .hljs-meta,
.rd-body .hljs-meta .hljs-keyword,
.rd-body .hljs-meta .hljs-string { color: #a3685a; }                          /* base0F */
.rd-body .hljs-meta .hljs-keyword,
.rd-body .hljs-meta-keyword { font-weight: bold; }
.rd-body table {
  width: 100%;
  border-collapse: collapse;
  margin: 1.6em 0;
  font-size: 15px;
}
.rd-body th,
.rd-body td { border: 1px solid var(--line); padding: 8px 12px; text-align: left; }
.rd-body th { background: var(--panel); font-weight: 600; }

/* 页脚：回目录 + 前后一篇 */
.rd-foot {
  max-width: calc(var(--measure) + var(--gutter) * 2);
  margin: 0 auto 96px;
  padding: 22px var(--gutter) 0;
  border-top: 1px solid var(--line);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  font-family: var(--chrome);
  font-size: 12px;
  letter-spacing: .8px;
}
.rd-foot a { color: var(--ink); text-decoration: none; border-bottom: 1px solid transparent; }
.rd-foot a:hover { border-bottom-color: var(--accent); color: var(--accent); }
.rd-foot .back { text-transform: uppercase; }
.rd-pager { display: flex; gap: 18px; color: var(--muted); }
.rd-pager a { color: var(--muted); }
.rd-pager span { color: var(--line); }

/* 手机上版心本来就是满的，收 gutter 换行宽；字号退到 17px 免得一行装不下几个字。 */
@media (max-width: 720px) {
  :root { --gutter: 20px; }
  body { font-size: 17px; }
  .sheet { padding: 40px var(--gutter) 24px; }
  h1 { font-size: 24px; }
  .rd-foot {
    flex-direction: column;
    align-items: flex-start;
    margin-bottom: 64px;
    padding: 18px var(--gutter) 0;
  }
}
`;
}

function pageHtml({ rec, body, prev, next }) {
  const title = `${rec.title} · 文苑`;
  const pager = [
    prev ? `<a href="../${prev.id.toLowerCase()}/">← ${esc(prev.title)}</a>` : `<span>←</span>`,
    next ? `<a href="../${next.id.toLowerCase()}/">${esc(next.title)} →</a>` : `<span>→</span>`,
  ].join("");
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(rec.description || rec.subtitle || rec.title)}">
<link rel="icon" href="../favicon.svg">
<link rel="stylesheet" href="../prose-fonts.css">
<link rel="stylesheet" href="../prose-read.css">
</head>
<body>
<article class="sheet">
  <div class="rd-meta"><b>FILE ${esc(rec.id)}</b><span>${esc(rec.date)}</span><span>${esc(rec.tag)}</span></div>
  <h1>${esc(rec.title)}</h1>
${rec.subtitle ? `  <p class="rd-sub">${esc(rec.subtitle)}</p>\n` : ""}  <div class="rd-body">
${body}
  </div>
</article>
<nav class="rd-foot">
  <a class="back" href="../">← 返回文苑</a>
  <div class="rd-pager">${pager}</div>
</nav>
</body>
</html>
`;
}

const records = await loadRecords();
await fs.writeFile(path.join(DIST, "prose-fonts.css"), await buildFontStylesheet(), "utf8");
await fs.writeFile(path.join(DIST, "prose-read.css"), buildStylesheet(), "utf8");

const needed = new Set();
for (let i = 0; i < records.length; i++) {
  const rec = records[i];
  const { body: md } = await readPost(rec.slug);
  let html = marked.parse(md);
  html = cleanAlts(html);
  // 正文里引用到的附件目录，稍后整个复制进 dist/
  // marked 会把 src 百分号编码（cleanUrl → encodeURI），所以这里要解回来才对得上磁盘名。
  for (const m of html.matchAll(/\.\.\/attachments\/([^/"')]+)\//g)) {
    try { needed.add(decodeURIComponent(m[1])); } catch { needed.add(m[1]); }
  }

  const dir = path.join(DIST, rec.id.toLowerCase());
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "index.html"),
    pageHtml({ rec, body: html, prev: records[i - 1], next: records[i + 1] }),
    "utf8",
  );
}

let copied = 0;
for (const name of needed) {
  const from = path.join(ATTACH_SRC, name);
  const to = path.join(DIST, "attachments", name);
  try {
    await fs.cp(from, to, { recursive: true });
    copied++;
  } catch (err) {
    console.warn(`附件目录缺失：${name}（${err.code}）`);
  }
}

console.log(`正文页 ${records.length} 篇 → dist/w-001 … w-${String(records.length).padStart(3, "0")}`);
console.log(`附件目录 ${copied}/${needed.size} → dist/attachments/`);
