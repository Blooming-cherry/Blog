---
title: 2026-07-12-blog-deployment-log
date: 2026-07-12
layout: page
comments: false
---

# Hexo 博客部署日志：从本地到自动部署

> **目标**：将 Hexo 博客从本地 `D://my-blog/my-blog` 部署到阿里云服务器，并通过 GitHub Actions 实现推送即自动部署。
>
> **涉及节点**：
> - 本地 Windows 开发机
> - GitHub (`Blooming-cherry/blooming-cherry.github.io`)
> - 阿里云轻量应用服务器（上海）`x.x.x.x`，宝塔面板，用户 `admin`
>
> **状态**：🔄 大部分完成 — GitHub Actions 自动部署已跑通（GitHub Pages + 阿里云服务器双部署）；待完成：宝塔面板 Nginx 站点、SSL 证书。

---

## 阶段一：本地开发环境（Windows）

### 1.1 项目初始化 ✅

```
路径：D://my-blog/my-blog
框架：Hexo
Git 仓库：[email]:Blooming-cherry/blooming-cherry.github.io.git
```

### 1.2 前置条件

```
✅ SSH 私钥已配置（本地）
✅ sudo 可执行（服务器上）
```

### 1.3 待办：配置 GitHub Actions 自动部署 ⏳

用户请求配置 GitHub Actions 实现自动部署——此任务尚未开始。

---

## 阶段二：服务器端部署（阿里云）

### 2.1 服务器基本信息

| 项目 | 值 |
|------|-----|
| 主机名 | `iZuf6a5zotmktmnd9w4deeZ` |
| 公网 IP | `x.x.x.x` |
| 用户 | `admin`（非 root） |
| 面板 | 宝塔（aaPanel） |
| Node | v22.22.2 |
| npm | 10.9.7 |
| Nginx 配置路径 | `/www/server/nginx/conf/nginx.conf` |
| Vhost 路径 | `/www/server/panel/vhost/nginx/` |
| Web 根目录 | 计划 `/var/www/my-site`（未创建成功） |

### 2.2 Hexo 项目已在服务器上

```bash
cd ~/my-site
npm install && npx hexo generate
# ✅ 安装成功（470 个包）
# ✅ 生成成功：58 files generated in 1.54 s
```

**🔴 问题 2.2.1：`public/` 目录消失**

**现象**：
```bash
ls ~/my-site/public/ 2>/dev/null
# 输出：没有public目录
```

**详情**：
- `hexo generate` 输出显示已成功生成了 58 个文件（包括 `index.html`、`archives/index.html`、各类标签页等）
- 但随后 `ls ~/my-site/public/` 返回"没有public目录"
- 列出 `~/my-site` 根目录内容时也没有 `public/` 子目录

**可能原因**：
- `hexo generate` 生成到的目标路径与预期不符（需检查 `_config.yml` 中的 `public_dir` 配置）
- 文件可能被生成到其他位置（如 `.deploy_git/`）
- 或者 `hexo clean` 在之后某个操作中被执行了

**状态**：⚠️ 待排查

---

### 2.3 Nginx 站点配置

**🔴 问题 2.3.1：Nginx 没有站点专属虚拟主机配置**

**现象**：

```bash
sudo cat /www/server/nginx/conf/nginx.conf
```

Nginx 主配置中 `http` 块内只有 phpmyadmin 的 server 块：

```nginx
server {
    listen 888;
    server_name phpmyadmin;
    root  /www/server/phpmyadmin;
    allow 127.0.0.1;
    allow ::1;
    deny all;
    ...
}
include /www/server/panel/vhost/nginx/*.conf;
```

末尾 `include` 会加载 vhost 目录下的 `.conf` 文件，但该目录下没有任何站点配置：

```bash
sudo ls /www/server/panel/vhost/nginx/
# 输出：
# 0.site_total_log_format.conf
# 0.websocket.conf
# phpfpm_status.conf
# tcp
# waf2monitor_data.conf
```

**结论**：没有为博客站点创建 Nginx vhost 配置文件。这是导致下文 `x.x.x.x 关闭了连接` 错误的根因——Nginx 根本不知道该把博客域名指向哪个目录。

**状态**：⚠️ 需要在宝塔面板中创建网站，或手动编写 vhost .conf 文件。

---

### 2.4 站点文件部署

**🔴 问题 2.4.1：`/var/www/my-site` 目录不存在且无创建权限**

```bash
mkdir -p /var/www/my-site
# Permission denied

ls /var/www/my-site
# No such file or directory
```

`admin` 用户对 `/var/www/` 没有写入权限，需要用 `sudo`。

---

**🔴 问题 2.4.2：`sudo cp` 时找不到源文件**

