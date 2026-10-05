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
import { mixColors, readableOverBands, boostChroma } from "../design/sky-math.mjs";
import { skyDomains, domainMotion, skyChromaGain } from "../design/sky-domains.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DIST = path.join(ROOT, "dist");
const design = JSON.parse(await fs.readFile(path.join(ROOT, "design", "sky-palettes.json"), "utf8"));
// The reader's inline runtime cannot import a module, so embed the shared core
// verbatim (with `export ` stripped). This is the same code the SPA bundles, not
// a second copy of the OKLab coefficients.
const SKY_MATH_SOURCE = (await fs.readFile(path.join(ROOT, "design", "sky-math.mjs"), "utf8")).replace(/^export /gm, "");
const pool = JSON.parse(await fs.readFile(path.join(ROOT, "design", "sky-pool.json"), "utf8"));
const POOL_STATE_SOURCE = (await fs.readFile(path.join(ROOT, "design", "sky-pool-state.mjs"), "utf8")).replace(/^export /gm, "");
const POOL_BUTTON_SOURCE = (await fs.readFile(path.join(ROOT, "design", "sky-pool-button.mjs"), "utf8")).replace(/^export /gm, "");
const POOL_BUTTON_CSS = await fs.readFile(path.join(ROOT, "design", "sky-pool-button.css"), "utf8");
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

/* Luminance-based readable tokens come from design/sky-math.mjs above, so the
 * static build and the inline runtime share exactly one implementation. */

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

/** Static reading never waits for the archive's fonts, model or renderer.
 * One unified sky: a fixed field of soft colour domains under the text, owned
 * by the root canvas, no paper card and no focus/reading-mode control.
 * The DOM is emitted bottom-first so the first `skyDomains` entry is the last
 * sibling and paints on top — the same order the GLSL/composite use. */
const skyLayerOrder = [...skyDomains].reverse();
const skyDomainLayers = (() => {
  const samples = 48;
  return skyLayerOrder.map((domain, layer) => {
    const i = skyDomains.indexOf(domain);
    const halfWidth = domain.rx * 100, halfHeight = domain.ry * 100;
    const baseRot = ((domain.rot ?? 0) * 180) / Math.PI;
    const flow = [], churn = [];
    for (let step = 0; step <= samples; step++) {
      const fraction = step / samples;
      const motion = domainMotion(domain, fraction * domain.period);
      const rot = (motion.rot * 180) / Math.PI;
      // The main mass: bounded drift + local rotation + area-preserving axis
      // morph, all composited (no per-frame gradient repaint).
      flow.push(`  ${(fraction * 100).toFixed(4)}% { transform: translate(${((motion.cx - domain.cx) * 100).toFixed(4)}vw, ${((motion.cy - domain.cy) * 100).toFixed(4)}vh) rotate(${rot.toFixed(4)}deg) scale(${(motion.rx / domain.rx).toFixed(5)}, ${(motion.ry / domain.ry).toFixed(5)}); }`);
      // A second, smaller lobe orbits inside the domain as the rim wave travels,
      // so the colour visibly churns instead of reading as one flat stamp.
      const orbit = 0.28 + 0.14 * (domain.wobble ?? 0);
      const ox = Math.cos(motion.bendPhase) * orbit * 50;
      const oy = Math.sin(motion.bendPhase) * orbit * 50;
      const os = 1 + 0.30 * (domain.wobble ?? 0) * Math.sin(motion.bendPhase * 2);
      churn.push(`  ${(fraction * 100).toFixed(4)}% { transform: translate(${ox.toFixed(4)}%, ${oy.toFixed(4)}%) rotate(${(-rot).toFixed(4)}deg) scale(${os.toFixed(5)}); }`);
    }
    return `
  .sky-domains :nth-child(${layer + 1}) {
    left: calc(${(domain.cx * 100).toFixed(2)}% - ${halfWidth.toFixed(2)}vw);
    top: calc(${(domain.cy * 100).toFixed(2)}% - ${halfHeight.toFixed(2)}vh);
    width: ${(halfWidth * 2).toFixed(2)}vw;
    height: ${(halfHeight * 2).toFixed(2)}vh;
    background: radial-gradient(closest-side, rgba(var(--read-${domain.step}-rgb), ${domain.alpha}), rgba(var(--read-${domain.step}-rgb), 0));
    transform: rotate(${baseRot.toFixed(4)}deg);
    animation: sky-flow-${i} ${domain.period}s linear infinite;
    animation-delay: var(--sky-delay, 0s);
    animation-play-state: var(--sky-play, running);
  }
  .sky-domains :nth-child(${layer + 1})::before {
    content: "";
    position: absolute;
    inset: 10% 8%;
    background: radial-gradient(closest-side, rgba(var(--read-${domain.step}-rgb), ${(domain.alpha * 0.5).toFixed(4)}), rgba(var(--read-${domain.step}-rgb), 0));
    will-change: transform;
    animation: sky-churn-${i} ${domain.period}s linear infinite;
    animation-delay: var(--sky-delay, 0s);
    animation-play-state: var(--sky-play, running);
  }
  @keyframes sky-flow-${i} {
${flow.join("\n")}
  }
  @keyframes sky-churn-${i} {
${churn.join("\n")}
  }`;
  }).join("\n");
})();

