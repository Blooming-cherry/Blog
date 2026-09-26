// 文苑的内容源：读博客的 _posts（以及只进文苑的 _prose），拆 front-matter。
// prose-content.mjs（出卡片用的 archives.json）和 prose-pages.mjs（出正文页）
// 共用这一份，避免 CRLF 那个坑被各写一遍、然后只修好其中一处。
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 博客仓库里的散文目录。
 *
 * 相对自身定位，而不是写死 D:/my-blog —— prose/ 与 technical/ 在同一个仓库里
 * 是兄弟目录，本地检出和 CI 检出因此走同一条路径推导，不需要在 CI 上再配一次。
 * PROSE_POSTS_DIR 仍可覆盖（想把文苑指向别处的文章时用）。
 */
export const POSTS_DIR = process.env.PROSE_POSTS_DIR
  ? path.resolve(process.env.PROSE_POSTS_DIR)
  : fileURLToPath(new URL("../../technical/source/_posts", import.meta.url));

/**
 * 只进文苑、不进博客的散文目录。
 *
 * 博客那边不用配 exclude：Hexo 只 glob `_posts/`，而且把任何 `_` 开头的路径
 * 当隐藏文件跳过，`source/_prose/` 因此天然不会被收成博文。
 * 它与 POSTS_DIR 同级，正文页那边的附件目录（POSTS_DIR/../attachments）不受影响。
 */
export const PROSE_ONLY_DIR = process.env.PROSE_ONLY_POSTS_DIR
  ? path.resolve(process.env.PROSE_ONLY_POSTS_DIR)
  : fileURLToPath(new URL("../../technical/source/_prose", import.meta.url));

/** 拆出 front-matter；支持直引号/弯引号包裹，以及多行引号字符串。 */
export function parseFrontMatter(raw) {
  // 博客文件是 CRLF。必须先归一化：否则切片后最后一行残留 \r，
  // 而 JS 正则的 `.` 不匹配 \r，会让 `^key:\s*(.*)$` 对最后一行整行失配。
  const text = raw.replace(/\r\n/g, "\n");
  if (!text.startsWith("---")) return {};
  const end = text.indexOf("\n---", 3);
  if (end < 0) return {};
  const lines = text.slice(3, end).split("\n");
  const out = {};
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z_][\w-]*):\s*(.*)$/.exec(lines[i]);
    if (!m) continue;
    const key = m[1];
    let value = m[2].trim();

    // 块序列：tags:\n  - a\n  - b
    if (value === "") {
      const items = [];
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
        items.push(lines[++i].replace(/^\s+-\s+/, "").trim());
      }
      if (items.length) { out[key] = items; continue; }
      out[key] = "";
      continue;
    }

    // 引号包裹，可能跨行
    const quote = value[0];
    if (quote === '"' || quote === "'" || quote === "\u201c") {
      const closer = quote === "\u201c" ? "\u201d" : quote;
      let body = value.slice(1);
      let guard = 0;
      while (!body.includes(closer) && i + 1 < lines.length && guard++ < 50) {
        body += "\n" + lines[++i];
      }
      const closeAt = body.lastIndexOf(closer);
      if (closeAt >= 0) body = body.slice(0, closeAt);
      out[key] = body.trim();
      continue;
    }

    out[key] = value;
  }
  return out;
}

export function pickTag(fm) {
  if (Array.isArray(fm.tags) && fm.tags.length) return fm.tags.join(" / ");
  if (Array.isArray(fm.tag) && fm.tag.length) return fm.tag.join(" / ");
  if (typeof fm.tag === "string" && fm.tag.trim()) {
    // 博客里存在 `tag: -C语言` 这种畸形写法，本意是列表项
    return fm.tag.trim().replace(/^-/, "").trim() || "散文";
  }
  return "散文";
}

