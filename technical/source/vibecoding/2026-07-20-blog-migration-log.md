---
title: 2026-07-20-blog-migration-log
date: 2026-07-20
layout: page
comments: false
---

# 博客迁移日志 — 2026-07-20

## 目标

将原来部署在 `adaydream.cn` 的 Hexo 静态博客整体迁移到子域名 `blog.adaydream.cn`，为后续主站导航页腾出位置。

## 服务器信息

| 项目 | 值 |
|------|-----|
| 云服务商 | 阿里云 ECS |
| 公网 IP | `x.x.x.x` |
| 系统 | Alibaba Cloud Linux |
| Nginx | 宝塔面板安装，配置目录 `/www/server/panel/vhost/nginx/` |
| Nginx 主配置 | `/www/server/nginx/conf/nginx.conf` |
| 旧站点路径 | `/var/www/my-site` |
| 新站点路径 | `/var/www/blog` |
| SSL | certbot (Let's Encrypt)，证书路径 `/etc/letsencrypt/live/` |

## 操作记录

### 1. DNS 解析

阿里云云解析 DNS → `adaydream.cn` → 添加记录：

| 主机记录 | 类型 | 记录值 |
|----------|------|--------|
| `blog` | A | `x.x.x.x` |

> 注意：`*.blog.adaydream.cn`（泛解析）不匹配 `blog.adaydream.cn` 本身，必须单独加一条 `blog`。

### 2. ECS 安装 Docker

阿里云 Linux 不在 Docker 官方脚本支持列表，改用阿里云镜像源：

```bash
sudo yum install -y yum-utils
sudo yum-config-manager --add-repo https://mirrors.aliyun.com/docker-ce/linux/centos/docker-ce.repo
sudo yum install -y docker-ce docker-ce-cli containerd.io docker-compose-plugin
sudo systemctl enable docker --now
```

配置镜像加速器（/etc/docker/daemon.json）：
```json
{
  "registry-mirrors": [
    "https://registry.cn-hangzhou.aliyuncs.com",
    "https://docker.1ms.run"
  ]
}
```

### 3. 安全组开放端口（阿里云 ECS）

| 协议 | 端口 | 用途 |
|------|------|------|
| TCP | 443 | HTTPS 访问 |
| UDP | 3478 | NetBird STUN（已完成，但服务已停用，可删除） |

### 4. 服务器目录迁移

```bash
sudo mv /var/www/my-site /var/www/blog
```

### 5. Nginx 配置

创建 `/www/server/panel/vhost/nginx/blog.adaydream.cn.conf`：

```nginx
server {
    listen 80;
    server_name blog.adaydream.cn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name blog.adaydream.cn;
    root /var/www/blog;
    index index.html index.htm;

    ssl_certificate /etc/letsencrypt/live/blog.adaydream.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/blog.adaydream.cn/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

### 6. SSL 证书

遇到两个坑：
- certbot 默认找 `/etc/nginx/nginx.conf`，宝塔 Nginx 主配置在 `/www/server/nginx/conf/nginx.conf`，导致 `--nginx` 插件不可用
- 解决办法：用 `--webroot` 模式申请，纯 HTTP 的 Nginx 配置先生效，证书拿到后再改回 HTTPS

```bash
sudo certbot certonly --webroot -w /var/www/blog -d blog.adaydream.cn
```

证书到期：2026-10-18，已设置自动续期。

### 7. 本地代码修改

| 文件 | 改动 |
|------|------|
| `technical/_config.yml` | `url: https://adaydream.cn` → `https://blog.adaydream.cn` |
| `.github/workflows/deploy.yml` | rsync 目标 `/var/www/my-site/` → `/var/www/blog/` |

已提交推送至 GitHub `main` 分支，Actions 自动构建部署。

### 8. NetBird 尝试（已放弃）

- 曾计划在 `netbird.adaydream.cn` 部署 NetBird 中继服务用于内网穿透
- 已安装 Docker 并拉取镜像，容器曾短暂运行
- 后决定不再需要，容器和 `/opt/netbird` 目录已清理
- 阿里云 DNS 中 `netbird` 解析记录需手动删除

## 踩坑记录

| 问题 | 解决 |
|------|------|
| AliCloud Linux 不在 Docker 官方支持列表 | 用阿里云 yum 镜像源手动安装 |
| Docker Hub 被墙 | 配国内镜像加速器 |
| `docker.sock` 权限不足 | `sudo usermod -aG docker admin` 或直接 `sudo` |
| `*.blog` 泛解析不匹配裸 `blog` | 单独加一条 `blog` 主机记录 |
| certbot `--nginx` 插件找不到宝塔 nginx.conf | 改用 `--webroot` 模式 |
| Nginx tee 追加导致配置文件内容重复 | 先 `rm` 再 `tee` |
| `newgrp` 不生效 | 直接在命令前加 `sudo` |
| GitHub curl HTTP2 错误 | 用 `--http1.1` 或 ghproxy 代理 |

## 当前架构

```
adaydream.cn          → （主域名，暂不解析）
blog.adaydream.cn     → x.x.x.x:/var/www/blog（Hexo 博客）✅
sonnect.adaydream.cn  → （预留，导航页，待部署）
netbird.adaydream.cn  → （已放弃，DNS 记录待删除）
```

## 待办

- [ ] 阿里云 DNS 删除 `netbird` 解析记录
- [ ] 部署 `sonnect.adaydream.cn` 导航页（`D:\my-blog\personal\subdomain-nav.html`）
- [ ] 处理 `adaydream.cn` 旧 Nginx 配置（删除或改为跳转）
- [ ] 阿里云 DNS 删除 `@` 和 `www` 的旧记录（如不再需要主域名解析）
- [ ] ECS 安全组删除不再需要的 UDP 3478 规则