function buildStylesheet() {
  const family = design.palettes[design.defaults.palette];
  const palette = family.light;
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  const surface = Object.entries(palette.surface).map(([name, value]) => `--${name}: ${value}; --${name}-rgb: ${rgb(value).join(", ")};`).join("\n  ");
  const strength = design.defaults.presence;
  const noon = palette.sky.reduce((a, b) => (Math.abs(a.h - 12) < Math.abs(b.h - 12) ? a : b));
  // Paper→sky strength mixing runs through the shared OKLab core, matching the
  // SPA (sky-design.ts) and the inline runtime embedded below.
  const readBand = name => rgb(boostChroma(mixColors(palette.surface.paper, noon[name], strength), skyChromaGain));
  const sky = design.steps.map(name => `--read-${name}: rgb(${readBand(name).join(", ")}); --read-${name}-rgb: ${readBand(name).join(", ")};`).join("\n  ");
  // Text can land anywhere on the fixed gradient — including the meta line at
  // the very top after scrolling — so each token clears both ends of the painted
  // band range. Necessary meta info uses the same full-background derivation.
  const bands = design.steps.map(readBand);
  const readMeta = readableOverBands(palette.surface.muted, bands, 4.7);
  const readMetaStrong = readableOverBands(palette.surface.accent, bands, 5);
  const readInk = readableOverBands(palette.surface.ink, bands, 4.7);
  const readMuted = readableOverBands(palette.surface.muted, bands, 4.7);
  const readAccent = readableOverBands(palette.surface.accent, bands, 5);
  const readLine = readableOverBands(palette.surface.line, bands, 4.7);
  // Register the five sky tokens as animatable colours; browsers without
  // @property simply keep the same values declared below (terminal fallback).
  const readProperty = design.steps.map(name => `@property --read-${name} { syntax: "<color>"; inherits: true; initial-value: rgb(${readBand(name).join(", ")}); }`).join("\n");
  return `
${readProperty}
/* Tokens come from the same author palette as the archive and home index. */
:root {
  color-scheme: light;
  ${surface}
  ${sky}
  --read-meta: ${readMeta};
  --read-meta-strong: ${readMetaStrong};
  --read-ink: ${readInk};
  --read-muted: ${readMuted};
  --read-accent: ${readAccent};
  --read-line: ${readLine};
  --title-scale: ${design.defaults.titleScale};
  /* Preserve the existing system body/MiSans chrome division. */
  --read: "Microsoft YaHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", Lato, sans-serif;
  --chrome: "MiSans", "Mi Sans", system-ui, sans-serif;
  --serif: "Songti SC", "STSong", "SimSun", "Noto Serif CJK SC", serif;
  --measure: 720px;
  --gutter: 32px;
}
* { box-sizing: border-box; }
html { background: var(--paper); color: var(--ink); transition: --read-zenith 850ms cubic-bezier(.4,0,.2,1), --read-upper 850ms cubic-bezier(.4,0,.2,1), --read-lower 850ms cubic-bezier(.4,0,.2,1), --read-haze 850ms cubic-bezier(.4,0,.2,1), --read-horizon 850ms cubic-bezier(.4,0,.2,1); }
html[data-reduced="true"] { transition: none; }
body {
  margin: 0;
  min-height: 100vh;
  min-height: 100lvh;
  padding: 48px var(--gutter) 0;
  /* The root-owned sky below paints the whole viewport, so the body box and
   * its trailing margin can never expose a flat paper band. */
  background: transparent;
  color: var(--read-ink);
  font-family: var(--read);
  font-size: 18px;
  line-height: 1.9;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}
/* One fixed layer of 2–3 large soft colour domains. Each domain is its own
 * element animated only by transform, so the drift is composited rather than
 * repainting a full-screen gradient. Geometry, periods and phases come from
 * design/sky-domains.mjs, shared with the WebGL archive sky. The layer never
 * intercepts pointer input and never widens the document. */
.sky-domains {
  position: fixed;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  pointer-events: none;
  background: var(--read-haze);
}
.sky-domains i {
  position: absolute;
  display: block;
  will-change: transform;
}
${skyDomainLayers}
[data-reduced="true"] .sky-domains i, [data-reduced="true"] .sky-domains i::before { animation: none; }
.sheet {
  max-width: calc(var(--measure) + var(--gutter) * 2);
  margin: 0 auto;
  padding: 32px var(--gutter) 40px;
  /* Unified sky: the reading column is open, not a separate paper card. */
  background: none;
  border: 0;
  box-shadow: none;
}
button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 4px; }
.rd-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 18px;
  font-family: var(--chrome);
  font-size: 10px;
  letter-spacing: 1.4px;
  text-transform: uppercase;
  color: var(--read-meta);
  padding-bottom: 14px;
  border-bottom: 1px solid var(--line);
}
.rd-meta b { font-weight: 400; color: var(--read-meta-strong); }
h1 {
  font-family: var(--serif);
  font-size: calc(48px * var(--title-scale));
  line-height: 1.25;
  font-weight: 600;
  letter-spacing: .02em;
  overflow-wrap: anywhere;
  margin: 26px 0 0;
}
.rd-sub { margin: 16px 0 0; color: var(--read-muted); font-size: 14px; letter-spacing: .02em; overflow-wrap: anywhere; }
.rd-body { margin-top: 36px; overflow-wrap: anywhere; }
.rd-body p { margin: 0 0 1.1em; }
.rd-body h2, .rd-body h3, .rd-body h4 { font-weight: 600; line-height: 1.5; margin: 2.2em 0 .9em; }
.rd-body h2 { font-size: 1.375em; }
.rd-body h3 { font-size: 1.25em; }
.rd-body h4 { font-size: 1.125em; }
.rd-body a { color: var(--read-accent); text-underline-offset: 3px; }
.rd-body strong { font-weight: 600; }
.rd-body hr { border: 0; border-top: 1px solid var(--line); margin: 2.4em 0; }
.rd-body ul, .rd-body ol { padding-left: 1.5em; margin: 0 0 1.15em; }
.rd-body li { margin: .3em 0; }
.rd-body blockquote { margin: 1.6em 0; padding: .2em 0 .2em 1.2em; border-left: 2px solid var(--accent); color: var(--read-muted); }
.rd-body blockquote p:last-child { margin-bottom: 0; }
.rd-body img { display: block; max-width: min(100%, var(--w, 100%)); height: auto; margin: 1.8em auto; border: 1px solid var(--line); background: var(--panel); }
.rd-body code { font-size: .875em; background: var(--field); border-radius: 3px; color: var(--read-ink); padding: 2px 4px; overflow-wrap: break-word; }
.rd-body pre, .rd-body code { font-family: consolas, Menlo, monospace, "PingFang SC", "Microsoft YaHei"; }
.rd-body pre { background: transparent; border: 1px solid var(--line); color: var(--read-ink); line-height: 1.6; margin: 0 auto 20px; padding: 14px; overflow: auto; }
.rd-body pre code { background: none; color: var(--read-ink); font-size: .875em; padding: 0; overflow-wrap: normal; }
/* Existing syntax tokens now derive from the shared, readable semantics. */
.rd-body :is(.hljs-comment, .hljs-tag) { color: var(--read-muted); }
.rd-body :is(.hljs-subst, .hljs-punctuation, .hljs-operator) { color: var(--ink); }
.rd-body :is(.hljs-bullet, .hljs-variable, .hljs-template-variable, .hljs-selector-tag, .hljs-name, .hljs-deletion,
.hljs-symbol, .hljs-number, .hljs-link, .hljs-attr, .hljs-variable.constant_, .hljs-literal,
.hljs-title, .hljs-class .hljs-title, .hljs-title.class_, .hljs-code, .hljs-addition, .hljs-title.class_.inherited__, .hljs-string,
.hljs-built_in, .hljs-doctag, .hljs-quote, .hljs-keyword.hljs-atrule, .hljs-regexp,
.hljs-function .hljs-title, .hljs-attribute, .ruby .hljs-property, .hljs-title.function_, .hljs-section,
.hljs-type, .hljs-template-tag, .diff .hljs-meta, .hljs-keyword, .hljs-meta) { color: var(--read-accent); }
.rd-body .hljs-strong { color: var(--read-accent); font-weight: bold; }
.rd-body .hljs-emphasis { color: var(--read-accent); font-style: italic; }
.rd-body :is(.hljs-meta .hljs-keyword, .hljs-meta-keyword) { font-weight: bold; }
.rd-body table { width: 100%; border-collapse: collapse; margin: 1.6em 0; font-size: 15px; }
.rd-body th, .rd-body td { border: 1px solid var(--line); padding: 8px 12px; text-align: left; }
.rd-body th { background: var(--panel); font-weight: 600; }
.rd-foot {
  max-width: calc(var(--measure) + var(--gutter) * 2);
  margin: 22px auto 64px;
  padding: 22px var(--gutter);
  border-top: 1px solid rgba(var(--line-rgb), .4);
  background: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  font-family: var(--chrome);
  font-size: 12px;
  letter-spacing: .8px;
}
.rd-foot a { color: var(--read-ink); text-decoration: none; border-bottom: 1px solid transparent; }
.rd-foot a:hover { border-bottom-color: var(--accent); color: var(--read-accent); }
.rd-foot .back { text-transform: uppercase; }
.rd-pager { display: flex; flex-wrap: wrap; gap: 18px; color: var(--muted); }
.rd-pager a { color: var(--read-muted); overflow-wrap: anywhere; }
.rd-pager span { color: var(--read-line); }
[data-reduced="true"] button { transition: none; }
@media (max-width: 720px) {
  :root { --gutter: 20px; }
  body { padding: 16px 0 64px; }
  .sheet { padding: 28px var(--gutter) 24px; }
  h1 { font-size: calc(34px * var(--title-scale)); }
  .rd-meta { gap: 10px 16px; }
  .rd-foot { flex-direction: column; align-items: flex-start; margin-bottom: max(32px, env(safe-area-inset-bottom)); padding: 18px var(--gutter); }
}
@media (max-width: 370px) { :root { --gutter: 16px; } }
`;
}

