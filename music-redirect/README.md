# music-redirect

按需取 Monster Siren 音频直链并 302 跳转的 Node 服务。用于根治 HyCDN 签名直链
「3 小时过期」的问题：前端不再热链会过期的 `sourceUrl`，改走本站 `/audio/<cid>`，
由本服务现取新鲜直链跳转。

## 为什么需要它

Monster Siren 的 `/api/song/<cid>` 返回的 `sourceUrl` 是带签名的临时链接，有效期
**固定 3 小时**。之前靠 GitHub Actions 定时刷新 `music.json`，但 GitHub 的 schedule
触发经常 8~10 小时才跑一次，导致 `music.json` 大部分时间装着过期链接 → 音频 403。
本服务把「取链接」从「定时批量」改成「播放时按需」，根因消除。

## 部署到 ECS（宝塔）

### 1. 上传并启动（二选一）

**方式 A：宝塔「Node 项目 / PM2 管理器」**

1. 把 `server.mjs` 上传到 `/var/www/music-redirect/`（宝塔文件管理器或 SFTP）。
2. 软件商店安装「Node.js 版本管理器」+「PM2 管理器」（若未装）。
3. PM2 管理器 → 添加项目：启动文件 `server.mjs`，运行命令 `node server.mjs`，
   端口 `3000`，启动。

**方式 B：SSH + pm2**

```bash
mkdir -p /var/www/music-redirect
# 上传 server.mjs 到该目录
cd /var/www/music-redirect
npm i -g pm2
pm2 start server.mjs --name music-redirect
pm2 save
pm2 startup   # 设置开机自启，按提示执行输出的命令
```

### 2. Nginx 反代（两个 vhost 都要加）

在 **adaydream.cn** 和 **blog.adaydream.cn** 两个站点的 Nginx 配置的 `server {}` 块内，
各加一段：

```nginx
location /audio/ {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

宝塔：网站 → 站点 → 配置文件，把上面这段贴进 `server {}`，保存后重载 Nginx。

### 3. 验证

```bash
curl -I "https://adaydream.cn/audio/880337"     # 期望 302 + Location: https://res01.hycdn.cn/...
curl -I "https://blog.adaydream.cn/audio/125042" # 期望 302
```

拿到 302 且 `Location` 指向 `res01.hycdn.cn` 即为成功。

## 前端调用约定

- 导航页背景乐：`terminal/index.html` → `m.src = '/audio/880337'`
- 博客黑胶播放器：`body-end.swig` 的 `PL` 数组 → `url: '/audio/<cid>'`
- （已废弃）`siren-url-loader.js` 若仍存在，其 `map[cid]` 也已改为 `/audio/<cid>`

## 遗留清理（可选）

- `.github/workflows/refresh-music.yml` 与 `adaydream-proxy/fetch-music.mjs` 现已无前端
  消费方（`music.json` 不再被读取）。可保留作兜底，也可停用定时任务省 Actions 分钟。
- `adaydream-proxy/api/music-proxy.js` 是当年 Vercel 的旧版，已不部署，可删。
