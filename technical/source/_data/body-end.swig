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
<div id="mpOverlay" style="display:none"></div>
<div id="mpPlaylist" style="display:none"></div>
<div id="miniPlayer">
  <button class="mp-ctrl" id="mpPrev" title="上一首"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
  <div id="mpDisc" title="展开播放列表"><div id="mpCover"></div></div>
  <span id="mpTitle">—</span>
  <button id="mpBtn" title="播放/暂停">
    <span class="mp-icon-play">▶</span>
    <span class="mp-icon-pause" style="display:none">⏸</span>
  </button>
  <button class="mp-ctrl" id="mpNext" title="下一首"><svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M6 18l8.5-6L6 6v12zM16 6v12h2V6h-2z"/></svg></button>
</div>

<script>
(function(){
  var PL = [
    {cid:"125042",name:"Sanctuary Inside",artist:"塞壬唱片-MSR",url:"/audio/125042",cover:"https://web.hycdn.cn/siren/pic/20250430/384e007ed1908ce919a3bf704a5b36ff.png",album:"Sanctuary Inside"},
    {cid:"306814",name:"Best Moments of...",artist:"塞壬唱片-MSR",url:"/audio/306814",cover:"https://web.hycdn.cn/siren/pic/20231019/ae52bd635f6a7e89be3c3d481788ce82.png",album:"Best Moments of..."},
    {cid:"953953",name:"Little Wish",artist:"塞壬唱片-MSR",url:"/audio/953953",cover:"https://web.hycdn.cn/siren/pic/20250801/7d4b586dddf00b4e2a43c809f3fe4b45.jpg",album:"Little Wish"},
    {cid:"306846",name:"Your Star",artist:"塞壬唱片-MSR",url:"/audio/306846",cover:"https://web.hycdn.cn/siren/pic/20220608/7ceda0fb37acc8cdfc7f25e8352dbbc8.jpg",album:"Your Star"},
    {cid:"697699",name:"Grow on My Time",artist:"塞壬唱片-MSR",url:"/audio/697699",cover:"https://web.hycdn.cn/siren/pic/20250606/02da85b2cc73f426ef6cfec4910d31d9.jpg",album:"Grow on My Time"},
    {cid:"953984",name:"Before Summer",artist:"塞壬唱片-MSR",url:"/audio/953984",cover:"https://web.hycdn.cn/siren/pic/20230601/d052f9558a4ef28409556ba761cdd861.jpg",album:"Before Summer"},
    {cid:"232224",name:"Innocence",artist:"塞壬唱片-MSR",url:"/audio/232224",cover:"https://web.hycdn.cn/siren/pic/20260430/87e3010a27c3f0f85422fa6f1f33483e.jpg",album:"Innocence"},
    {cid:"306815",name:"Effervescence",artist:"塞壬唱片-MSR",url:"/audio/306815",cover:"https://web.hycdn.cn/siren/pic/20230809/ecc4c113772a8e8a8cdde6aa303a3ad6.jpg",album:"火山旅梦OST"}
  ];

  // Resolve fresh URL from proxy cache, fallback to hardcoded
  function resolveUrl(track) {
    if (window.__sirenUrls && window.__sirenUrls[track.cid]) {
      return window.__sirenUrls[track.cid];
    }
    return track.url;
  }

  // PJAX guard: body-end.swig re-executes inside #pjax on every navigation.
  // Rebind new DOM to the existing Audio instead of creating a duplicate.
  if (window.__vinyl) {
    var V = window.__vinyl;
    var mp2 = document.getElementById('miniPlayer');
    var mpDisc2 = document.getElementById('mpDisc');
    var mpCover2 = document.getElementById('mpCover');
    var mpTitle2 = document.getElementById('mpTitle');
    var mpBtn2 = document.getElementById('mpBtn');
    var mpPrev2 = document.getElementById('mpPrev');
    var mpNext2 = document.getElementById('mpNext');
    var iconPlay2 = mpBtn2.querySelector('.mp-icon-play');
    var iconPause2 = mpBtn2.querySelector('.mp-icon-pause');
    var plPanel2 = document.getElementById('mpPlaylist');
    var overlay2 = document.getElementById('mpOverlay');
    var plOpen2 = false;

    mpCover2.style.backgroundImage = 'url(' + V.playlist[V.getIdx()].cover + ')';
    mpTitle2.textContent = V.playlist[V.getIdx()].name;
    var playing = !V.audio.paused;
    mpDisc2.classList.toggle('spinning', playing);
    iconPlay2.style.display = playing ? 'none' : 'block';
    iconPause2.style.display = playing ? 'block' : 'none';

    function updateHighlight2() {
      var rows = plPanel2.querySelectorAll('.mpp-row');
      rows.forEach(function(r, i) { r.classList.toggle('active', i === V.getIdx()); });
    }
    plPanel2.innerHTML = '';
    V.playlist.forEach(function(t, i) {
      var row = document.createElement('div');
      row.className = 'mpp-row';
      row.innerHTML = '<span class="mpp-num">' + (i < 9 ? '0' + (i + 1) : i + 1) + '</span><span class="mpp-name">' + t.name + '</span><span class="mpp-artist">' + t.artist + '</span>';
      row.addEventListener('click', function() {
        V.load(i);
        if (V.audio.paused) V.toggle();
        plPanel2.style.display = 'none';
        overlay2.style.display = 'none';
        mpDisc2.classList.remove('expanded');
        plOpen2 = false;
      });
      plPanel2.appendChild(row);
    });
    updateHighlight2();

    function openPanel2() { plOpen2 = true; plPanel2.style.display = 'block'; overlay2.style.display = 'block'; mpDisc2.classList.add('expanded'); }
    function closePanel2() { plOpen2 = false; plPanel2.style.display = 'none'; overlay2.style.display = 'none'; mpDisc2.classList.remove('expanded'); }
    mpDisc2.addEventListener('click', function() { if (plOpen2) closePanel2(); else openPanel2(); });
    overlay2.addEventListener('click', closePanel2);
    mpBtn2.addEventListener('click', function() { V.toggle(); });
    mpPrev2.addEventListener('click', function() { V.prev(); });
    mpNext2.addEventListener('click', function() { V.next(); });
    var onMusic = window.location.pathname.indexOf('/music') !== -1;
    mp2.style.display = onMusic ? 'none' : '';
    if (!V.audio.__syncBound) {
      V.audio.__syncBound = true;
      function syncUI() {
        var d = document.getElementById('mpDisc');
        var ip = document.querySelector('#mpBtn .mp-icon-play');
        var ipa = document.querySelector('#mpBtn .mp-icon-pause');
        var p = !V.audio.paused;
        if (d) d.classList.toggle('spinning', p);
        if (ip) ip.style.display = p ? 'none' : 'block';
        if (ipa) ipa.style.display = p ? 'block' : 'none';
      }
      V.audio.addEventListener('play', syncUI);
      V.audio.addEventListener('pause', syncUI);
      var origLoad = V.load;
      V.load = function(i) {
        origLoad(i);
        var cov = document.getElementById('mpCover');
        var tit = document.getElementById('mpTitle');
        if (cov) cov.style.backgroundImage = 'url(' + V.playlist[i].cover + ')';
        if (tit) tit.textContent = V.playlist[i].name;
        var rows = document.querySelectorAll('.mpp-row');
        rows.forEach(function(r, j) { r.classList.toggle('active', j === i); });
      };
      var origCheck = V.checkMusicPage;
      V.checkMusicPage = function() {
        origCheck();
        var m = document.getElementById('miniPlayer');
        if (m) { var onM = window.location.pathname.indexOf('/music') !== -1; m.style.display = onM ? 'none' : ''; }
      };
    }
    return;
  }

  var audio = new Audio();
  audio.preload = 'none';
  audio.volume = 0.3;
  var idx = 0;
  var playing = false;
  var resumeTime = 0;
  var sourceGeneration = 0;
  var mp = document.getElementById('miniPlayer');
  var mpDisc = document.getElementById('mpDisc');
  var mpCover = document.getElementById('mpCover');
  var mpTitle = document.getElementById('mpTitle');
  var mpBtn = document.getElementById('mpBtn');
  var mpPrev = document.getElementById('mpPrev');
  var mpNext = document.getElementById('mpNext');
  var iconPlay = mpBtn.querySelector('.mp-icon-play');
  var iconPause = mpBtn.querySelector('.mp-icon-pause');
  var plPanel = document.getElementById('mpPlaylist');
  var overlay = document.getElementById('mpOverlay');
  var plOpen = false;

  // Restore from localStorage
  try {
    var s = JSON.parse(localStorage.getItem('vs'));
    if (s && s.i < PL.length) {
      idx = s.i;
      var restoredTime = Number(s.t);
      resumeTime = isFinite(restoredTime) && restoredTime > 0 ? restoredTime : 0;
    }
  } catch(e) {}

  function save() {
    var sourceMatchesTrack = audio.getAttribute('data-idx') === String(idx);
    var savedTime = resumeTime || (sourceMatchesTrack ? audio.currentTime : 0);
    try { localStorage.setItem('vs', JSON.stringify({i:idx, t:savedTime, p:playing})); } catch(e) {}
  }

  function ensureAudioSource() {
    if (audio.getAttribute('data-idx') === String(idx) && audio.getAttribute('src')) return;

    var sourceIndex = idx;
    var generation = ++sourceGeneration;
    var timeToRestore = resumeTime;
    audio.src = resolveUrl(PL[idx]);
    audio.setAttribute('data-idx', idx);

    if (timeToRestore > 0) {
      var restoreSavedTime = function() {
        audio.removeEventListener('loadedmetadata', restoreSavedTime);
        if (generation !== sourceGeneration || audio.getAttribute('data-idx') !== String(sourceIndex)) return;
        try { audio.currentTime = timeToRestore; } catch(e) {}
        resumeTime = 0;
        save();
      };
      if (audio.readyState >= 1) restoreSavedTime();
      else audio.addEventListener('loadedmetadata', restoreSavedTime);
    }
  }

  function load(i) {
    var changed = (idx !== i);
    idx = i;
    if (changed) {
      resumeTime = 0;
      sourceGeneration += 1;
    }
    var t = PL[i];
    mpCover.style.backgroundImage = 'url(' + t.cover + ')';
    mpTitle.textContent = t.name;
    updatePlaylistHighlight();
    save();
    if (playing) { ensureAudioSource(); audio.play(); }
  }

  function setPlaying(p) {
    playing = p;
    mpDisc.classList.toggle('spinning', p);
    iconPlay.style.display = p ? 'none' : 'block';
    iconPause.style.display = p ? 'block' : 'none';
    updateB2t();
    save();
  }

  function toggle() {
    if (playing) { audio.pause(); setPlaying(false); }
    else {
      audio.preload = 'auto';
      ensureAudioSource();
      audio.play().then(function(){ setPlaying(true); }).catch(function(){});
    }
  }

  function next() { load((idx + 1) % PL.length); }
  function prev() { load((idx - 1 + PL.length) % PL.length); }

  function updateB2t() {
    var b2t = document.querySelector('.back-to-top');
    if (b2t) {
      b2t.classList.toggle('vinyl-on', playing);
      if (!b2t.querySelector('.b2t-disc')) {
        var disc = document.createElement('div');
        disc.className = 'b2t-disc';
        b2t.appendChild(disc);
      }
    }
  }

  function checkMusicPage() {
    var onMusic = window.location.pathname.indexOf('/music') !== -1;
    mp.style.display = onMusic ? 'none' : '';
  }

  // --- Playlist panel ---
  function buildPlaylist() {
    plPanel.innerHTML = '';
    PL.forEach(function(t, i) {
      var row = document.createElement('div');
      row.className = 'mpp-row';
      row.innerHTML = '<span class="mpp-num">' + (i < 9 ? '0' + (i + 1) : i + 1) + '</span><span class="mpp-name">' + t.name + '</span><span class="mpp-artist">' + t.artist + '</span>';
      row.addEventListener('click', function() {
        load(i);
        if (!playing) toggle();
        closePlaylist();
      });
      plPanel.appendChild(row);
    });
    updatePlaylistHighlight();
  }

  function updatePlaylistHighlight() {
    var rows = plPanel.querySelectorAll('.mpp-row');
    rows.forEach(function(r, i) { r.classList.toggle('active', i === idx); });
  }

  function openPlaylist() {
    plOpen = true;
    plPanel.style.display = 'block';
    overlay.style.display = 'block';
    mpDisc.classList.add('expanded');
  }

  function closePlaylist() {
    plOpen = false;
    plPanel.style.display = 'none';
    overlay.style.display = 'none';
    mpDisc.classList.remove('expanded');
  }

  mpDisc.addEventListener('click', function() {
    if (plOpen) closePlaylist(); else openPlaylist();
  });
  overlay.addEventListener('click', closePlaylist);
  buildPlaylist();

  // --- Audio events ---
  audio.addEventListener('loadedmetadata', save);
  audio.addEventListener('ended', function() {
    playing = true;
    next();
  });
  audio.addEventListener('play', function(){ setPlaying(true); });
  audio.addEventListener('pause', function(){ setPlaying(false); });
  audio.addEventListener('timeupdate', function(){
    if (audio.currentTime && !(Math.floor(audio.currentTime) % 2)) save();
  });
  audio.addEventListener('error', function(){ setPlaying(false); });

  mpBtn.addEventListener('click', toggle);
  mpPrev.addEventListener('click', prev);
  mpNext.addEventListener('click', next);

  // PJAX: update UI after page transitions
  document.addEventListener('pjax:success', function() {
    checkMusicPage();
    updateB2t();
  });

  // Init
  checkMusicPage();
  updateB2t();

  // Expose for music page
  window.__vinyl = {
    audio: audio, playlist: PL,
    getIdx: function(){ return idx; },
    load: load, toggle: toggle, next: next, prev: prev,
    setPlaying: setPlaying, checkMusicPage: checkMusicPage
  };

  // Restore the saved track/time without fetching media until a user gesture.
  load(idx);
})();
</script>

