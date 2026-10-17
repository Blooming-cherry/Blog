(function () {
  'use strict';
  if (window.__vinylMusicUI) { window.__vinylMusicUI.mount(); return; }
  var V = window.__vinyl;
  if (!V) return;
  var Covers = window.__vinylCoverLoader;
  if (!Covers) return;
  var placeholder = Covers.placeholder, cleanups = [];
  function fmt(time) {
    time = Number.isFinite(time) && time > 0 ? time : 0;
    return String(Math.floor(time / 60)).padStart(2, '0') + ':' + String(Math.floor(time % 60)).padStart(2, '0');
  }
  function listen(el, event, fn) {
    if (!el) return;
    el.addEventListener(event, fn);
    cleanups.push(function () { el.removeEventListener(event, fn); });
  }
  function dispose() { cleanups.splice(0).forEach(function (fn) { fn(); }); }
  function bind(root, mini) {
    var prefix = mini ? 'mp' : 'music';
    var find = function (id) { return document.getElementById(id); };
    var cover = find(mini ? 'mpCover' : 'vinylCover'), disc = find(mini ? 'mpDisc' : 'vinylDisc');
    var title = find(mini ? 'mpTitle' : 'trackTitle'), artist = find('trackArtist');
    var playButton = find(mini ? 'mpBtn' : 'playBtn'), statusEl = find(prefix + 'Status');
    var retry = find(prefix + 'Retry'), coverRetry = find(prefix + 'CoverRetry');
    var progress = find(mini ? 'mpProgress' : 'progressBar'), volume = find(prefix + 'Volume');
    var current = find(mini ? 'mpTimeCur' : 'timeCur'), duration = find(mini ? 'mpTimeDur' : 'timeDur');
    var list = find(mini ? 'mpTracks' : 'playlist'), coverId = '', coverGeneration = 0, disposed = false, preview = false;
    var rows = [];
    list.textContent = '';
    V.playlist.forEach(function (track, i) {
      var row = document.createElement('button');
      row.type = 'button'; row.className = mini ? 'mpp-row' : 'vinyl-playlist-item';
      var number = document.createElement('span'); number.className = mini ? 'mpp-num' : 'pl-num'; number.textContent = String(i + 1).padStart(2, '0');
      var name = document.createElement('span'); name.className = mini ? 'mpp-name' : 'pl-title'; name.textContent = track.name;
      row.append(number, name);
      row.addEventListener('click', function () { V.load(i); V.play(); });
      list.appendChild(row); rows.push(row);
    });
    function updateCover(snapshot, force) {
      var path = Covers.path(snapshot.track), key = snapshot.trackId + ':' + path;
      if (!force && coverId === key) return;
      coverId = key;
      var request = ++coverGeneration;
      cover.classList.remove('cover-ready'); cover.src = placeholder;
      cover.alt = snapshot.track.name + ' · 唱片封面';
      coverRetry.hidden = true;
      cover.dataset.coverState = path === placeholder ? 'placeholder' : 'loading';
      if (path === placeholder) return;
      
      (force ? Covers.retry(path) : Covers.load(path)).then(function (resolved) {
        if (disposed || request !== coverGeneration || !root.isConnected) return;
        cover.src = resolved; cover.dataset.coverState = 'ready'; cover.classList.add('cover-ready');
      }).catch(function () {
        if (disposed || request !== coverGeneration || !root.isConnected) return;
        cover.dataset.coverState = 'error'; coverRetry.hidden = false;
      });
    }
    function sync(snapshot) {
      title.textContent = snapshot.track.name;
      if (!mini && artist) artist.textContent = snapshot.track.artist + ' · ' + snapshot.track.album;
      updateCover(snapshot); Covers.prefetch(snapshot, V.playlist);
      // Never remove the animation: pausing its timeline keeps the current angle.
      disc.classList.toggle('music-playing', snapshot.playing);
      var tonearm = find('vinylTonearm');
      if (!mini && tonearm) tonearm.classList.toggle('playing', snapshot.playing);
      playButton.setAttribute('aria-label', snapshot.playing || snapshot.status === 'loading' || snapshot.status === 'buffering' ? '暂停' : '播放');
      playButton.setAttribute('aria-pressed', String(snapshot.playing));
      playButton.querySelector('[data-play]').hidden = snapshot.playing;
      playButton.querySelector('[data-pause]').hidden = !snapshot.playing;
      var messages = { idle: '点击播放', paused: '已暂停', loading: '正在加载…', buffering: '正在缓冲…', playing: '正在播放', error: '无法播放，可重试' };
      statusEl.textContent = messages[snapshot.status]; retry.hidden = snapshot.status !== 'error';
      progress.disabled = !snapshot.canSeek;
      if (!snapshot.canSeek) preview = false;
      progress.max = snapshot.duration || 0;
      if (!preview) { progress.value = snapshot.currentTime; current.textContent = fmt(snapshot.currentTime); }
      progress.setAttribute('aria-valuetext', fmt(Number(progress.value)) + ' / ' + fmt(snapshot.duration));
      duration.textContent = fmt(snapshot.duration);
      volume.value = Math.round(snapshot.volume * 100);
      volume.setAttribute('aria-valuetext', Math.round(snapshot.volume * 100) + '%');
      rows.forEach(function (row, i) {
        row.classList.toggle('active', i === snapshot.idx);
        if (i === snapshot.idx) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
      });
    }
    cleanups.push(V.subscribe(sync));
    cleanups.push(function () { disposed = true; ++coverGeneration; });
    listen(playButton, 'click', V.toggle);
    listen(find(mini ? 'mpPrev' : 'musicPrev'), 'click', V.prev);
    listen(find(mini ? 'mpNext' : 'musicNext'), 'click', V.next);
    listen(retry, 'click', V.retry);
    listen(coverRetry, 'click', function () { updateCover(V.getState(), true); });
    listen(volume, 'input', function () { V.setVolume(Number(volume.value) / 100); });
    listen(progress, 'input', function () {
      preview = true; current.textContent = fmt(Number(progress.value));
      progress.setAttribute('aria-valuetext', fmt(Number(progress.value)) + ' / ' + fmt(V.getState().duration));
    });
    listen(progress, 'change', function () { preview = false; V.seek(Number(progress.value)); });
    listen(progress, 'pointercancel', function () { preview = false; sync(V.getState()); });
    listen(progress, 'blur', function () { if (preview) { preview = false; sync(V.getState()); } });
  }
  function mount() {
    dispose();
    var mini = document.getElementById('miniPlayer'), page = document.getElementById('musicStage');
    if (mini) {
      mini.hidden = Boolean(page);
      bind(mini, true);
      var expand = document.getElementById('mpExpand'), panel = document.getElementById('mpPlaylist'), overlay = document.getElementById('mpOverlay');
      function close(returnFocus) {
        panel.hidden = true; overlay.hidden = true; expand.setAttribute('aria-expanded', 'false');
        if (returnFocus) expand.focus();
      }
      close(false);
      listen(expand, 'click', function () {
        var open = panel.hidden; panel.hidden = !open; overlay.hidden = !open;
        expand.setAttribute('aria-expanded', String(open));
      });
      listen(document.getElementById('mpClose'), 'click', function () { close(true); });
      listen(overlay, 'click', function () { close(true); });
      listen(panel, 'keydown', function (event) { if (event.key === 'Escape') { close(true); event.preventDefault(); } });
      listen(expand, 'keydown', function (event) { if (event.key === 'Escape') close(true); });
      // Reading controls remain reachable when the panel is opened by keyboard.
      listen(expand, 'click', function () { if (!panel.hidden) document.getElementById('mpClose').focus(); });
    }
    if (page) bind(page, false);
  }
  window.__vinylMusicUI = { mount: mount, dispose: dispose };
  window.addEventListener('pjax:send', dispose);
  window.addEventListener('pjax:success', mount);
  mount();
})();
