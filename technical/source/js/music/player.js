(function () {
  'use strict';
  if (window.__vinyl) return;
  var playlist = window.__vinylPlaylist || [];
  if (!playlist.length) return;
  var audio = new Audio();
  audio.preload = 'none';
  var idx = 0, resumeTime = 0, volume = 0.3, ducked = false;
  var status = 'idle', desiredPlaying = false, generation = 0, playRequest = 0;
  var subscribers = new Set(), lastEvent = '', restoring = null;
  try {
    var saved = JSON.parse(localStorage.getItem('vs'));
    if (saved && Number.isInteger(saved.i) && saved.i >= 0 && saved.i < playlist.length) {
      idx = saved.i;
      resumeTime = Number.isFinite(saved.t) && saved.t > 0 ? saved.t : 0;
      if (Number.isFinite(saved.v)) volume = Math.max(0, Math.min(1, saved.v));
    }
  } catch (_) {}
  audio.volume = volume;

  function hasMetadata() {
    return audio.getAttribute('data-idx') === String(idx) && audio.readyState >= 1 && Number.isFinite(audio.duration) && audio.duration > 0;
  }
  function state() {
    var ready = hasMetadata();
    return { idx: idx, track: playlist[idx], trackId: playlist[idx].cid, playing: status === 'playing' && !audio.paused,
      status: status, currentTime: ready ? audio.currentTime : resumeTime, duration: ready ? audio.duration : 0,
      canSeek: ready, volume: volume, ducked: ducked };
  }
  function save() {
    try { localStorage.setItem('vs', JSON.stringify({ i: idx, t: state().currentTime, v: volume })); } catch (_) {}
  }
  function publish() {
    var snapshot = state();
    subscribers.forEach(function (fn) { fn(snapshot); });
    var key = snapshot.trackId + ':' + snapshot.playing;
    if (key !== lastEvent) {
      lastEvent = key;
      window.dispatchEvent(new CustomEvent('blog:music-state', { detail: { playing: snapshot.playing, trackId: snapshot.trackId } }));
    }
  }
  function clearRestore() {
    if (restoring) audio.removeEventListener('loadedmetadata', restoring);
    restoring = null;
  }
  function source() {
    if (audio.getAttribute('data-idx') === String(idx) && audio.getAttribute('src')) return;
    clearRestore();
    var request = ++generation, time = resumeTime;
    audio.setAttribute('data-idx', String(idx));
    audio.src = (window.__sirenUrls && window.__sirenUrls[playlist[idx].cid]) || playlist[idx].url;
    if (time > 0) {
      restoring = function () {
        clearRestore();
        if (request !== generation || !hasMetadata()) return;
        audio.currentTime = Math.min(time, Math.max(0, audio.duration - 0.1));
        resumeTime = 0; save(); publish();
      };
      audio.addEventListener('loadedmetadata', restoring);
    }
  }
  function play() {
    desiredPlaying = true; status = 'loading';
    audio.preload = 'auto'; source();
    var request = ++playRequest;
    publish();
    // Call play in the user's gesture; a rejected/stale promise cannot resurrect an old intent.
    var result;
    try { result = audio.play(); } catch (error) { result = Promise.reject(error); }
    return Promise.resolve(result).catch(function () {
      if (request !== playRequest) return;
      desiredPlaying = false; status = 'error'; publish(); save();
    });
  }
  function pause() {
    desiredPlaying = false; ++playRequest;
    audio.pause(); status = 'paused'; publish(); save();
  }
  function load(i) {
    if (!Number.isInteger(i) || i < 0 || i >= playlist.length) return;
    if (i === idx) { publish(); return; }
    var continuePlaying = desiredPlaying && !audio.paused;
    desiredPlaying = false; ++playRequest; ++generation; clearRestore();
    audio.pause();
    idx = i; resumeTime = 0; status = 'idle';
    audio.removeAttribute('src'); audio.removeAttribute('data-idx'); audio.load();
    publish(); save();
    if (continuePlaying) play();
  }
  function setVolume(value) {
    if (!Number.isFinite(Number(value))) return;
    volume = Math.max(0, Math.min(1, Number(value)));
    audio.volume = volume * (ducked ? 0.25 : 1);
    save(); publish();
  }
  function duck(value) {
    ducked = Boolean(value);
    audio.volume = volume * (ducked ? 0.25 : 1);
    publish();
  }
  function seek(value) {
    if (!hasMetadata() || !Number.isFinite(Number(value))) return;
    audio.currentTime = Math.max(0, Math.min(audio.duration, Number(value)));
    resumeTime = 0; publish(); save();
  }
  audio.addEventListener('playing', function () {
    if (!desiredPlaying) return;
    status = 'playing'; publish(); save();
  });
  audio.addEventListener('waiting', function () { if (desiredPlaying) { status = 'buffering'; publish(); } });
  audio.addEventListener('pause', function () {
    // A previous source's queued pause event can arrive after the new play call.
    if (status === 'error' || !audio.paused) return;
    desiredPlaying = false; status = 'paused'; publish(); save();
  });
  audio.addEventListener('error', function () {
    if (!audio.getAttribute('src')) return;
    desiredPlaying = false; ++playRequest; status = 'error'; publish();
  });
  audio.addEventListener('ended', function () {
    desiredPlaying = false; load((idx + 1) % playlist.length); play();
  });
  ['loadedmetadata', 'durationchange', 'timeupdate', 'canplay'].forEach(function (name) {
    audio.addEventListener(name, function () { publish(); if (name === 'timeupdate' || name === 'loadedmetadata') save(); });
  });
  window.addEventListener('pagehide', save);
  window.__vinyl = {
    audio: audio, playlist: playlist, getIdx: function () { return idx; }, getState: state,
    load: load, toggle: function () { return desiredPlaying ? pause() : play(); },
    next: function () { load((idx + 1) % playlist.length); }, prev: function () { load((idx - 1 + playlist.length) % playlist.length); },
    play: play, retry: function () { audio.removeAttribute('data-idx'); return play(); },
    seek: seek, setVolume: setVolume, setCompanionDucking: duck,
    subscribe: function (fn) { subscribers.add(fn); fn(state()); return function () { subscribers.delete(fn); }; },
    checkMusicPage: function () { if (window.__vinylMusicUI) window.__vinylMusicUI.mount(); }
  };
})();
