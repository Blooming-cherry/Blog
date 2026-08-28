// music-redirect — 按需取 Monster Siren 音频直链并 302 跳转
//
// 背景：Monster Siren 的 sourceUrl 是 HyCDN 带签名的临时链接，3 小时后过期。
// 前端若直接热链这些直链，几小时就 403。本服务在每次播放时现调 API 取新鲜直链
// 并 302 跳转，前端永远拿不到过期链接，彻底摆脱「定时刷新」。
//
// 部署：由 Nginx 反代暴露为 /audio/<cid>（adaydream.cn 与 blog.adaydream.cn
// 两个 vhost 都要配），本进程只绑定 127.0.0.1，不直接对公网。
//
// 运行：node server.mjs   （无第三方依赖，Node >= 18 自带 fetch）

import http from 'node:http';

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || '127.0.0.1';
const API_BASE = 'https://monster-siren.hypergryph.com/api/song/';
const UA = 'adaydream-music-proxy/1.0';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h 缓存 —— 直链有效期 3h，留足余量

const cache = new Map(); // cid -> { url, at }

async function resolve(cid) {
  const hit = cache.get(cid);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.url;

  const resp = await fetch(API_BASE + cid, { headers: { 'User-Agent': UA } });
  if (!resp.ok) throw new Error('upstream HTTP ' + resp.status);
  const json = await resp.json();
  const url = json && json.data && json.data.sourceUrl;
  if (!url) throw new Error('upstream: ' + ((json && json.msg) || 'no sourceUrl'));
  cache.set(cid, { url, at: Date.now() });
  return url;
}

const server = http.createServer(async (req, res) => {
  // 只接受 /audio/<数字 cid>，其余一律 404
  const m = /^\/audio\/(\d+)\/?$/.exec(req.url);
  if (!m) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('not found');
    return;
  }
  try {
    const url = await resolve(m[1]);
    res.writeHead(302, { 'Location': url, 'Cache-Control': 'no-store' });
    res.end();
  } catch (e) {
    console.error('[music-redirect]', m[1], e.message);
    res.writeHead(502, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('upstream error: ' + e.message);
  }
});

server.listen(PORT, HOST, () => {
  console.log(`[music-redirect] listening on http://${HOST}:${PORT}`);
});