/**
 * 这篇是否只进博客、不进文苑 —— front-matter 里写 `prose: false`。
 *
 * 默认全部进文苑，只有显式标 false 的才剔出去。开关选这个方向是因为
 * 两种失败不一样：忘了标 → 文章冒进文苑（页面上看得见，好发现）；
 * 若反过来做成「列进清单才进」，忘了登记就是散文静默缺席，不会报错。
 *
 * 博客侧（Hexo）不认识这个键，写不写都不影响渲染，也不需要配 exclude。
 */
export function isBlogOnly(fm) {
  return String(fm.prose ?? "").trim().toLowerCase() === "false";
}

/**
 * 把 front-matter 的 date 归一成 `YYYY-MM-DD`。
 *
 * 分隔符不能只认连字符：Hexo 自己接受 `2026/09/24`（斜杠），历史上也确实
 * 有人这么写过。只认 `-` 的话，斜杠日期会静默退回 1970-01-01 —— 不报错，
 * 但那篇会排到文苑阵列最前面，看起来像「新文章变成了最旧的」。
 * 月份/日期补齐两位，`2026/9/4` 也能正确参与排序。
 */
export function normalizeDate(raw) {
  const m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(String(raw ?? "").trim());
  if (!m) return "1970-01-01";
  return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
}

/** 正文（front-matter 之后的部分），已归一化换行。 */
export function postBody(raw) {
  const text = raw.replace(/\r\n/g, "\n");
  if (!text.startsWith("---")) return text.trim();
  const end = text.indexOf("\n---", 3);
  return end < 0 ? text.trim() : text.slice(end + 4).trim();
}

/** 列出目录里的 .md；目录不存在时当空 —— _prose/ 允许整天不在。 */
async function listMarkdown(dir) {
  try {
    return (await fs.readdir(dir)).filter((f) => f.endsWith(".md"));
  } catch (err) {
    if (err.code === "ENOENT") return [];
    throw err;
  }
}

/** 读一篇：slug 即文件名（无 .md）。两个源目录都查，_posts 优先。 */
export async function readPost(slug) {
  for (const dir of [POSTS_DIR, PROSE_ONLY_DIR]) {
    try {
      const raw = await fs.readFile(path.join(dir, `${slug}.md`), "utf8");
      return { frontMatter: parseFrontMatter(raw), body: postBody(raw) };
    } catch (err) {
      if (err.code !== "ENOENT") throw err;
    }
  }
  throw new Error(`散文 ${slug}.md 在 _posts 和 _prose 里都找不到`);
}

export const CATEGORY = "文苑";

/**
 * 列出全部散文并编号。
 * 编号只在这里分配一次：卡片（archives.json）和正文页（w-NNN/index.html）
 * 都从这里取 id，两边的 W-001 永远是同一篇。
 * 按日期升序 —— 阵列里由旧到新自顶向下。
 * 两个源目录合起来排：编号与目录无关，只跟日期走。
 */
export async function loadRecords() {
  // _posts 先读：同一个 slug 出现在两处说明放错了目录，以博客那份为准并吱一声。
  const entries = [];
  for (const dir of [POSTS_DIR, PROSE_ONLY_DIR]) {
    for (const file of await listMarkdown(dir)) {
      const slug = path.basename(file, ".md");
      if (entries.some((e) => e.slug === slug)) {
        console.warn(`同名散文同时存在于两个源目录，以 _posts 为准：${slug}`);
        continue;
      }
      entries.push({ slug, dir });
    }
  }

  const rows = [];
  for (const { slug, dir } of entries) {
    const raw = await fs.readFile(path.join(dir, `${slug}.md`), "utf8");
    const fm = parseFrontMatter(raw);
    // 标了 prose: false 的只留在博客，不进文苑阵列。
    if (isBlogOnly(fm)) continue;
    rows.push({
      slug,
      title: String(fm.title ?? slug).trim(),
      date: normalizeDate(fm.date),
      subtitle: String(fm.subtitle ?? "").trim(),
      description: String(fm.description ?? "").trim(),
      tag: pickTag(fm),
    });
  }
  rows.sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : a.title.localeCompare(b.title));

  return rows.map((r, i) => ({
    id: `W-${String(i + 1).padStart(3, "0")}`,
    ...r,
    category: CATEGORY,
  }));
}