/** Blocking first-paint setup, then one small progressive-enhancement control. */
function readerScript(rec, index) {
  const config = JSON.stringify({ design, pool, record: { id: rec.id, index }, chromaGain: skyChromaGain }).replace(/</g, "\\u003c");
  return `${SKY_MATH_SOURCE}\n${POOL_STATE_SOURCE}\n${POOL_BUTTON_SOURCE}\n(${readerRuntime.toString()})(${config});`;
}
function readerRuntime(config) {
  const { design, pool, record, chromaGain = 1 } = config, root = document.documentElement;
  const key = "rhine-archive-session";
  const poolState = createSkyPoolState();
  let poolButton;
  const readObject = (storage, name) => {
    try { const value = JSON.parse(storage().getItem(name) || "null"); return value && typeof value === "object" && !Array.isArray(value) ? value : {}; } catch { return {}; }
  };
  const saveSnapshot = snapshot => { try { sessionStorage.setItem(key, JSON.stringify(snapshot)); } catch {} };
  const base = new URL("../", location.href);
  let snapshot = readObject(() => sessionStorage, key);
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
  if (poolState.view().pool === "B") params.palette = poolState.view().palette;
  const reviewHour = query.has("hour") ? Number(query.get("hour")) : NaN;
  let hour = Number.isFinite(reviewHour) ? reviewHour : new Date().getHours() + new Date().getMinutes() / 60;
  if (!existing) snapshot = { version: 1, entered: true, selectedId: record.id, selectedIndex: record.index, parameters: params, archiveUrl: base.href };
  else snapshot.parameters = params;
  saveSnapshot(snapshot);
  // Shared sky phase relay. `skyPhase` is visible seconds since the sky first
  // appeared; it travels in the same rhine-archive-session snapshot as the
  // palette, so the archive and every reader page continue one drift instead of
  // restarting at 0. The CSS animation is shifted with the matching negative
  // delay, and pauses exactly when the document is hidden or motion is reduced.
  let skyPhase = Number.isFinite(snapshot.skyPhase) && snapshot.skyPhase >= 0 ? snapshot.skyPhase : 0;
  let phaseMark = performance.now();
  let phaseRunning = false;
  const isReduced = () => root.dataset.reduced === "true";
  const advancePhase = () => {
    if (!phaseRunning) return;
    const now = performance.now();
    skyPhase += Math.max(0, (now - phaseMark) / 1000);
    phaseMark = now;
  };
  const setPhaseRunning = running => {
    advancePhase();
    phaseMark = performance.now();
    phaseRunning = running;
    // Pause both the main mass and its inner churn lobe through one variable;
    // pseudo-elements cannot take an inline style directly.
    document.querySelector(".sky-domains")?.style.setProperty("--sky-play", running ? "running" : "paused");
  };
  const persistPhase = () => { advancePhase(); snapshot.skyPhase = skyPhase; saveSnapshot(snapshot); };
  snapshot.skyPhase = skyPhase;
  root.style.setProperty("--sky-delay", `-${skyPhase}s`);
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const rgb = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
  /* mixColors / resolveSkyKeyframes / readableOverBands are injected above from
   * design/sky-math.mjs — the same source the SPA bundles, so the two targets
   * cannot drift apart. */
  function resolveSky() {
    const state = poolState.restore();
    if (state.pool === "B") params.palette = state.palette;
    if (Object.hasOwn(pool.palettes, params.palette)) return pool.palettes[params.palette];
    const family = design.palettes[params.palette];
    return {
      light: { sky: resolveSkyKeyframes(family.light.sky, hour, design.steps), surface: family.light.surface },
      dark: { sky: resolveSkyKeyframes(family.dark.sky, hour, design.steps), surface: family.dark.surface },
    };
  }
  function paint() {
    const prefs = readObject(() => localStorage, "rhine-settings");
    const theme = prefs.colorTheme === "dark" ? "dark" : "light";
    const resolved = resolveSky();
    const palette = resolved[theme];
    root.dataset.colorTheme = theme;
    root.dataset.darkSurface = String(theme === "dark");
    root.dataset.skyPalette = params.palette;
    root.dataset.skyPool = poolState.view().pool;
    root.dataset.skyStage = "read";
    root.dataset.skyHour = hour.toFixed(2);
    root.dataset.reduced = String(typeof prefs.reduced === "boolean" ? prefs.reduced : reduced.matches);
    root.style.colorScheme = theme;
    setPhaseRunning(!document.hidden && !isReduced());
    for (const [name, value] of Object.entries(palette.surface)) {
      const channel = rgb(value).join(", ");
      root.style.setProperty(`--${name}`, value);
      root.style.setProperty(`--${name}-rgb`, channel);
      root.style.setProperty(`--theme-${name}`, value);
      root.style.setProperty(`--theme-${name}-rgb`, channel);
      root.style.setProperty(`--sky-${name}-rgb`, channel);
    }
    // Paper→sky strength mixing runs through the shared OKLab core, matching the
    // SPA and the static build output.
    const strength = params.presence;
    const readSteps = {};
    for (const name of design.steps) {
      readSteps[name] = rgb(boostChroma(mixColors(palette.surface.paper, palette.sky[name], strength), chromaGain));
      root.style.setProperty(`--read-${name}`, `rgb(${readSteps[name].join(", ")})`);
      root.style.setProperty(`--read-${name}-rgb`, readSteps[name].join(", "));
    }
    // Text can land anywhere on the fixed gradient, so derive each token against
    // both ends of the band range. Necessary meta info uses the same token.
    const bands = design.steps.map(name => readSteps[name]);
    root.style.setProperty("--read-meta", readableOverBands(palette.surface.muted, bands, 4.7));
    root.style.setProperty("--read-meta-strong", readableOverBands(palette.surface.accent, bands, 5));
    root.style.setProperty("--read-ink", readableOverBands(palette.surface.ink, bands, 4.7));
    root.style.setProperty("--read-muted", readableOverBands(palette.surface.muted, bands, 4.7));
    root.style.setProperty("--read-accent", readableOverBands(palette.surface.accent, bands, 5));
    root.style.setProperty("--read-line", readableOverBands(palette.surface.line, bands, 4.7));
    root.style.setProperty("--title-scale", String(params.titleScale));
    root.style.setProperty("--sky-title-scale", String(params.titleScale));
    root.style.setProperty("--sky-presence", String(params.presence));
    root.style.setProperty("--sky-strength", String(strength));
    const meta = document.querySelector('meta[name="theme-color"]');
    // theme-color follows the real top of the sky, not the paper underlay.
    if (meta) meta.setAttribute("content", `rgb(${readSteps.zenith.join(", ")})`);
    if (poolButton) poolButton.update(skyPoolButtonView(poolState.view(params.palette), palette, pool.order.map(name => pool.palettes[name][theme].sky.zenith), isReduced()));
    snapshot.parameters = { ...params };
    saveSnapshot(snapshot);
  }
  function syncHour() { if (Number.isFinite(reviewHour)) return; const now = new Date(); hour = now.getHours() + now.getMinutes() / 60; paint(); }
  paint();
  addEventListener("storage", event => { if (event.key === "rhine-settings") paint(); });
  addEventListener("pageshow", paint);
  reduced.addEventListener("change", paint);
  setInterval(syncHour, 5 * 60 * 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { persistPhase(); setPhaseRunning(false); }
    else { syncHour(); setPhaseRunning(!isReduced()); }
  });
  addEventListener("pagehide", () => { persistPhase(); setPhaseRunning(false); });
  addEventListener("DOMContentLoaded", () => {
    const host = document.querySelector(".sky-pool-host");
    poolButton = createSkyPoolButton({ root: host, onAdvance: () => {
      params.palette = poolState.advance().palette;
      paint();
    } });
    paint();
    const back = document.querySelector("a.back");
    const target = new URL(base);
    target.searchParams.set("archive", snapshot.selectedId || record.id);
    for (const [name, value] of Object.entries(params)) target.searchParams.set(name, String(value));
    if (Number.isFinite(reviewHour)) target.searchParams.set("hour", String(reviewHour));
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

/** First-paint theme-color: top of the default (dawn / light / noon) gradient,
 * using the same OKLab paper→sky mix as the runtime paint(). */
const firstPaintTop = (() => {
  const palette = design.palettes[design.defaults.palette].light;
  const noon = palette.sky.reduce((a, b) => (Math.abs(a.h - 12) < Math.abs(b.h - 12) ? a : b));
  const mixed = boostChroma(mixColors(palette.surface.paper, noon.zenith, design.defaults.presence), skyChromaGain);
  return `rgb(${[1, 3, 5].map(i => parseInt(mixed.slice(i, i + 2), 16)).join(", ")})`;
})();

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
<meta name="theme-color" content="${firstPaintTop}">
<meta name="description" content="${esc(rec.description || rec.subtitle || rec.title)}">
<script>${readerScript(rec, index)}</script>
<link rel="icon" href="../favicon.svg">
<link rel="stylesheet" href="../prose-fonts.css">
<link rel="stylesheet" href="../prose-read.css">
</head>
<body>
<div class="sky-domains" aria-hidden="true">${skyLayerOrder.map(() => "<i></i>").join("")}</div>
<div class="sky-pool-host"></div>
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

// Local R2 candidate freezes the existing 21 public record IDs. New drafts remain unpublished.
const records = JSON.parse(await fs.readFile(path.join(ROOT, "content", "archives.json"), "utf8")).records;
await fs.writeFile(path.join(DIST, "prose-fonts.css"), await buildFontStylesheet(), "utf8");
await fs.writeFile(path.join(DIST, "prose-read.css"), buildStylesheet() + "\n" + POOL_BUTTON_CSS + `
.sky-pool-host { position: fixed; top: max(16px, env(safe-area-inset-top)); right: max(16px, env(safe-area-inset-right)); z-index: 4; width: 44px; height: 44px; display: grid; place-items: center; }
@media (max-width: 800px) { .sheet { padding-top: 76px; } }
`, "utf8");

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