```bash
sudo mkdir -p /var/www/my-site    # ✅ 成功
sudo cp -r ~/my-site/public/* /var/www/my-site/
# cp: cannot stat '/root/my-site/public/*': No such file or directory
```

**根因**：`sudo` 执行时 `~` 被解析为 `/root`（root 用户的主目录），而不是 `/home/admin`。Hexo 项目在 `/home/admin/my-site/`，但 root 用户下 `/root/my-site/` 并不存在。

加上之前的 `public/` 目录问题，这个命令无论如何都会失败。

**状态**：⚠️ 待解决目录问题和权限问题。

---

## 阶段三：Git / GitHub 集成

### 3.1 Git 仓库克隆

**🔴 问题 3.1.1：SSH 公钥认证失败**

```bash
git clone [email]:Blooming-cherry/blooming-cherry.github.io.git ~/my-site
```

**输出**：
```
The authenticity of host 'github.com (20.205.243.166)' can't be established.
ECDSA key fingerprint is SHA256:p2QAMXNIC1TJYWeIOttrVc98/R1BUFWu3/LiyKgUfQM.
Are you sure you want to continue connecting (yes/no/[fingerprint])? yes
Warning: Permanently added 'github.com,20.205.243.166' (ECDSA) to the list of known hosts.
[email]: Permission denied (publickey).
fatal: Could not read from remote repository.
```

**详情**：
- 首次连接 GitHub，ECDSA host key 已添加到 `known_hosts` ✅
- 但公钥认证被 GitHub 拒绝

**根因排查过程**：

```bash
# admin 用户有部署密钥
# 尝试复制密钥到 root（需要的 target 位置）
mkdir -p /root/.ssh                                    # Permission denied
cp /home/admin/.ssh/github-deploy /root/.ssh/          # Permission denied
cp /home/admin/.ssh/config /root/.ssh/                 # Permission denied
chmod 700 /root/.ssh                                    # Permission denied
chmod 600 /root/.ssh/github-deploy                      # Permission denied
chmod 600 /root/.ssh/config                             # Permission denied
```

**根因分析**：
- `admin` 用户没有权限访问 `/root/` 及其子目录
- Git/SSH 操作应该是用 `admin` 用户执行的，但 SSH 可能尝试在 `/root/.ssh/` 查找密钥（取决于配置）
- 或者密钥文件 `github-deploy` 未添加到 GitHub 仓库的 Deploy Keys 中
- 或者 SSH config 未正确配置 `IdentityFile` 指向 `/home/admin/.ssh/github-deploy`

**可能的解决方案**：
1. 用 `sudo` 执行 `/root/.ssh/` 相关操作
2. 或者确保 `admin` 用户的 SSH config 正确指向密钥文件，以 `admin` 身份直接执行 git 命令（不使用 sudo）
3. 在 GitHub 仓库 Settings → Deploy Keys 添加服务器的公钥

**状态**：⚠️ 待解决

---

### 3.2 HTTPS 访问问题

**🔴 问题 3.2.1：使用 HTTPS 无法访问**

用户在本地可能遇到 HTTPS 访问问题（回溯中提到"为什么 https 就不能访问"）。

**大概率原因**：Nginx 没有配置 SSL 证书，只监听了 80 端口（HTTP），443 端口（HTTPS）没有相应的 server 块。

**状态**：⚠️ Nginx 站点配置完成后需同步配置 SSL（可用宝塔面板一键 Let's Encrypt）。

---

### 3.3 浏览器访问报错

**🔴 问题 3.3.1：`x.x.x.x 关闭了连接`**

**现象**：浏览器访问时提示 `x.x.x.x 关闭了连接`。

**根因**：这是 2.3.1 的直接后果——Nginx 没有为该域名/端口配置任何 server 块（因为 /www/server/panel/vhost/nginx/ 下无站点 .conf 文件），无法处理该请求，TCP 连接被拒绝或立即关闭。

**状态**：⚠️ 待 Nginx 站点配置完成后解决。

---

## 阶段四：DNS 域名解析

### 4.1 阿里云控制台

用户询问："是在 `https://swasnext.console.aliyun.com/servers/cn-shanghai/b3fbbe7fed054f218fb9179df9a8a92a/dashboard` 的域名选项中添加域名解析吗？"

**回答**：这是两个不同层面的操作：

| 层面 | 操作 | 位置 |
|------|------|------|
| DNS 解析（必做） | 添加 A/AAAA 记录：域名 → `x.x.x.x` | 阿里云 DNS 控制台（域名服务），或宝塔面板的"域名"入口 |
| Nginx 站点配置（必做） | 创建 vhost：告诉 Nginx 这个域名对应 `/var/www/my-site` | 宝塔面板 → 网站 → 添加站点 |