<!-- Live2D 看板娘 -->
<script>
window.__blogDesktopEffectsEnabled = Boolean(
  window.matchMedia &&
  window.matchMedia('(min-width: 769px) and (hover: hover) and (pointer: fine)').matches
);
</script>

<style>
#waifu {
  transform: scale(0.42);
  transform-origin: left bottom;
}
/* 工具栏缩小 + 左移 */
#waifu-tool {
  transform: scale(0.7);
  transform-origin: left bottom;
  left: 8px !important;
  right: auto !important;
}
@media (max-width: 768px) {
  #waifu { display: none; }
}
</style>

<!-- 拦截 CDN 请求：过滤模型 + sagiri 语音走本地 -->
<script>
(function(){
  if (!window.__blogDesktopEffectsEnabled || window.__blogLive2dHooksInstalled) return;
  window.__blogLive2dHooksInstalled = true;

  // 抑制 widget v1.0.1 Cubism2 hitTest 报错
  var _warn = console.warn, _error = console.error;
  console.warn = function() {
    var m = Array.prototype.join.call(arguments, ' ');
    if (m.indexOf('hit_areas') !== -1 || m.indexOf('D_REF') !== -1 || m.indexOf('_$NP') !== -1) return;
    return _warn.apply(console, arguments);
  };
  console.error = function() {
    var m = Array.prototype.join.call(arguments, ' ');
    if (m.indexOf('hit_areas') !== -1 || m.indexOf('D_REF') !== -1 || m.indexOf('_$NP') !== -1) return;
    return _error.apply(console, arguments);
  };

  var origFetch = window.fetch;
  var CDN = 'https://cdn.jsdelivr.net/npm/yzs-live2d_src@1.1.0';

  window.fetch = function(url, opts) {
    if (typeof url !== 'string') return origFetch.apply(this, arguments);

    // 过滤模型列表 → 只保留三人
    if (url.indexOf('yzs-live2d_src') !== -1 && url.indexOf('model_list.json') !== -1) {
      return Promise.resolve(new Response(JSON.stringify({
        models: ["umaru", "sagiri", "chino"],
        messages: [
          "U.M.R. はい! 小埋参上!",
          "埃罗芒阿老师来啦！",
          "欢迎光临 Rabbit House ~"
        ]
      }), { headers: { 'Content-Type': 'application/json' } }));
    }

    // sagiri 的 index.json → 走本地（含 B 站语音引用）
    if (url.indexOf('yzs-live2d_src') !== -1 && url.indexOf('sagiri/index.json') !== -1) {
      return origFetch('/js/model/sagiri/index.json', opts);
    }

    // sagiri 的语音文件 → 走本地（B 站提取的 WAV）
    if (url.indexOf('yzs-live2d_src') !== -1 && url.indexOf('sagiri/voice/') !== -1) {
      return origFetch(url.replace(CDN + '/model/sagiri/', '/js/model/sagiri/'), opts);
    }

    return origFetch.apply(this, arguments);
  };
})();
</script>

