---
title: 2026-07-12-adaydream-music-fix-log
date: 2026-07-12
layout: page
comments: false
---

# adaydream.cn 音乐盒链接修复日志

**时间：** 2026年5月25日  
**作者：** Claude Code

---

## 一、问题发现

用户反馈 adaydream.cn 网站上的音乐盒链接不稳定，经常无法播放。音乐盒是一个内嵌于 Hexo + NexT 主题博客中的「Mini Vinyl Player」（黑胶唱片风格播放器），曲库全部来自明日方舟官方音乐厂牌——塞壬唱片（Monster Siren）。

## 二、根因分析

通过系统化调试流程，对网站进行了逐层排查：

### 2.1 信息收集

首先抓取网站首页和 `/music/` 页面，确认了网站架构：Hexo 8.1.1 静态博客，NexT 7.8.0 主题，托管于 GitHub Pages，前端有一个自定义的黑胶唱片 Mini Player。播放器以硬编码 JavaScript 数组的形式内联在页面底部，包含 8 首歌曲的完整信息，其中音频 URL 均指向鹰角网络的 CDN 域名 `res01.hycdn.cn`。

### 2.2 关键发现

对全部 8 个硬编码音频 URL 逐一发起 HTTP 请求测试，结果令人震惊——**所有 8 个链接全部返回 HTTP 403 Forbidden**，无一例外。与此同时，封面图片（托管于 `web.hycdn.cn`，URL 结构中无令牌）全部正常返回 HTTP 200。

进一步分析 URL 结构发现了问题所在：

```
res01.hycdn.cn/{32位hex令牌}/{8位hex代码}/siren/audio/{日期}/{文件ID}.{ext}
```

URL 路径中包含一个 32 位的十六进制访问令牌（如 `8aad7b966f7a8069f07c094251c5a2eb`），这是 HyCDN 的防盗链鉴权机制。鹰角网络会周期性轮换这些令牌，旧的令牌直接失效。

### 2.3 验证假设

通过探索 Monster Siren 官方站点，发现了其后台 API 端点 `/api/song/{cid}`。调用该 API 获取同一首「Sanctuary Inside」的数据，返回的 sourceUrl 中令牌和代码段已完全不同：

- **硬编码（过期）：** `8aad7b966f7a8069f07c094251c5a2eb / 6A12C018`
- **API 实时获取（有效）：** `594d336b295cdbab286d352474194077 / 6A147742`

替换为新鲜 URL 后测试，音频立即返回 HTTP 200。根因确认：**硬编码的 CDN 令牌过期导致全部链接失效**。

## 三、方案设计

考虑到网站托管于 GitHub Pages（纯静态，无法运行服务端代码），需要引入外部 serverless 平台提供代理能力。评估了以下方案：

| 方案 | 优点 | 缺点 |
|------|------|------|
| 服务端代理 | 一次部署永久生效，前端无痛 | 需额外平台 |
| 定时构建 | 无需额外服务 | 令牌仍会过期，需频繁构建 |
| 换用网易云音乐 | 生态成熟 | 曲库不完全匹配 |
| 自托管音频 | 最稳定 | 版权风险 |

最终选择了**方案 A：服务端代理**，具体架构为三层：

```
浏览器 (adaydream.cn)
  → Vercel Serverless Function (代理)
    → Monster Siren API (/api/song/{cid})
      → 返回新鲜音频 URL
```

## 四、实施过程

### 4.1 Vercel 代理部署

编写了一个轻量级 Vercel Serverless Function，位于 `/api/music-proxy.js`。该函数维护 8 首歌曲的元数据（名称、艺人、封面）和对应的 Monster Siren CID，每次被调用时并发请求 8 个 `/api/song/{cid}` 端点，聚合所有新鲜 URL 后以 JSON 格式返回。配置了 Edge 缓存 1 小时（`s-maxage=3600`）和过期后后台重新验证（`stale-while-revalidate=600`），兼顾性能和时效性。

部署地址：`https://adaydream-proxy.vercel.app/api/music-proxy`

### 4.2 前端改造

在 Hexo 项目中新增了 `source/js/siren-url-loader.js`，负责在页面加载时从 Vercel 代理获取新鲜 URL，并以 30 分钟 TTL 缓存于 localStorage 。核心机制：

- **同步缓存检查**：先检查 localStorage 中是否有未过期的缓存，如有则立即可用（后续访问体验无延迟）
- **异步刷新**：缓存过期或不存在时，发起 XHR 请求获取新鲜 URL，写入 `window.__sirenUrls`
- **优雅降级**：请求失败时回退到 localStorage 中的过期缓存；若完全无缓存则使用硬编码 URL（虽然可能已失效，但不阻塞播放器初始化）

同时修改了 `source/_data/body-end.swig` 中的播放器核心代码：
1. 引入 loader 脚本（在已有播放器脚本之前加载）
2. 为 PL 数组中每首歌添加 cid 字段（与 Monster Siren API 对应）
3. 新增 resolveUrl() 函数，优先使用代理返回的新鲜 URL，回退到硬编码 URL
4. 修改 load() 函数中的 audio.src 赋值，从直接使用 t.url 改为调用 `resolveUrl(t)`

### 4.3 构建验证

本地执行 `hexo generate` 构建成功，14 个文件生成完毕。验证了生成产物：
- siren-url-loader.js 正确包含代理地址
- body-end.swig 中的修改正确嵌入到生成的 HTML
- 全部 8 首歌曲的 cid 字段正确注入

## 五、部署说明

项目通过 GitHub Actions 自动部署。推送代码到 `main` 分支后，CI 工作流自动执行 `hexo generate`，并将 `public/` 目录部署至 GitHub Pages。用户只需执行 `git push` 即可完成上线。

## 六、遗留事项

1. Vercel 免费套餐每月 10 万次请求限制，对个人博客完全足够
2. 如需添加新歌，只需在 Vercel 函数的 SONGS 数组和 body-end.swig 的 PL 数组中同步添加即可
3. Monster Siren API 的可用性依赖鹰角网络服务器，若其 API 变更需要同步更新代理代码