两者缺一不可。

**状态**：⚠️ 待确认域名解析是否已配置，待创建 Nginx 站点。

---

## 阶段三：GitHub Actions 自动部署（双目标）

> ✅ 本阶段已完成。2026-07-08 通过临时测试文件 `test-deploy-trigger.txt` 验证通过。

### 3.1 工作流文件

**文件**：`.github/workflows/deploy.yml`

**触发条件**：`push` 到 `main` 分支

**流程**：

| 步骤 | 操作 | 工具/动作 |
|------|------|-----------|
| 1 | 拉取代码（含主题子模块） | `actions/checkout@v4` |
| 2 | 安装 Node.js 24 | `actions/setup-node@v4` |
| 3 | 安装依赖 | `npm ci` |
| 4 | 构建 Hexo | `npx hexo generate` |
| 5 | 部署到 GitHub Pages | `peaceiris/actions-gh-pages@v4` → `gh-pages` 分支 |
| 6 | SCP 到阿里云服务器 | `appleboy/scp-action@v0` → `/var/www/my-site/` |

- GitHub Pages 用 `${{ secrets.GITHUB_TOKEN }}`（GitHub 内置，无需手动配置）
- 服务器部署用 `${{ secrets.SSH_HOST }}`、`${{ secrets.SSH_USER }}`、`${{ secrets.SSH_KEY }}`（在仓库 Settings → Secrets → Actions 中手动配置）

### 3.2 GitHub Secrets 配置

| Secret | 值 | 用途 |
|--------|-----|------|
| `SSH_HOST` | `x.x.x.x` | 阿里云服务器 IP |
| `SSH_USER` | `admin` | 服务器用户名 |
| `SSH_KEY` | *(SSH 私钥)* | 用于 SCP 免密登录 |

### 3.3 Hexo 本地配置

`_config.yml` 中 `deploy` 部分已完全注释掉，避免本地 `hexo deploy` 与 Actions 冲突：

```yaml
# deploy:
#   type: git
#   repo: https://github.com/Blooming-cherry/blooming-cherry.github.io.git
#   branch: gh-pages
```

### 3.4 验证记录

| 日期 | 测试内容 | 结果 |
|------|----------|------|
| 2026-07-08 | 推送测试文件 `test-deploy-trigger.txt` → 触发 Deploy Hexo Blog #29 | ✅ 24s 完成 |
| 2026-07-08 | 清理测试文件，推送 → 触发 #30 | ✅ 正常 |

---

## ⏳ 待完成：宝塔面板 Nginx 站点配置

> GitHub Actions 已将 `public/` 文件 SCP 到 `/var/www/my-site/`，但 Nginx 还没有为博客域名创建虚拟主机配置——因此浏览器访问仍会报"连接被关闭"。

**需在宝塔面板操作**：
1. 网站 → 添加站点
2. 域名填 `adaydream.cn`（和 `www.adaydream.cn`）
3. 根目录选 `/var/www/my-site`
4. 完成后宝塔会自动生成 `/www/server/panel/vhost/nginx/adaydream.cn.conf`
5. 再点 SSL → 申请 Let's Encrypt 免费证书

---

## 问题汇总

| 编号 | 阶段 | 问题 | 严重程度 | 状态 |
|------|------|------|----------|------|
| 2.2.1 | 服务器 | Hexo `public/` 目录不存在 | 🔴 阻塞 | ✅ 已解决 — GitHub Actions SCP 直接上传到 `/var/www/my-site/`，不再需要服务器本地构建 |
| 2.3.1 | Nginx | 无站点 vhost 配置文件 | 🔴 阻塞 | ✅ 已解决 — 手动创建 `/www/server/panel/vhost/nginx/adaydream.cn.conf` |
| 2.4.1 | 服务器 | `/var/www/my-site` 无创建权限 | 🔴 阻塞 | ✅ 已解决 — 不再需要手动 mkdir，rsync 自动处理 |
| 2.4.2 | 服务器 | `sudo cp` 源路径解析为 `/root/` | 🟡 中等 | ✅ 已解决 — 不再使用服务器本地 cp |
| 3.1.1 | Git | SSH 公钥认证失败 | 🔴 阻塞 | ✅ 已解决 — debug 确认 SSH 连通；服务器 `dnf install rsync` 后部署成功 |
| 3.2.1 | HTTPS | HTTPS 无法访问 | 🟡 中等 | ✅ 已解决 — certbot + Let's Encrypt 证书 |
| 3.3.1 | 浏览器 | `x.x.x.x 关闭连接` | 🔴 阻塞 | ✅ 已解决 — Nginx 站点已配置 |
| 4.1 | DNS | 待确认域名解析 | 🟡 中等 | ✅ 已解决 — `@` 和 `www` A 记录均指向 `x.x.x.x` |
| 5.1 | ICP 备案 | 域名未完成 ICP 备案，阿里云边缘网络拦截 HTTP + HTTPS | 🔴 阻塞 | ⏳ 待提交阿里云首次备案申请 |
| — | GitHub Actions | 自动部署尚未配置 | ⏳ | ✅ 已完成 — push to main → Hexo build → GitHub Pages + SCP 到服务器双部署 |

