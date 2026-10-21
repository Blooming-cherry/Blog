<!-- Arknights credit -->
<script>
(function(){
  function injectCredit() {
    var footer = document.querySelector('.footer');
    if (!footer) return;
    // Remove any stale duplicates first
    var stale = footer.querySelectorAll('.arknights-credit');
    stale.forEach(function(el) { el.remove(); });
    var credit = document.createElement('div');
    credit.className = 'arknights-credit';
    credit.style.cssText = 'margin-top:6px;font-size:12px;color:#999;text-align:center;';
    credit.innerHTML = 'Inspired by <a href="https://ak.hypergryph.com/" target="_blank" style="color:#999;">Arknights / 明日方舟</a> &copy; Hypergryph / Studio Montagne';
    footer.appendChild(credit);
  }
  injectCredit();
  // Re-inject after PJAX page swaps (footer may have been replaced)
  if (!window.__blogCreditPjaxBound) {
    window.__blogCreditPjaxBound = true;
    document.addEventListener('pjax:success', injectCredit);
  }
})();
</script>

<!-- Monster Siren URL Loader -->
<script src="/js/siren-url-loader.js"></script>

<!-- Global Mini Vinyl Player -->
<link rel="stylesheet" href="/js/music/music.css?v=20261018-bloom">
<div id="mpOverlay" hidden></div>
<section id="mpPlaylist" aria-label="音乐控制与播放列表" hidden>
  <div class="music-panel-heading"><span>塞壬唱片</span><button type="button" id="mpClose" aria-label="收起音乐控制">×</button></div>
  <p id="mpStatus" class="music-status" role="status" aria-live="polite"></p>
  <button type="button" id="mpRetry" hidden>重试播放</button>
  <button type="button" id="mpCoverRetry" hidden>重试封面</button>
  <div class="music-progress-wrap"><span id="mpTimeCur">00:00</span><input id="mpProgress" type="range" min="0" max="0" step="1" value="0" aria-label="播放进度" disabled><span id="mpTimeDur">00:00</span></div>
  <div class="music-volume">音量 <input id="mpVolume" type="range" min="0" max="100" step="1" value="30" aria-label="音乐音量"></div>
  <div class="mp-wheel"><span class="mp-wheel-focus" aria-hidden="true"></span><div id="mpTracks" tabindex="0" role="listbox" aria-label="曲目滚轮"></div></div>
</section>
<div id="miniPlayer" aria-label="迷你音乐播放器">
  <button id="mpExpand" type="button" aria-label="展开音乐控制" aria-expanded="false" aria-controls="mpPlaylist"><span id="mpDisc"><img id="mpCover" width="30" height="30" src="/js/music/placeholder.svg" alt="默认唱片封面"></span></button>
  <span id="mpTitle">—</span>
  <button id="mpBtn" type="button" aria-label="播放"><span data-play><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg></span><span data-pause hidden><svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg></span></button>
</div>
<script>
window.__vinylPlaylist = [
    {cid:"125042",name:"Sanctuary Inside",artist:"塞壬唱片-MSR",url:"/audio/125042",cover:"https://web.hycdn.cn/siren/pic/20250430/384e007ed1908ce919a3bf704a5b36ff.png",album:"Sanctuary Inside"},
    {cid:"306814",name:"Best Moments of...",artist:"塞壬唱片-MSR",url:"/audio/306814",cover:"https://web.hycdn.cn/siren/pic/20231019/ae52bd635f6a7e89be3c3d481788ce82.png",album:"Best Moments of..."},
    {cid:"953953",name:"Little Wish",artist:"塞壬唱片-MSR",url:"/audio/953953",cover:"https://web.hycdn.cn/siren/pic/20250801/7d4b586dddf00b4e2a43c809f3fe4b45.jpg",album:"Little Wish"},
    {cid:"306846",name:"Your Star",artist:"塞壬唱片-MSR",url:"/audio/306846",cover:"https://web.hycdn.cn/siren/pic/20220608/7ceda0fb37acc8cdfc7f25e8352dbbc8.jpg",album:"Your Star"},
    {cid:"697699",name:"Grow on My Time",artist:"塞壬唱片-MSR",url:"/audio/697699",cover:"https://web.hycdn.cn/siren/pic/20250606/02da85b2cc73f426ef6cfec4910d31d9.jpg",album:"Grow on My Time"},
    {cid:"953984",name:"Before Summer",artist:"塞壬唱片-MSR",url:"/audio/953984",cover:"https://web.hycdn.cn/siren/pic/20230601/d052f9558a4ef28409556ba761cdd861.jpg",album:"Before Summer"},
    {cid:"232224",name:"Innocence",artist:"塞壬唱片-MSR",url:"/audio/232224",cover:"https://web.hycdn.cn/siren/pic/20260430/87e3010a27c3f0f85422fa6f1f33483e.jpg",album:"Innocence"},
    {cid:"306815",name:"Effervescence",artist:"塞壬唱片-MSR",url:"/audio/306815",cover:"https://web.hycdn.cn/siren/pic/20230809/ecc4c113772a8e8a8cdde6aa303a3ad6.jpg",album:"火山旅梦OST"}
  ];
