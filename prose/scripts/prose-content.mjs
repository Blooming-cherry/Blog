// build 期：把博客 _posts 的散文转成文苑的 content/archives.json（卡片数据）。
// 正文页由 prose-pages.mjs 生成；两者共用 prose-source.mjs 的编号。
import fs from "node:fs/promises";
import { CATEGORY, loadRecords } from "./prose-source.mjs";

const OUT = new URL("../content/archives.json", import.meta.url);

const records = await loadRecords();

const payload = {
  categories: [CATEGORY],
  columns: [CATEGORY],
  records,
};

await fs.writeFile(OUT, JSON.stringify(payload, null, 2), "utf8");

console.log(`写入 ${records.length} 篇 → content/archives.json`);
const noSub = records.filter((r) => !r.subtitle).map((r) => r.title);
const noDesc = records.filter((r) => !r.description).map((r) => r.title);
console.log(`缺 subtitle: ${noSub.join("、") || "无"}`);
console.log(`缺 description: ${noDesc.join("、") || "无"}`);
console.log(`tag 分布: ${[...new Set(records.map((r) => r.tag))].join(" / ")}`);