---

## 当前进度

```
✅ 1. DNS 解析（adaydream.cn → x.x.x.x）                ← @ 和 www A 记录均指向 x.x.x.x
✅ 2. Hexo 配置（_config.yml deploy 已注释）                     ← 避免与 Actions 冲突
✅ 3. GitHub Actions 双目标部署                                   ← push → build → GitHub Pages + SCP 到服务器
✅ 4. GitHub Secrets（SSH_HOST/USER/KEY）                         ← SSH 连通，rsync 部署成功
✅ 5. Nginx 站点配置（手动创建 vhost conf）                         ← 宝塔面板无法访问，手动完成
✅ 6. SSL 证书（Let's Encrypt / certbot）                          ← 已申请，自动续签
⏳ 7. ICP 备案                                                    ← 阿里云拦截，备案后恢复
```

**当前状态**：技术部署全部完成，但因 ICP 备案缺失，域名 `adaydream.cn` 被阿里云边缘网络拦截。需通过阿里云提交首次 ICP 备案申请，审核通过后自动解封。

### SSL 证书

2026-07-09 通过 certbot 申请 Let's Encrypt：
```bash
sudo certbot --nginx --nginx-server-root /www/server/nginx/conf -d adaydream.cn -d www.adaydream.cn
```
证书自动续签由 certbot timer 管理，无需手动操作。证书文件路径：`/etc/letsencrypt/live/adaydream.cn/`。

---

> 📅 最终更新：2026-07-09

---

## 补充记录：Nginx 配置 + rsync 排错

### Nginx 站点（手动创建）

因宝塔面板不可用，直接写配置：
```bash
sudo mkdir -p /www/server/panel/vhost/nginx/
sudo tee /www/server/panel/vhost/nginx/adaydream.cn.conf << 'EOF'
server {
    listen 80;
    server_name adaydream.cn www.adaydream.cn;
    root /var/www/my-site;
    index index.html index.htm;
    location / { try_files $uri $uri/ =404; }
}
EOF
sudo nginx -t && sudo nginx -s reload
```

### rsync 部署排错（三次迭代）

| 尝试 | 方式 | 结果 |
|------|------|------|
| 1 | `appleboy/scp-action@v0` | ❌ `@v0` 版本不存在，8s 静默失败 |
| 2 | `burnett01/[email]` | ❌ 24s，文件未更新 |
| 3 | 原生 `rsync` 命令 | ❌ `bash: rsync: command not found` — 服务器没装 rsync |

**根因**：阿里云 Rocky Linux 镜像未预装 rsync。`sudo dnf install rsync -y` 解决。

最终 deploy.yml（第 36-41 行）使用原生 rsync：
```yaml
- name: Deploy to cloud server
  run: |
    mkdir -p ~/.ssh
    echo "${{ secrets.SSH_KEY }}" > ~/.ssh/deploy_key
    chmod 600 ~/.ssh/deploy_key
    rsync -avz --delete -e "ssh -o StrictHostKeyChecking=no -i ~/.ssh/deploy_key" \
      public/ ${{ secrets.SSH_USER }}@${{ secrets.SSH_HOST }}:/var/www/my-site/
```

> 2026-07-09 #35 验证通过，26s 完成，服务器 `/var/www/my-site/` 文件为 Hexo 构建产物。

---

## 阶段五：ICP 备案缺失导致网站无法访问 🔴

> **日期**：2026-07-09
> **问题**：用户反馈 adaydream.cn 在浏览器中无法连接（"连接已重置"）
> **状态**：⏳ 待 ICP 备案

### 5.1 问题现象

用户在浏览器中访问 `https://adaydream.cn`，浏览器报"连接已重置"（ERR_CONNECTION_RESET），网站完全无法打开。此前（7月8日）部署完成后，通过 `x.x.x.x`（IP 直连）验证过服务器 Nginx 正常，但从未通过域名实际测试。

### 5.2 排查过程（逐层穿透）

#### 第 1 步：验证服务器基础状态

