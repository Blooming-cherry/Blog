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
const design = JSON.parse(await fs.readFile(path.join(ROOT, "design", "sky-palettes.json"), "utf8"));
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

/** Static reading never waits for the archive's fonts, model or renderer. */
function buildStylesheet() {
  const palette = design.palettes[design.defaults.palette].light;
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const fallback = Object.entries(palette).map(([name, value]) => `--${name}: ${value}; --${name}-rgb: ${rgb(value).join(", ")};`).join("\n  ");
  const strength = design.defaults.presence * .35;
  const sky = ["top", "middle", "horizon"].map(name => `--read-${name}: rgb(${rgb(palette.paper).map((v, i) => Math.round(v + (rgb(palette[name])[i] - v) * strength)).join(", ")});`).join("\n  ");
  return `
/* Tokens come from the same author palette as the archive and home index. */
:root {
  color-scheme: light;
  ${fallback}
  ${sky}
  --title-scale: ${design.defaults.titleScale};
  --sheet-opacity: .96;
  /* Preserve the existing system body/MiSans chrome division. */
  --read: "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", Lato, sans-serif;
  --chrome: "MiSans", "Mi Sans", system-ui, sans-serif;
  --serif: "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif;
  --measure: 720px;
  --gutter: 32px;
}
* { box-sizing: border-box; }
html { background: var(--paper); color: var(--ink); }
body {
  margin: 0;
  padding: 48px var(--gutter) 0;
  background-color: var(--paper);
  background-image: linear-gradient(180deg, var(--read-top), var(--read-middle) 30%, var(--read-horizon) 70%);
  background-size: 100% 100lvh;
  background-repeat: no-repeat;
  background-attachment: fixed;
  color: var(--ink);
  font-family: var(--read);
  font-size: 18px;
  line-height: 1.9;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
.sheet {
  max-width: calc(var(--measure) + var(--gutter) * 2);
  margin: 0 auto;
  padding: 32px var(--gutter) 40px;
  border: 1px solid rgba(var(--line-rgb), .4);
  border-radius: 18px;
  background: rgba(var(--paper-rgb), var(--sheet-opacity));
  box-shadow: 0 14px 42px rgba(var(--ink-rgb), .06);
  /* The text surface is opaque enough by itself and never blurs its content. */
  backdrop-filter: none;
  -webkit-backdrop-filter: none;
}
.rd-toolbar { position: fixed; right: max(16px, calc((100vw - 784px) / 2 - 132px)); bottom: 18px; z-index: 2; display: flex; justify-content: flex-end; }
.rd-toolbar:has(button[hidden]) { display: none; }
.rd-toolbar button {
  min-height: 44px;
  min-width: 108px;
  padding: 0 14px;
  font: 13px var(--chrome);
  color: var(--ink);
  background: var(--field);
  border: 1px solid rgba(var(--accent-rgb), .5);
  border-radius: 10px;
  cursor: pointer;
  transition: color 120ms, background 120ms;
}
.rd-toolbar button:hover { color: var(--accent); background: var(--paper); }
button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
button[hidden] { display: none; }
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
  font-family: var(--serif);
  font-size: calc(48px * var(--title-scale));
  line-height: 1.25;
  font-weight: 600;
  letter-spacing: .02em;
  overflow-wrap: anywhere;
  margin: 26px 0 0;
}
.rd-sub { margin: 16px 0 0; color: var(--muted); font-size: 14px; letter-spacing: .02em; overflow-wrap: anywhere; }
.rd-body { margin-top: 36px; overflow-wrap: anywhere; }
.rd-body p { margin: 0 0 1.1em; }
.rd-body h2, .rd-body h3, .rd-body h4 { font-weight: 600; line-height: 1.5; margin: 2.2em 0 .9em; }
.rd-body h2 { font-size: 1.375em; }
.rd-body h3 { font-size: 1.25em; }
.rd-body h4 { font-size: 1.125em; }
.rd-body a { color: var(--accent); text-underline-offset: 3px; }
.rd-body strong { font-weight: 600; }
.rd-body hr { border: 0; border-top: 1px solid var(--line); margin: 2.4em 0; }
.rd-body ul, .rd-body ol { padding-left: 1.5em; margin: 0 0 1.15em; }
.rd-body li { margin: .3em 0; }
.rd-body blockquote { margin: 1.6em 0; padding: .2em 0 .2em 1.2em; border-left: 2px solid var(--accent); color: var(--muted); }
.rd-body blockquote p:last-child { margin-bottom: 0; }
.rd-body img { display: block; max-width: min(100%, var(--w, 100%)); height: auto; margin: 1.8em auto; border: 1px solid var(--line); background: var(--panel); }
.rd-body code { font-size: .875em; background: var(--field); border-radius: 3px; color: var(--ink); padding: 2px 4px; overflow-wrap: break-word; }
.rd-body pre, .rd-body code { font-family: consolas, Menlo, monospace, "PingFang SC", "Microsoft YaHei"; }
.rd-body pre { background: transparent; border: 1px solid var(--line); color: var(--ink); line-height: 1.6; margin: 0 auto 20px; padding: 14px; overflow: auto; }
.rd-body pre code { background: none; color: var(--ink); font-size: .875em; padding: 0; overflow-wrap: normal; }
/* Existing syntax tokens now derive from the shared, readable semantics. */
.rd-body :is(.hljs-comment, .hljs-tag) { color: var(--muted); }
.rd-body :is(.hljs-subst, .hljs-punctuation, .hljs-operator) { color: var(--ink); }
.rd-body :is(.hljs-bullet, .hljs-variable, .hljs-template-variable, .hljs-selector-tag, .hljs-name, .hljs-deletion,
.hljs-symbol, .hljs-number, .hljs-link, .hljs-attr, .hljs-variable.constant_, .hljs-literal,
.hljs-title, .hljs-class .hljs-title, .hljs-title.class_, .hljs-code, .hljs-addition, .hljs-title.class_.inherited__, .hljs-string,
.hljs-built_in, .hljs-doctag, .hljs-quote, .hljs-keyword.hljs-atrule, .hljs-regexp,
.hljs-function .hljs-title, .hljs-attribute, .ruby .hljs-property, .hljs-title.function_, .hljs-section,
.hljs-type, .hljs-template-tag, .diff .hljs-meta, .hljs-keyword, .hljs-meta) { color: var(--accent); }
.rd-body .hljs-strong { color: var(--accent); font-weight: bold; }
.rd-body .hljs-emphasis { color: var(--accent); font-style: italic; }
.rd-body :is(.hljs-meta .hljs-keyword, .hljs-meta-keyword) { font-weight: bold; }
.rd-body table { width: 100%; border-collapse: collapse; margin: 1.6em 0; font-size: 15px; }
.rd-body th, .rd-body td { border: 1px solid var(--line); padding: 8px 12px; text-align: left; }
.rd-body th { background: var(--panel); font-weight: 600; }
.rd-foot {
  max-width: calc(var(--measure) + var(--gutter) * 2);
  margin: 22px auto 64px;
  padding: 22px var(--gutter);
  border: 1px solid rgba(var(--line-rgb), .4);
  border-radius: 18px;
  background: rgba(var(--paper-rgb), var(--sheet-opacity));
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
.rd-pager { display: flex; flex-wrap: wrap; gap: 18px; color: var(--muted); }
.rd-pager a { color: var(--muted); overflow-wrap: anywhere; }
.rd-pager span { color: var(--line); }
[data-sky-stage="focus"] { --sheet-opacity: 1; }
[data-sky-stage="focus"] body { background-image: none; }
[data-sky-stage="focus"] .sheet { box-shadow: none; }
[data-reduced="true"] button { transition: none; }
@media (max-width: 720px) {
  :root { --gutter: 20px; }
  body { padding: 16px 0 64px; }
  .rd-toolbar { left: 0; right: 0; bottom: 0; height: 60px; padding: 8px 16px; border-top: 1px solid var(--line); background: var(--paper); }
  .sheet { padding: 28px var(--gutter) 24px; border-radius: 14px; }
  h1 { font-size: calc(34px * var(--title-scale)); }
  .rd-meta { gap: 10px 16px; }
  .rd-foot { flex-direction: column; align-items: flex-start; margin-bottom: max(32px, env(safe-area-inset-bottom)); padding: 18px var(--gutter); border-radius: 14px; }
}
@media (max-width: 370px) { :root { --gutter: 16px; } }
`;
}