<!-- 全局音量控制 -->
<script>
(function(){
  if (!window.__blogDesktopEffectsEnabled || window.__lv2AudioHooked) return;
  window.__lv2AudioHooked = true;
  var VOL = 0.5;
  var DEBOUNCE = 600;      // 防抖窗口(ms)：连续触发只放行最后一次，可调
  var pendingPlay = {};    // model -> 待播放的最后一个 Audio
  var debounceTimer = {};  // model -> setTimeout id
  var liveAudios = {};     // model -> [正在播放的 Audio]

  function modelOf(url) {
    if (!url) return null;
    var s = String(url);
    if (s.indexOf('/umaru/') !== -1) return 'umaru';
    if (s.indexOf('/sagiri/') !== -1) return 'sagiri';
    if (s.indexOf('/chino/') !== -1) return 'chino';
    return null;
  }

  function stopOthers(model) {
    Object.keys(liveAudios).forEach(function(m) {
      if (m === model) return;
      (liveAudios[m] || []).forEach(function(a) {
        try { a.pause(); if (a.currentTime !== undefined) a.currentTime = 0; } catch(e) {}
      });
      liveAudios[m] = [];
    });
  }

  function cleanup(model, a) {
    var arr = liveAudios[model];
    if (!arr) return;
    var idx = arr.indexOf(a);
    if (idx !== -1) arr.splice(idx, 1);
  }

  var OrigAudio = window.Audio;
  window.Audio = function(url) {
    var a = new OrigAudio(url);
    a.volume = VOL;

    var model = modelOf(url);
    if (model && !a.__lv2Monitored) {
      a.__lv2Monitored = true;
      a.__lv2Model = model;

      // 关键：Audio 默认 preload="auto"，new Audio(url) 会立刻发起 .wav 请求，
      // 即使被节流丢弃，请求也已经发出 → 网络面板堆积。改 none 延到真正播放才取。
      a.preload = 'none';

      var _play = a.play;
      a.play = function() {
        // 防抖（尾沿）：每次触发覆盖“最后一次”并重置计时器，安静满 DEBOUNCE 后
        // 只播放最后一次 → 一波连续触发从 N 个请求压成 1 个
        pendingPlay[model] = a;
        if (debounceTimer[model]) clearTimeout(debounceTimer[model]);
        debounceTimer[model] = setTimeout(function() {
          debounceTimer[model] = null;
          var target = pendingPlay[model];
          if (!target) return;
          pendingPlay[model] = null;

          stopOthers(model);
          if (!liveAudios[model]) liveAudios[model] = [];
          liveAudios[model].push(target);
          target.preload = 'auto';
          _play.call(target).catch(function(){});
        }, DEBOUNCE);

        // 返回 resolved Promise，兼容 waifu-tips 的 play().then() 调用链
        return Promise.resolve();
      };

      a.addEventListener('ended', function() { cleanup(model, a); });
      a.addEventListener('pause', function() { cleanup(model, a); });
    }

    return a;
  };
  window.Audio.prototype = OrigAudio.prototype;
})();
</script>