首先确认服务器本身是否正常运行——排除"服务器挂了"的可能性：

```bash
curl -I http://x.x.x.x
# HTTP/1.1 200 OK, Server: nginx, Content-Length: 46173 ✅
```

服务器正常返回 200，内容是最新的 Hexo 构建产物。Nginx 服务正常、文件部署正常。

#### 第 2 步：测试域名访问

```bash
# HTTP 到域名
curl -I http://adaydream.cn
# HTTP/1.1 403 Forbidden, Server: Beaver ❌

# HTTPS 到域名
curl -I -k https://adaydream.cn
# curl: (35) SSL/TLS connection failed ❌  (TLS 握手被 RST)
```

**关键发现**：IP 直连正常，域名访问失败。HTTP 返回的 Server 头是 "Beaver" 而非 "nginx"——说明响应不是来自我们的 Nginx。

#### 第 3 步：排除本地代理干扰

检查本地环境，发现 **Clash Verge** 正在运行（系统代理 `127.0.0.1:7897`，进程 `clash-verge.exe` + `verge-mihomo.exe`）。

```bash
# 停止 Clash Verge 后重测
curl -I --noproxy '*' http://adaydream.cn
# 仍然 403 Forbidden, Server: Beaver ❌
```

停止 Clash 后问题依旧。"Beaver" 不是本地代理，而是来自网络上游。

#### 第 4 步：多 TLS 版本 + 多 SNI 交叉测试 🔍 关键突破

用一个 2×2 矩阵精确测试 TLS 行为：

```bash
# 维度一：TLS 1.3 vs 1.2，固定 SNI=adaydream.cn
openssl s_client -connect x.x.x.x:443 -servername adaydream.cn
# → TLSv1.3, Cipher: TLS_AES_256_GCM_SHA384 ✅ 成功！

openssl s_client -connect x.x.x.x:443 -servername adaydream.cn -tls1_2
# → Cipher: (NONE), read 0 bytes ❌ 失败！（读 0 字节，写了 212 字节后 RST）

# 维度二：不同 SNI 值，固定 TLS 1.2
openssl s_client -connect x.x.x.x:443 -servername test.example.com -tls1_2
# → TLSv1.2, Cipher: ECDHE-RSA-AES256-GCM-SHA384 ✅ 成功！

openssl s_client -connect x.x.x.x:443 -tls1_2  # 不发送 SNI
# → TLSv1.2, Cipher: ECDHE-RSA-AES256-GCM-SHA384 ✅ 成功！
```

| | TLS 1.3 | TLS 1.2 |
|---|---|---|
| **SNI=adaydream.cn** | ✅ 通过 | ❌ RST（0 bytes read） |
| **SNI=www.adaydream.cn** | ✅ 通过 | ❌ RST（0 bytes read） |
| **SNI=test.example.com** | ✅ 通过 | ✅ 通过 |
| **无 SNI (IP 直连)** | ✅ 通过 | ✅ 通过 |
| **aliyun.com（对照组）** | ✅ 通过 | ✅ 通过 |

**结论：只有 `*.adaydream.cn` 的 SNI + TLS 1.2 组合被阻断。这说明有设备在解析 TLS ClientHello 中的 SNI 字段，且只针对特定域名。**

#### 第 5 步：服务器端抓包验证

在服务器上运行 tcpdump，同时从外部发起失败请求：

```bash
sudo tcpdump -i any 'port 443 and host x.x.x.x' -c 30 -nn
# 结果：0 packets captured  ← ClientHello 根本没到服务器！
```

**TLS 1.2 ClientHello 在到达服务器之前就被网络中的某个设备拦截并丢弃了（RST 是那个设备伪造的，不是服务器发的）。**

排除法确认 RST 来源：
- ❌ 服务器防火墙：iptables 为空，FirewallD 未运行
- ❌ 服务器 Nginx：服务器本地测试 TLS 1.2 + SNI=adaydream.cn 完全正常
- ❌ Clash Verge：停止后问题依旧
- ✅ **阿里云边缘网络**：唯一剩下的变量

#### 第 6 步：发现真相 🎯

查看 HTTP 403 返回的完整 Body：

```html
<html>
<title>Non-compliance ICP Filing</title>
<script>
window.onload = function () {
  document.getElementById("mainFrame").src =
    "http://www.aliyun.com/beian/beian-block?id=00000000005508231438";
}
</script>
</html>
```

**根因确认：域名 `adaydream.cn` 未完成 ICP 备案。**

### 5.3 阿里云 ICP 备案拦截机制