/** Blocking first-paint setup, then one small progressive-enhancement control. */
function readerScript(rec, index) {
  const config = JSON.stringify({ design, record: { id: rec.id, index } }).replace(/</g, "\\u003c");
  return `(${readerRuntime.toString()})(${config});`;
}
function readerRuntime(config) {
  const { design, record } = config, root = document.documentElement;
  const key = "rhine-archive-session";
  const readObject = (storage, name) => {
    try { const value = JSON.parse(storage.getItem(name) || "null"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; }
  };
  const saveSnapshot = snapshot => { try { sessionStorage.setItem(key, JSON.stringify(snapshot)); } catch {} };
  const base = new URL("../", location.href);
  let snapshot = readObject(sessionStorage, key);
  const existing = snapshot.version === 1 && snapshot.entered === true && typeof snapshot.selectedId === "string";
  const author = existing && snapshot.parameters && typeof snapshot.parameters === "object" ? snapshot.parameters : design.defaults;
  const params = {
    palette: Object.hasOwn(design.palettes, author.palette) ? author.palette : design.defaults.palette,
    presence: Number.isFinite(author.presence) ? Math.max(0, Math.min(1, author.presence)) : design.defaults.presence,
    titleScale: Number.isFinite(author.titleScale) ? Math.max(.9, Math.min(1.1, author.titleScale)) : design.defaults.titleScale,
  };
  const query = new URLSearchParams(location.search);
  if (query.has("palette")) params.palette = Object.hasOwn(design.palettes, query.get("palette")) ? query.get("palette") : design.defaults.palette;
  for (const [name, min, max] of [["presence", 0, 1], ["titleScale", .9, 1.1]]) {
    if (query.has(name) && query.get(name)?.trim()) {
      const value = Number(query.get(name));
      if (Number.isFinite(value)) params[name] = Math.max(min, Math.min(max, value));
    }
  }
  if (!existing) snapshot = { version: 1, entered: true, selectedId: record.id, selectedIndex: record.index, parameters: params, archiveUrl: base.href };
  else snapshot.parameters = params;
  saveSnapshot(snapshot);
  let focus = false;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  function paint() {
    const prefs = readObject(localStorage, "rhine-settings");
    const theme = prefs.colorTheme === "dark" ? "dark" : "light", palette = design.palettes[params.palette][theme];
    root.dataset.colorTheme = theme;
    root.dataset.darkSurface = String(theme === "dark");
    root.dataset.skyPalette = params.palette;
    root.dataset.skyStage = focus ? "focus" : "read";
    root.dataset.reduced = String(typeof prefs.reduced === "boolean" ? prefs.reduced : reduced.matches);
    root.style.colorScheme = theme;
    for (const [name, value] of Object.entries(palette)) {
      const channel = rgb(value).join(", ");
      root.style.setProperty(`--${name}`, value);
      root.style.setProperty(`--${name}-rgb`, channel);
      root.style.setProperty(`--theme-${name}`, value);
      root.style.setProperty(`--theme-${name}-rgb`, channel);
      root.style.setProperty(`--sky-${name}-rgb`, channel);
    }
    const paper = rgb(palette.paper), strength = params.presence * .35;
    for (const name of ["top", "middle", "horizon"]) root.style.setProperty(`--read-${name}`, `rgb(${paper.map((v, i) => Math.round(v + (rgb(palette[name])[i] - v) * strength)).join(", ")})`);
    root.style.setProperty("--title-scale", String(params.titleScale));
    root.style.setProperty("--sky-title-scale", String(params.titleScale));
    root.style.setProperty("--sky-presence", String(params.presence));
    root.style.setProperty("--sky-strength", String(focus ? 0 : strength));
    root.style.setProperty("--sheet-opacity", focus ? "1" : ".96");
  }
  paint();
  addEventListener("storage", event => { if (event.key === "rhine-settings") paint(); });
  addEventListener("pageshow", paint);
  reduced.addEventListener("change", paint);
  addEventListener("DOMContentLoaded", () => {
    const button = document.querySelector('[data-action="focus-reading"]');
    button.hidden = false;
    button.addEventListener("click", () => {
      const position = scrollY;
      focus = !focus; paint();
      button.textContent = focus ? "恢复氛围" : "专注阅读";
      button.setAttribute("aria-pressed", String(focus));
      scrollTo(0, position);
    });
    const back = document.querySelector("a.back");
    const target = new URL(base);
    target.searchParams.set("archive", snapshot.selectedId || record.id);
    for (const [name, value] of Object.entries(params)) target.searchParams.set(name, String(value));
    back.href = target.href;
    let archiveHistory = false;
    try {
      const previous = new URL(document.referrer), archive = new URL(snapshot.archiveUrl || base.href);
      archiveHistory = history.length > 1 && previous.origin === location.origin && archive.origin === location.origin && previous.pathname === archive.pathname;
    } catch {}
    back.addEventListener("click", event => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || !archiveHistory) return;
      event.preventDefault(); history.back();
    });
  }, { once: true });
}

function pageHtml({ rec, index, body, prev, next }) {
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
<script>${readerScript(rec, index)}</script>
<link rel="icon" href="../favicon.svg">
<link rel="stylesheet" href="../prose-fonts.css">
<link rel="stylesheet" href="../prose-read.css">
</head>
<body>
<article class="sheet">
  <div class="rd-toolbar"><button type="button" data-action="focus-reading" aria-pressed="false" hidden>专注阅读</button></div>
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
    pageHtml({ rec, index: i, body: html, prev: records[i - 1], next: records[i + 1] }),
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
