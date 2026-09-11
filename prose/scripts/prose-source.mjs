// 文苑的内容源：读博客的 _posts，拆 front-matter。
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

export function normalizeDate(raw) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(raw ?? "").trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "1970-01-01";
}

/** 正文（front-matter 之后的部分），已归一化换行。 */
export function postBody(raw) {
  const text = raw.replace(/\r\n/g, "\n");
  if (!text.startsWith("---")) return text.trim();
  const end = text.indexOf("\n---", 3);
  return end < 0 ? text.trim() : text.slice(end + 4).trim();
}

/** 读一篇：slug 即博客里的文件名（无 .md）。 */
export async function readPost(slug) {
  const raw = await fs.readFile(path.join(POSTS_DIR, `${slug}.md`), "utf8");
  return { frontMatter: parseFrontMatter(raw), body: postBody(raw) };
}

export const CATEGORY = "文苑";

/**
 * 列出全部散文并编号。
 * 编号只在这里分配一次：卡片（archives.json）和正文页（w-NNN/index.html）
 * 都从这里取 id，两边的 W-001 永远是同一篇。
 * 按日期升序 —— 阵列里由旧到新自顶向下。
 */
export async function loadRecords() {
  const files = (await fs.readdir(POSTS_DIR)).filter((f) => f.endsWith(".md"));
  const rows = [];
  for (const file of files) {
    const slug = path.basename(file, ".md");
    const raw = await fs.readFile(path.join(POSTS_DIR, file), "utf8");
    const fm = parseFrontMatter(raw);
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
