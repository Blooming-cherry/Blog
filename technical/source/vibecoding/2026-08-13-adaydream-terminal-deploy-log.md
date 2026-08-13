---
title: 2026-08-13-adaydream-terminal-deploy-log
date: 2026-08-13
layout: page
comments: false
---

# 主站导航页部署日志 — 2026-08-13

## 目标

将 Rhine Lab 主题的终端导航页（`D:\my-blog\terminal\index.html`）部署到主域名 `adaydream.cn`，接入明日方舟官方音乐源作为背景乐，并打通 GitHub Actions 自动同步，实现「本地改 → push → 自动上线」。

## 背景

`adaydream.cn` 主域名在博客迁至子域名后一度空置（无解析）。本次把预留的终端导航页部署上来，作为主站入口，串联 Blog、Sonnect 与 GitHub 个人仓库。合规方面，域名已完成 ICP 备案（域名级备案，子域名自动跟随），故选择部署到境内 ECS。

## 服务器信息

| 项目 | 值 |
|------|-----|
| 云服务商 | 阿里云 ECS |
| 公网 IP | `47.116.103.176` |
| 系统 | Alibaba Cloud Linux |
| Web 面板 | 宝塔面板 |
| Nginx | 1.28.3，配置目录 `/www/server/panel/vhost/nginx/` |
| SSL | certbot（Let's Encrypt），`/etc/letsencrypt/live/adaydream.cn/`，到期 2026-10-07 |
| 站点根目录 | `/var/www/adaydream` |
| 本地源文件 | `D:\my-blog\terminal\index.html`（单文件，33019 字节） |

## 操作记录

### 1. 音乐源选型

背景乐选用明日方舟「孤星」OST 的《Control's Wishes》，对比三种来源：

| 方案 | 版权/合规 | 速度 | 稳定性 | 结论 |
|------|-----------|------|--------|------|
| 网易云外链 | 灰色（非官方授权直链） | 一般 | 302 重定向到 http，触发混合内容 | ❌ 弃用 |
| 官方 Monster Siren 直链 | 官方资源 | 快（CDN） | 令牌会轮换，需定期更新 | ✅ 选用 |
| 本地上传 | 个人使用风险最低 | 依赖服务器带宽 | 最稳 | 备选 |

通过 Monster Siren 官方 API `https://monster-siren.hypergryph.com/api/song/{cid}`（`cid=880337`）拿到无损 WAV 直链（https，约 52MB），硬编码进 `<audio src>`。本次仅一首歌，故未走 Vercel 代理（`adaydream-proxy`），直接使用官方直链，天然规避混合内容问题。

### 2. 修复音乐无法播放的 bug

**根因**：`<script>` 块在 `<audio>` 标签之前执行，`document.getElementById('bgm')` 返回 `null`，事件监听器从未绑定。

**修复**：将背景乐开关逻辑包进 `window.addEventListener('DOMContentLoaded', ...)`，与页面原有 Logo 动画代码时序一致。

### 3. 服务器部署

1. 创建站点目录 `/var/www/adaydream/`（owner `admin:admin`）
2. 修改 Nginx vhost 配置 `adaydream.cn.conf`：`root /var/www/my-site`（已删目录）→ `/var/www/adaydream`
3. `sudo nginx -t` 验证通过 → `sudo nginx -s reload`
4. 通过宝塔面板「文件」上传 `index.html`（33019 字节）

### 4. Nginx 验证

- HTTP → HTTPS 301 跳转正常（`listen 80` 块强制跳转）
- HTTPS 直接返回页面正文：`<!DOCTYPE html>` → `<title>Adaydream Terminal — 导航</title>`

### 5. 接入 GitHub Actions 自动同步

1. `.gitignore` 移除 `terminal/` 排除项，页面进 git
2. 新建 `.github/workflows/deploy-terminal.yml`：监听 `terminal/**` 的 push，rsync `terminal/index.html` → `/var/www/adaydream/index.html`
3. 复用博客已有的 `SSH_KEY` / `SSH_USER` / `SSH_HOST` 三个 secret（该 deploy key 对 `/var/www/adaydream/` 有写权限）
4. 推送后 CI 自动跑通，日志确认 `index.html` 共 33,019 字节传输成功

## 踩坑记录

| 问题 | 解决 |
|------|------|
| 音乐不播放 | bgm 逻辑包进 `DOMContentLoaded`，避免 `getElementById` 拿到 null |
| 网易云外链 302 到 http，触发混合内容 | 改用 Monster Siren 官方 https wav 直链 |
| Monster Siren API 无 CORS 头 | 直接用 `<audio>` 播放不需要 CORS（未走 fetch） |
| 本地 Windows 到服务器无 SSH 密钥 | 首次用宝塔网页上传；CI 用仓库里的 deploy key |
| git push 走 `127.0.0.1:7897` 代理，代理未开报错 | 临时直连绕过：`git -c http.https://github.com.proxy= push` |
| http 自测返回 301，误以为失败 | 301 是配置里故意的 HTTP→HTTPS 跳转，改用 https 测试 |
| 证书只覆盖裸域，不含 `www` | 待处理（见待办） |

## 当前架构

```
adaydream.cn        → 47.116.103.176:/var/www/adaydream（终端导航页）✅（DNS A 记录待加）
blog.adaydream.cn   → 47.116.103.176:/var/www/blog（Hexo 博客）✅
sonnect.adaydream.cn→ （预留，导航页，待部署）
```

## 待办闭环核对

呼应 2026-07-20《博客迁移日志》的待办清单，逐条标注当前状态：

| 旧日志待办 | 当前状态 |
|------|------|
| 删除 `netbird` 解析记录 | ✅ 已删除 |
| 部署 `adaydream.cn` 主域名（原「暂不解析」） | ✅ 已部署（本日志），仅剩 DNS A 记录收尾 |
| 处理 `adaydream.cn` 旧 Nginx 配置（`root` 指向已删目录） | ✅ 已处理（`root` → `/var/www/adaydream`） |
| 部署 `sonnect.adaydream.cn` 导航页 | ⏳ 仍待办（本次未涉及） |
| 删除 ECS 安全组 UDP 3478 规则 | ✅ 已完成 |

## 待办

- [ ] 阿里云 DNS 加 `@` A 记录 → `47.116.103.176`（部署最后一步）
- [ ] 补充页面 favicon 与 og 分享标签
- [ ] 留意 wav 直链令牌轮换：HyCDN 防盗链令牌过期后需重新调 API 更新 `src`
