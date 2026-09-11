// 文苑的内容自检：卡片数据（content/archives.json）与它派生出的下载文件。
// 运行：npm run check:content（需要先跑过一次 prebuild，产物才在）。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import {
  loadContent,
  validateContent,
  archiveText,
} from "./archive-content.mjs";
import { escapeHtml } from "../src/html.ts";

const content = await loadContent();

test("每篇散文的下载文件与卡片数据一致（含 UTF-8 BOM）", async () => {
  for (const record of content.records) {
    assert.equal(
      (
        await readFile(
          new URL(`../public/archives/RHINE-LAB-${record.id}.txt`, import.meta.url),
          "utf8",
        )
      ).replace(/\r\n/g, "\n"),
      archiveText(record),
    );
  }
});

test("编号从 W-001 起连续，且与正文页目录一一对应", async () => {
  content.records.forEach((record, index) => {
    assert.equal(record.id, `W-${String(index + 1).padStart(3, "0")}`);
    assert.match(record.slug, /\S/, "slug 不能为空，正文页靠它去 _posts 取原文");
  });
});

test("下载文件里指向的是编号页，不是 slug", () => {
  const text = archiveText(content.records[0]);
  assert.match(text, new RegExp(`/prose/${content.records[0].id.toLowerCase()}/`));
});

const invalidCases = [
  ["缺 title", (c) => { delete c.records[0].title; }, /records\[0\]\.title/],
  ["title 全空白", (c) => { c.records[0].title = "  "; }, /records\[0\]\.title/],
  ["编号重复", (c) => { c.records[1].id = c.records[0].id; }, /编号/],
  ["编号错位", (c) => { [c.records[0], c.records[1]] = [c.records[1], c.records[0]]; }, /W-001/],
  ["未知分类", (c) => { c.records[0].category = "未知"; }, /未知分类/],
  ["日期格式错", (c) => { c.records[0].date = "2026/04/22"; }, /YYYY-MM-DD/],
  ["空档案集", (c) => { c.records = []; }, /至少需要一篇/],
  ["空分类表", (c) => { c.categories = []; }, /categories/],
  ["分类重复", (c) => { c.categories.push(c.categories[0]); }, /不能重复/],
  ["categories 与 columns 不一致", (c) => { c.columns[0] = "其他"; }, /相同的分类/],
  ["记录为 null", (c) => { c.records[0] = null; }, /必须是档案对象/],
];

for (const [name, mutate, error] of invalidCases) {
  test(`拒绝：${name}`, () => {
    const invalid = structuredClone(content);
    mutate(invalid);
    assert.throws(() => validateContent(invalid), error);
  });
}

test("副题与引可以留空（博客里确有散文没有这两项）", () => {
  const edited = structuredClone(content);
  edited.records[0].subtitle = "";
  edited.records[0].description = "";
  assert.equal(validateContent(edited), edited);
});

test("纯文本里的标点在 HTML 中转义、在下载文件中原样保留", () => {
  const title = `<玻璃> & "实验" 'A'`;
  const edited = structuredClone(content);
  edited.records[0].title = title;
  validateContent(edited);
  assert.equal(
    escapeHtml(title),
    "&lt;玻璃&gt; &amp; &quot;实验&quot; &#39;A&#39;",
  );
  assert.ok(archiveText(edited.records[0]).includes(title));
});