// Set window.__vinylCoverPaths = { '125042': '/assets/music/125042.webp' } after obtaining local cover assets.
// External cover URLs remain in the playlist for reference; no external cover fetch is required.
</script>
<script src="/js/music/player.js"></script>
<script src="/js/music/covers-inline.js?v=20261017-ui2"></script>
<script src="/js/music/cover-loader.js?v=20261017-ui2"></script>
<script src="/js/music/ui.js?v=20261018-bloom"></script>
<script defer src="/js/controls-motion.js?v=20261018-hop2"></script>
<!-- 蓝女仆看板娘：Canvas2D 分层、独立生命周期 -->
<link rel="stylesheet" href="/js/companion/companion.css?v=20261018-bloom">
<script defer src="/js/companion/preferences.js"></script>
<script defer src="/js/companion/voice.js"></script>
<script defer src="/js/companion/head-projection.js?v=20261017-ui2"></script>
<script defer src="/js/companion/rig-renderer.js?v=20261020-neck5"></script>
<script defer src="/js/companion/renderer.js?v=20261017-ui2"></script>
<script defer src="/js/companion/controller.js?v=20261017-ui2"></script>
<script defer src="/js/companion/bootstrap.js"></script>
<!-- 鼠标拖尾粒子 -->
<canvas id="mouseTrail" aria-hidden="true" style="position:fixed;top:0;left:0;pointer-events:none;z-index:998"></canvas>
<script>
(function(global, document) {
  'use strict';
  if (global.__blogMouseTrail) { global.__blogMouseTrail.mount(); return; }

  var canvas, context, particles = [], frame = 0;
  var desktop = global.matchMedia('(min-width: 769px) and (hover: hover) and (pointer: fine)');
  var reduced = global.matchMedia('(prefers-reduced-motion: reduce)');

  function supported() { return desktop.matches && !reduced.matches; }
  function active() { return supported() && !document.hidden && Boolean(canvas); }
  function clear() {
    if (frame) cancelAnimationFrame(frame);
    frame = 0; particles = [];
    if (context && canvas) context.clearRect(0, 0, canvas.width, canvas.height);
  }
  function resize() {
    if (!canvas) return;
    canvas.width = global.innerWidth;
    canvas.height = global.innerHeight;
  }
  function draw() {
    frame = 0;
    if (!active()) { clear(); return; }
    context.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = particles.length - 1; i >= 0; i--) {
      var particle = particles[i];
      particle.x += particle.vx; particle.y += particle.vy; particle.life -= particle.decay;
      if (particle.life <= 0) { particles.splice(i, 1); continue; }
      context.beginPath(); context.arc(particle.x, particle.y, particle.radius * particle.life, 0, Math.PI * 2);
      context.fillStyle = 'hsla(' + particle.hue + ', 75%, 65%, ' + (particle.life * 0.45) + ')'; context.fill();
    }
    if (particles.length) frame = requestAnimationFrame(draw);
  }
  function schedule() { if (active() && particles.length && !frame) frame = requestAnimationFrame(draw); }
  function move(event) {
    if (!active()) return;
    particles.push({ x:event.clientX, y:event.clientY, radius:2.2, vx:0, vy:0, life:1, decay:0.035, hue:202 });
    if (particles.length > 20) particles.shift();
    schedule();
  }
  function mount() {
    var next = document.getElementById('mouseTrail');
    if (next !== canvas) { canvas = next; context = canvas && canvas.getContext('2d'); resize(); }
    if (!active()) clear();
  }
  document.addEventListener('mousemove', move, { passive:true });
  document.addEventListener('visibilitychange', function() { if (document.hidden) clear(); else mount(); });
  global.addEventListener('resize', resize);
  global.addEventListener('pjax:success', mount);
  desktop.addEventListener('change', mount);
  reduced.addEventListener('change', function() { if (!supported()) clear(); else mount(); });
  global.__blogMouseTrail = { mount:mount, supported:supported };
  mount();
})(window, document);
</script>