<script>
(function(){
  if (!window.__blogDesktopEffectsEnabled || window.__blogLive2dInitialized) return;
  window.__blogLive2dInitialized = true;

  // 抑制 Cubism2 运行时 hit_areas 引用异常
  window.addEventListener('error', function(e) {
    var m = e.message || '';
    if (m.indexOf('_$NP') !== -1 || m.indexOf('D_REF') !== -1 || m.indexOf('null') !== -1 && e.filename && e.filename.indexOf('live2d.min.js') !== -1) {
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  }, true);

  if (!document.getElementById('blog-live2d-style')) {
    var style = document.createElement('link');
    style.id = 'blog-live2d-style';
    style.rel = 'stylesheet';
    style.href = 'https://fastly.jsdelivr.net/npm/live2d-widgets@1.0.1/dist/waifu.css';
    document.head.appendChild(style);
  }

  var s = document.createElement('script');
  s.type = 'module';
  s.src = 'https://fastly.jsdelivr.net/npm/live2d-widgets@1.0.1/dist/waifu-tips.js';
  s.onload = function() {
    if (typeof initWidget !== 'function') return;
    initWidget({
      waifuPath: '/js/live2d-config.json',
      cdnPath: 'https://cdn.jsdelivr.net/npm/yzs-live2d_src@1.1.0/',
      cubism2Path: 'https://fastly.jsdelivr.net/npm/live2d-widgets@1.0.1/dist/live2d.min.js',
      cubism5Path: 'https://cubism.live2d.com/sdk-web/cubismcore/live2dcubismcore.min.js',
      tools: ['switch-model', 'switch-texture', 'photo', 'info', 'quit'],
      logLevel: 'warn',
      drag: false
    });
  };
  document.head.appendChild(s);
})();
</script>

<!-- 鼠标拖尾粒子 -->

<!-- 鼠标拖尾粒子 -->
<canvas id="mouseTrail" style="position:fixed;top:0;left:0;pointer-events:none;z-index:9999"></canvas>
<script>
(function(){
  var canvas = document.getElementById('mouseTrail');
  if (!window.__blogDesktopEffectsEnabled) {
    if (canvas) canvas.remove();
    return;
  }
  if (window.__blogMouseTrailInitialized) return;
  window.__blogMouseTrailInitialized = true;

  var ctx = canvas.getContext('2d');
  var particles = [];
  var maxParticles = 40;
  var mouse = { x: -100, y: -100 };
  var raf;

  function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resize();
  window.addEventListener('resize', resize);

  document.addEventListener('mousemove', function(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
    var now = Date.now();
    for (var i = 0; i < 2; i++) {
      if (particles.length >= maxParticles) break;
      particles.push({
        x: mouse.x,
        y: mouse.y,
        r: Math.random() * 3 + 1.5,
        vx: (Math.random() - 0.5) * 1.2,
        vy: (Math.random() - 0.5) * 1.2,
        life: 1,
        decay: Math.random() * 0.02 + 0.015,
        hue: Math.random() * 60 + 200
      });
    }
  });

  function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.life -= p.decay;
      if (p.life <= 0) { particles.splice(i, 1); continue; }
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r * p.life, 0, Math.PI * 2);
      ctx.fillStyle = 'hsla(' + p.hue + ', 80%, 65%, ' + (p.life * 0.6) + ')';
      ctx.fill();
    }
    raf = requestAnimationFrame(draw);
  }
  draw();

  // PJAX guard
  document.addEventListener('pjax:success', function() {
    canvas = document.getElementById('mouseTrail');
    if (!canvas) return;
    ctx = canvas.getContext('2d');
    resize();
  });
})();
</script>
