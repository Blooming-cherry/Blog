# 卡片数据（构建产物）

`archives.json` **不手改、也不入库**——它是 `scripts/prose-content.mjs` 从
`technical/source/_posts/*.md` 生成的产物，每次 `npm run dev` / `npm run build`
之前自动重写。要改卡片上的文字，改散文的 front-matter。

字段说明：

| 字段 | 来源 | 说明 |
| --- | --- | --- |
| `id` | 自动 | `W-001` 起，按 `date` 升序分配。卡片和正文页 `/prose/w-NNN/` 共用它 |
| `slug` | 文件名 | 去掉 `.md`，用来回 `_posts` 取原文 |
| `title` | `title` | 卡片标题 |
| `date` | `date` | 归一化成 `YYYY-MM-DD` |
| `subtitle` | `subtitle` | 副题，可空 |
| `description` | `description` | 卡片上的引文，可空 |
| `tag` | `tags` / `tag` | 取不到时落回 `散文` |
| `category` | 固定 | 恒为 `文苑`，检索筛选器只有一个分类 |

`categories` 与 `columns` 都只有一个「文苑」，两者必须一致——阵列现在是单列长阵，
不再按分类分列。

校验规则在 `scripts/archive-content.mjs`：编号必须从 `W-001` 起连续、
分类必须已声明、日期必须是 `YYYY-MM-DD`；`title`/`slug` 不能为空，
`subtitle`/`description` 允许为空。跑 `npm run check:content` 验证。