```
用户浏览器 (adaydream.cn)
  → DNS 解析 → x.x.x.x
  → 流量经过阿里云边缘网络
  → 阿里云 DPI 检查域名 ICP 备案状态
  → adaydream.cn 无备案记录 → 触发拦截
      ├── HTTP (80端口)   → 返回 403 警告页 (Server: Beaver)
      ├── HTTPS TLS 1.2   → 解析 SNI → 发现未备案 → 发送 TCP RST
      └── HTTPS TLS 1.3   → DPI 对 TLS 1.3 SNI 解析不完整 → 偶尔通过
```

**为什么 TLS 1.3 能通过？** TLS 1.3 的 ClientHello 中 SNI 扩展格式与 TLS 1.2 有差异。阿里云 DPI 系统的 TLS 解析模块对 TLS 1.3 的覆盖不完整，导致部分连接未被拦截。这解释了为什么 openssl 默认（TLS 1.3）能连接而 curl/浏览器（可能先尝试 TLS 1.2）失败。

### 5.4 宝塔面板操作：添加站点

> 本段记录 2026-07-09 通过宝塔面板完成 Nginx 站点创建的步骤。

**宝塔面板 `http://x.x.x.x:8888` 无法访问**（此前 M1 已记录）。所有配置通过 SSH 命令行手动完成。

当前 Nginx 站点配置（已生效）：

```nginx
# /www/server/panel/vhost/nginx/adaydream.cn.conf

server {
    listen 80;
    server_name adaydream.cn www.adaydream.cn;
    return 301 https://$host$request_uri;
}

server {
    listen 443 ssl;
    server_name adaydream.cn www.adaydream.cn;
    root /var/www/my-site;
    index index.html index.htm;

    ssl_certificate     /etc/letsencrypt/live/adaydream.cn/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/adaydream.cn/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;

    location / {
        try_files $uri $uri/ =404;
    }
}
```

**宝塔面板"添加站点"的本质**：在 `/www/server/panel/vhost/nginx/` 下生成一个 `<域名>.conf` 文件。手动编写同样效果的 conf 文件等价于面板操作——区别只是面板收不到管理记录。

### 5.5 解决方案：ICP 备案

