import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve, join, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
const siteRoot = process.env.COMPANION_SITE_ROOT;
const root = siteRoot ? resolve(siteRoot) : fileURLToPath(new URL('../source/', import.meta.url));
const requests = [], errors = [];
const html = siteRoot ? await readFile(join(root, 'index.html'), 'utf8') : `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/js/companion/companion.css"></head><body><main><h1>文章测试</h1><p>正文先可读</p><input id="search" aria-label="搜索"></main><script src="/js/companion/preferences.js"></script><script src="/js/companion/voice.js"></script><script src="/js/companion/renderer.js"></script><script src="/js/companion/controller.js"></script><script>window.BlogCompanion&&BlogCompanion.bootstrap();</script></body></html>`;
const types = { '.js': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const server = createServer(async (req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://test').pathname); requests.push(pathname);
  if (pathname === '/') { res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); res.end(html); return; }
  const target = resolve(root, '.' + pathname + (pathname.endsWith('/') ? 'index.html' : ''));
  if (!target.startsWith(resolve(root) + sep)) { res.writeHead(403); res.end(); return; }
  try { const data = await readFile(target); res.writeHead(200, { 'Content-Type': (types[extname(target)] || 'application/octet-stream') + '; charset=utf-8' }); res.end(data); }
  catch { res.writeHead(404); res.end('missing'); }
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const base = `http://127.0.0.1:${server.address().port}`;
const delay = ms => new Promise(done => setTimeout(done, ms));
const edge = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(existsSync);
assert.ok(edge);
const profile = await mkdtemp(join(tmpdir(), 'blog-companion-check-'));
const child = spawn(edge, ['--headless=new', '--no-first-run', '--disable-background-networking', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { windowsHide: true, stdio: 'ignore' });
let socket;
try {
  let port;
  for (let i = 0; i < 150; i++) { try { port = Number((await readFile(join(profile, 'DevToolsActivePort'), 'utf8')).split('\n')[0]); if (port) break; } catch {} await delay(100); }
  assert.ok(port, 'Edge CDP starts');
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  socket = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((done, fail) => { socket.addEventListener('open', done, { once: true }); socket.addEventListener('error', fail, { once: true }); });
  let id = 0; const pending = new Map();
  socket.addEventListener('message', event => {
    const result = JSON.parse(String(event.data));
    if (result.id && pending.has(result.id)) { const p = pending.get(result.id); pending.delete(result.id); clearTimeout(p.timer); result.error ? p.fail(new Error(result.error.message)) : p.done(result.result); }
    if (result.method === 'Runtime.exceptionThrown') errors.push(result.params.exceptionDetails.exception?.description || result.params.exceptionDetails.text);
  });
  const call = (method, params = {}) => new Promise((done, fail) => { const requestId = ++id; const timer = setTimeout(() => fail(new Error(method + ' timeout')), 20000); pending.set(requestId, { done, fail, timer }); socket.send(JSON.stringify({ id: requestId, method, params })); });
  const evaluate = async expression => { const r = await call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text); return r.result.value; };
  const wait = async (expression, ms = 15000) => { const until = Date.now() + ms; do { if (await evaluate(expression)) return; await delay(100); } while (Date.now() < until); throw new Error('Timeout: ' + expression); };
  await call('Runtime.enable'); await call('Page.enable'); await call('Page.bringToFront');
  await call('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await call('Emulation.setTouchEmulationEnabled', { enabled: true });
  await call('Page.navigate', { url: base }); await wait("Boolean(window.__blogCompanion)", 30000);
  assert.equal(await evaluate("document.querySelectorAll('#blog-companion').length"), 1, 'One controller mounts');
  assert.equal(requests.some(p => p.includes('/vendor/') || p.endsWith('.moc3') || p.endsWith('manifest.json')), false, 'Mobile first view makes no dynamic resource requests');
  await evaluate("document.querySelector('[data-companion-avatar]').click()");
  await wait("window.__blogCompanion.state==='ready'||window.__blogCompanion.state==='error'");
  const modelState = await evaluate("({state:__blogCompanion.state,error:__blogCompanion.lastError&&__blogCompanion.lastError.message})");
  assert.equal(modelState.state, 'ready', JSON.stringify(modelState));
  assert.equal(await evaluate("document.querySelectorAll('#blog-companion canvas').length"), 1);
  await evaluate("for(let i=0;i<5;i++){document.dispatchEvent(new Event('pjax:send'));document.dispatchEvent(new Event('pjax:success'));BlogCompanion.bootstrap();}void 0");
  assert.equal(await evaluate("document.querySelectorAll('#blog-companion').length"), 1, 'PJAX and bootstrap stay single-instance');
  await evaluate("document.querySelector('[data-companion-more]').click()");
  assert.equal(await evaluate("document.activeElement.closest('[data-companion-menu]')!==null"), true, 'Menu gets keyboard focus');
  assert.equal(await evaluate("document.querySelector('[data-companion-voice-controls]').hidden"), true, 'Unavailable voice controls stay hidden');
  assert.match(await evaluate("document.querySelector('[data-companion-voice-notice]').textContent"), /语音尚未提供/, 'Menu explains that no companion voice is available');
  await evaluate("document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))");
  assert.equal(await evaluate("document.activeElement.hasAttribute('data-companion-more')"), true, 'Escape restores trigger focus');
  await evaluate("if(!document.querySelector('#search')){const input=document.createElement('input');input.id='search';document.body.append(input);}document.querySelector('[data-companion-more]').click();document.querySelector('#search').focus()");
  assert.equal(await evaluate("document.querySelector('[data-companion-menu]').hidden"), true, 'Search focus closes menu');
  await evaluate("__blogCompanion.collapse()");
  assert.equal(await evaluate("__blogCompanion.renderer.app.ticker.started"), false, 'Collapsed rendering pauses');
  await evaluate("__blogCompanion.expand()");
  await wait("__blogCompanion.state==='ready'");
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await wait("__blogCompanion.renderer.app.ticker.started===false");
  assert.equal(await evaluate("__blogCompanion.renderer.app.ticker.started"), false, 'Reduced motion stops continuous ticker');
  await evaluate("__blogCompanion.destroy();BlogCompanion.bootstrap();void 0");
  assert.equal(await evaluate("document.querySelectorAll('#blog-companion').length"), 1, 'Destroy and remount cleanly');
  await evaluate("localStorage.removeItem('blog-companion-v1')");
  await call('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await call('Emulation.setTouchEmulationEnabled', { enabled: false });
  await call('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  await call('Page.addScriptToEvaluateOnNewDocument', { source: 'window.__nativeFetch=window.fetch;window.__nativeAudio=window.Audio;' });
  await call('Page.navigate', { url: base });
  await wait("window.__blogCompanion?.state==='ready'", 30000);
  assert.equal(await evaluate("document.querySelectorAll('#blog-companion canvas').length"), 1, 'Desktop automatically loads one real model');
  assert.equal(await evaluate("window.fetch===window.__nativeFetch&&window.Audio===window.__nativeAudio"), true, 'Page preserves native fetch and Audio');
  assert.equal(await evaluate("document.querySelectorAll('#waifu,#live2d').length"), 0, 'Old widget is absent');
  if (siteRoot) {
    assert.equal(await evaluate("Boolean(window.__vinyl?.audio)&&window.__vinyl.audio.paused&&!window.__vinyl.audio.getAttribute('src')"), true, 'Existing music stays paused without eager audio loading');
    await wait("typeof window.Pjax==='function'", 30000);
    const targetPath = await evaluate("Array.from(document.querySelectorAll('a.post-title-link[href]')).map(a=>new URL(a.href,location.href)).find(u=>u.origin===location.origin&&u.pathname!=='/'&&u.pathname.endsWith('/')&&!u.pathname.startsWith('/music'))?.pathname");
    assert.ok(targetPath, 'Actual blog navigation target exists');
    await evaluate("window.__companionBefore=window.__blogCompanion;window.__musicBefore=window.__vinyl;window.__pjaxDone=0;document.addEventListener('pjax:success',()=>window.__pjaxDone++);new Pjax({elements:'a',selectors:['title','#pjax']}).loadUrl(" + JSON.stringify(base + targetPath) + ");void 0");
    try { await wait("window.__pjaxDone>0", 15000); } catch(error) { console.log(JSON.stringify({requests:requests.slice(-15),errors,state:await evaluate("({url:location.href,done:window.__pjaxDone,body:document.body.innerText.slice(0,80)})")})); throw error; }
    assert.equal(await evaluate("window.__blogCompanion===window.__companionBefore&&window.__vinyl===window.__musicBefore&&document.querySelectorAll('#blog-companion canvas').length===1"), true, 'Actual PJAX preserves model and music singletons');
  }
  if (siteRoot) {
    await evaluate("new Pjax({elements:'a',selectors:['title','#pjax']}).loadUrl(" + JSON.stringify(base + '/') + ");void 0");
    await wait("window.__pjaxDone>1", 15000);
    assert.equal(await evaluate("window.__blogCompanion===window.__companionBefore&&window.__vinyl===window.__musicBefore&&document.querySelectorAll('#blog-companion canvas').length===1&&document.querySelectorAll('#waifu,#live2d').length===0"), true, 'Actual article round trip preserves singleton');
  }
  assert.deepEqual(errors, [], 'No uncaught runtime errors');
  console.log('PASS real Edge: mobile delayed fetch; same-origin real Cubism model ready; one canvas; 5 PJAX cycles; keyboard Escape/focus; search; collapse; reduced motion; destroy/remount.');
  console.log(JSON.stringify({ requests: requests.length, model: modelState, exceptions: errors.length, desktopAutoLoad: true, nativeApisPreserved: true, builtSite: Boolean(siteRoot), actualPjaxRoundTrip: Boolean(siteRoot) }));
} finally {
  if (socket) socket.close();
  child.kill(); await delay(400);
  server.closeAllConnections(); await new Promise(done => server.close(done));
  const target = resolve(profile);
  assert.ok(target.startsWith(resolve(tmpdir()) + sep) && target.includes('blog-companion-check-'));
  await rm(target, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
}
