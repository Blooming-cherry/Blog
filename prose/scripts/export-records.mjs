import fs from "node:fs/promises";
import { loadContent, archiveText } from "./archive-content.mjs";

// Validate the entire input before writing any downloads.
const { records } = await loadContent();
const output = new URL("../public/archives/", import.meta.url);
await fs.mkdir(output, { recursive: true });

// 这些 .txt 是【产物】：源是 _posts，删掉一篇散文后对应文件必须跟着消失。
// 只写不删的话，本地连续构建会留下一份不再对应任何文章的下载链接。
for (const name of await fs.readdir(output)) {
  if (/^RHINE-LAB-.*\.txt$/.test(name)) await fs.rm(new URL(name, output));
}

for (const record of records) {
  await fs.writeFile(
    new URL(`RHINE-LAB-${record.id}.txt`, output),
    archiveText(record),
    "utf8",
  );
}
console.log(`Prepared ${records.length} downloadable archive records.`);