需要通过阿里云提交 ICP 备案申请。操作入口：[阿里云备案系统](https://beian.aliyun.com/)。

#### ICP 备案流程

| 步骤 | 内容 | 耗时 |
|------|------|------|
| 1. 登录备案系统 | 阿里云控制台 → 备案 → 开始备案 | — |
| 2. 填写主办者信息 | 个人备案：姓名、身份证号、手机号、邮箱 | — |
| 3. 填写网站信息 | 域名 `adaydream.cn`、服务器 IP `x.x.x.x`、网站名称（如"ADayDream 博客"）、服务内容选"博客/个人空间" | — |
| 4. 上传证件 | 身份证正反面照片 + 人脸核身 | — |
| 5. 阿里云初审 | 阿里云客服电话核实 | 1-2 工作日 |
| 6. 管局审核 | 工信部最终审批 | 约 2-4 周 |
| 7. 备案成功 | 获得 ICP 备案号，拦截自动解除 | — |

> ⚠️ 备案期间域名无法访问是正常状态。备案成功后阿里云会自动解除拦截。

#### 备案期间临时替代方案

| 方案 | 地址 | 备注 |
|------|------|------|
| GitHub Pages | `https://blooming-cherry.github.io` | 已有部署，可直接访问 |
| IP 直连 | `https://x.x.x.x` | SSL 证书域名不匹配会报警告，可添加浏览器例外 |
| DNS 临时切换 | 将 A 记录指向 GitHub Pages IP | 备案完成后切回阿里云 |

### 5.6 备案成功后操作清单

- [ ] 在网页底部添加 ICP 备案号（如 `浙ICP备XXXXXXXX号-1`）
- [ ] 备案号链接到 [工信部备案查询](https://beian.miit.gov.cn/)
- [ ] 在阿里云控制台提交公安联网备案（如当地要求）
- [ ] 验证 `https://adaydream.cn` 可正常访问（HTTP→HTTPS 跳转 + TLS 1.2/1.3 双栈）

---

> 📅 日志生成日期：2026-07-08
> 📅 最后更新：2026-07-09
>
> 📝 整理自回溯对话，按时间正序排列。

---

## 错误与反思

### 一、技术操作错误

| 编号 | 错误 | 表现 | 根因 | 教训 |
|------|------|------|------|------|
| **E1** | `appleboy/scp-action@v0` 不存在 | Actions 8 秒"成功"但文件未更新 | `@v0` 不是该 action 的有效版本标签，GitHub Actions 解析失败后直接跳过 | 使用第三方 action 前先查文档确认版本号，不要猜测 |
| **E2** | `burnett01/[email]` 静默失败 | 24 秒"成功"但文件未更新 | 该 action 内部参数格式与我们的配置不匹配，且没有输出有效错误信息 | 第三方 action 出问题时优先改用原生命令，更透明可调试 |
| **E3** | 服务器未安装 `rsync` | `bash: rsync: command not found`，rsync 协议数据错 | 阿里云 Rocky Linux 镜像未预装 rsync，而我们假设基础工具都存在 | 新服务器环境应先排查常见工具的安装状态：`which rsync scp git` |
| **E4** | Nginx 路径用错 | `/etc/nginx/`、`/etc/nginx/sites-available/`、`/etc/nginx/conf.d/` 全部不存在 | 宝塔面板的 Nginx 安装在 `/www/server/nginx/`，不走 Linux 标准路径 | 先看宝塔实际安装路径：`which nginx` → `nginx -t` 会输出实际配置路径 |
| **E5** | certbot 找不到 Nginx | `nginx -c /etc/nginx/nginx.conf` 报 No such file | certbot 默认假设 Nginx 配置在 `/etc/nginx/`，宝塔不在标准位置 | 宝塔环境下 certbot 需要 `--nginx-server-root /www/server/nginx/conf` |
| **E6** | DNS A 记录 IP 打错 | A 记录 IP 第三段把 `103` 错打成 `10`，且错了两次 | 手工输入 IP 时第三个段漏了 `3` | 关键配置（IP、域名）宁可复制粘贴，不要手打 |
| **E7** | `www` CNAME 指向 GitHub Pages | certbot 验证 `www.adaydream.cn` 时连到 GitHub IP `185.199.111.153` 返回 404 | 改了裸域 A 记录但忘记改 `www` 的 CNAME | 修改 DNS 时把 `@` 和 `www` 两条记录一起检查 |
| **E8** | `sudo` + `~` 路径解析错误 | `sudo cp -r ~/my-site/public/* /var/www/` → 报 `/root/my-site/` 不存在 | `sudo` 下 `~` 展开为 `/root/` 而非 `/home/admin/` | `sudo` 命令中始终使用绝对路径，不要依赖 `~` |
| **E9** | bash 感叹号历史展开 | `echo "<h1>Welcome!</h1>"` 报 `event not found` | `!` 在双引号内触发 bash history expansion | 使用单引号 `'...'` 包裹含感叹号的字符串 |
| **E10** | SSH 公钥不匹配 | 本地 `github-actions-deploy.pub` 与服务器 `authorized_keys` 中的同名密钥指纹不同 | 创建了两把不同的密钥对但用了相同的注释名 | 密钥对比应对比指纹而非注释名；`ssh-keygen -lf` 查看指纹 |
| **E11** | `tee` 到不存在的目录 | `tee: /etc/nginx/sites-available/...: No such file or directory` | 父目录不存在，tee 不会自动创建 | 写文件前先 `mkdir -p` 确保父目录存在 |
| **E12** | 以为部署完成 = 网站可访问 | 浏览器访问 adaydream.cn 报"连接已重置"，但服务器 IP 直连正常，GitHub Actions 绿色 | 域名 DNS 指向阿里云服务器，而服务器在中国大陆，域名没有完成 ICP 备案 | 中国大陆服务器 + 域名 = 必须先 ICP 备案。部署到服务器 ≠ 网站上线，必须通过域名实际验证 |
| **E13** | 将 TLS 1.2 握手失败归因为服务器配置问题 | 排查方向一度指向 Nginx SSL 配置、证书权限、OpenSSL 版本兼容等 | 服务器本地 TLS 1.2 完全正常，RST 来自阿里云边缘网络的 ICP 拦截 | 当"IP 直连正常但域名失败"时，优先考虑网络路径中是否有中间设备（WAF/防火墙/合规系统）在干预 |
| **E14** | 被"Beaver" Server 头误导 | 看到 `Server: Beaver` 以为服务器上有其他 Web 服务或代理 | "Beaver" 是阿里云 ICP 拦截系统的标识，不在我们的服务器上 | HTTP 响应中的 `Server` 头不一定来自目标服务器——中间设备可以替换/注入响应内容 |
| **E15** | 未在部署完成后第一时间用域名验证 | 7月8日 IP 直连测试通过后就认为部署完成了 | 域名 DNS 已生效多日，但一致未通过 `curl -H 'Host:adaydream.cn'` 或直接 curl 域名来验证 | 部署完成的定义必须是**通过最终访问方式（域名 + HTTPS）验证成功**，仅 IP 测试不够 |

### 二、概念性理解不足

| 编号 | 误区 | 实际 |
|------|------|------|
| **M1** | 以为宝塔面板 Web 界面可以随时访问 | 宝塔面板 `http://x.x.x.x:8888` 无法打开，原因未排查（防火墙/服务状态），最终所有配置通过 SSH 命令行手动完成 |
| **M2** | 以为 GitHub Actions 绿色 ✅ = 部署成功 | Actions 的绿色只表示 job exit code 为 0。我们连续三次误判：SCP action 版本不存在→静默失败→绿色；rsync action 参数不对→静默失败→绿色；原生 rsync 因服务器没装→连接断开→但之前加了 `\|\| echo FAILED` 兜底→绿色。**绿色不代表真实生效，必须以目标服务器上的文件内容为准** |
| **M3** | 以为 `public/` 目录丢了/Hexo 生成有问题 | 服务器上的文件自始至终都是 git clone 的源码而非构建产物。`public/` 不存在是因为根本就没有部署成功过，不是 Hexo 的问题。排查方向一开始就错了 |
| **M4** | 以为部署到服务器 = `git clone` + 服务器本地构建 | 正确方案是 GitHub Actions 统一构建，再 rsync `public/` 到服务器。服务器不需要装 Node.js、不需要跑 `hexo generate`，只需 Nginx 指向部署目录即可 |
| **M5** | 宝塔面板的"添加站点"和手动写 Nginx conf 是两回事 | 本质上都是生成 Nginx server 块配置文件。宝塔只是一个 GUI 包装，手动 `tee` 到 vhost 目录效果完全一致，区别只是宝塔收不到管理 |
| **M6** | DNS 和 Nginx 是同一件事 | 两件事完全不同：DNS 决定域名解析到哪台机器，Nginx 决定那台机器收到请求后返回什么内容。日志中反复混淆，导致排查方向混乱 |
| **M7** | 以为网站部署是纯技术问题 | 技术配置（DNS + Nginx + SSL + GitHub Actions）全部正确，但网站因法律合规要求（ICP 备案）被强制阻断 | 在中国大陆运营网站不只是技术部署，还需要完成行政备案流程。域名备案不是"可选项"而是"必选项" |
| **M8** | 以为 TLS 版本差异必然说明服务器配置问题 | TLS 1.3 成功但 TLS 1.2 失败，第一反应是 Nginx SSL 配置有 Bug | 中间网络设备（DPI）对不同 TLS 版本的解析能力不同——TLS 1.2 ClientHello 格式简单且 SNI 明确可读，是 DPI 的首要目标；TLS 1.3 的 DPI 覆盖可能不完整 |

### 三、排查方法论总结

1. **验证永远在远端，不要相信本地的"看起来成功了"** —— 每次改完后，在服务器上 `ls -la /var/www/my-site/` 和 `cat index.html` 确认文件真正更新了
2. **排错优先加日志，不要猜** —— 加了 `ssh -v` debug 步骤后，5 秒就发现了 `rsync: command not found` 根因。之前无日志的三轮尝试浪费了大量时间
3. **复杂工具出问题 → 降级为原生命令** —— SCP action → rsync action → 原生 rsync，每一步降级都让问题更透明
4. **密钥对比要看指纹** —— `ssh-keygen -lf file.pub` 比肉眼对比 base64 字符串可靠一万倍
5. **DNS 生效需要等，但可以用 `nslookup` 立刻验证当前状态** —— 不要猜 DNS 有没有生效，直接查
6. **"IP 直连 OK，域名不行"的第一反应应该是"有什么在按域名过滤？"** —— 不是"服务器哪配错了"。这种模式下，服务器配置大概率没问题，问题在中间设备（WAF/防火墙/合规系统/GFW）
7. **用 2×2 矩阵交叉测试可以快速锁定根因** —— 今天的 TLS 版本 × SNI 值 交叉测试，5 分钟就确定了"只有 `*.adaydream.cn` + TLS 1.2" 被阻断，直接排除了配置错误、网络故障等几十种可能性
8. **tcpdump 是判断"RST 谁发的"的唯一可靠方式** —— 客户端看到 RST 时，只有在目标服务器上同时抓包（0 包到达 = RST 是中间设备伪造的），才能区分"服务器拒绝了连接"还是"中间设备在拦截"
9. **HTTP 403 Body 是诊断的宝藏** —— 看到 `Server: Beaver` 时应该立刻查看 HTTP Body，而不只是看 HTTP 状态码。Body 中的 "Non-compliance ICP Filing" 直接揭示了根因
10. **部署完成的验证必须用最终访问方式** —— 部署到阿里云 ≠ 网站上线。验证标准是 `curl https://你的域名` 返回 200，而不是 `curl http://服务器IP` 返回 200
