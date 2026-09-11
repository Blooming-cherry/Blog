import fs from "node:fs/promises";

// 原型版（throwaway）：为「文苑」散文栏目重写的校验器。
//
// 相对上游的三处放松（上游把内容模型硬锁在 5 分类 / 40 份 / 每列 8 份）：
//   1. 分类数 5 → 任意非空
//   2. 档案数 40 → 任意非空
//   3. 每列 8 份 → 取消
// 保留的约束是真正有用的那些：id 顺序稳定、分类归属有效、日期格式。
const requiredFields = ["id", "title", "date", "tag", "category", "slug"];
const isText = (value) => typeof value === "string" && value.trim().length > 0;

export function validateContent(content) {
  const errors = [];
  if (!content || typeof content !== "object" || Array.isArray(content)) {
    throw new Error("档案数据必须是 JSON 对象。");
  }

  for (const key of ["categories", "columns"]) {
    const names = content[key];
    if (!Array.isArray(names) || names.length === 0 || !names.every(isText)) {
      errors.push(`${key}：必须包含至少一个非空分类名称`);
    } else if (new Set(names).size !== names.length) {
      errors.push(`${key}：分类名称不能重复`);
    }
  }

  const categories = Array.isArray(content.categories) ? content.categories : [];
  const columns = Array.isArray(content.columns) ? content.columns : [];
  if (
    categories.some((name) => !columns.includes(name)) ||
    columns.some((name) => !categories.includes(name))
  ) {
    errors.push("categories 与 columns 必须包含相同的分类（顺序可以不同）");
  }

  const records = Array.isArray(content.records) ? content.records : [];
  if (records.length === 0) errors.push("records：至少需要一篇散文");

  const ids = new Set();
  records.forEach((record, index) => {
    const label = `records[${index}]`;
    if (!record || typeof record !== "object" || Array.isArray(record)) {
      errors.push(`${label}：必须是档案对象`);
      return;
    }
    for (const key of requiredFields) {
      if (!isText(record[key])) errors.push(`${label}.${key}：必须是非空文本`);
    }
    const expectedId = `W-${String(index + 1).padStart(3, "0")}`;
    if (record.id !== expectedId)
      errors.push(`${label}.id：应为 ${expectedId}，编号须按顺序保持稳定`);
    if (ids.has(record.id)) errors.push(`${label}.id：重复编号 ${record.id}`);
    ids.add(record.id);
    if (!categories.includes(record.category))
      errors.push(`${label}.category：未知分类 ${record.category}`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(record.date ?? "")))
      errors.push(`${label}.date：应为 YYYY-MM-DD`);
    // subtitle / description 允许为空：博客里确有散文没有副题或诗引。
  });

  if (errors.length)
    throw new Error(`档案数据校验失败：\n- ${errors.join("\n- ")}`);
  return content;
}

export async function loadContent() {
  return validateContent(
    JSON.parse(
      await fs.readFile(
        new URL("../content/archives.json", import.meta.url),
        "utf8",
      ),
    ),
  );
}

/** 导出为可下载的纯文本档案。 */
export function archiveText(r) {
  const lines = [
    "﻿文苑 · PROSE ARCHIVE",
    `FILE ${r.id} / ${r.title}`,
    "",
    `编目日期：${r.date}`,
    `分类：${r.tag}`,
  ];
  if (r.subtitle) lines.push(`副题：${r.subtitle}`);
  if (r.description) lines.push("", "引", r.description);
  // 正文页的地址是编号页 /prose/w-NNN/，不是 slug —— 与 prose-pages.mjs 同源。
  lines.push("", `本篇全文见 /prose/${String(r.id).toLowerCase()}/`);
  return lines.join("\n") + "\n";
}
