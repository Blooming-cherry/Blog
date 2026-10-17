(function () {
  'use strict';
  if (window.__vinylCoverLoader) return;
  var placeholder = '/js/music/placeholder.svg';
  var requests = new Map();

  function path(track) {
    var local = (window.__vinylCoverPaths || {})[track.cid] || track.coverLocal;
    if (local) {
      if (/^data:image\//i.test(local)) return local;
      try {
        var localUrl = new URL(local, window.location.href);
        if (localUrl.origin === window.location.origin && /^https?:$/.test(localUrl.protocol)) return localUrl.href;
      } catch (_) {}
    }
    try {
      var source = new URL(track.cover, window.location.href);
      return /^https?:$/.test(source.protocol) ? source.href : placeholder;
    } catch (_) { return placeholder; }
  }

  function load(source) {
    if (requests.has(source)) return requests.get(source);
    var request = new Promise(function (resolve, reject) {
      var image = new Image();
      image.onload = function () {
        if (!image.naturalWidth) { reject(new Error('Empty cover')); return; }
        Promise.resolve(typeof image.decode === 'function' ? image.decode() : undefined).then(function () { resolve(source); }, reject);
      };
      image.onerror = function () { reject(new Error('Cover unavailable')); };
      image.src = source;
    });
    requests.set(source, request);
    request.catch(function () { if (requests.get(source) === request) requests.delete(source); });
    return request;
  }

  function prefetch(snapshot, playlist) {
    var current = path(snapshot.track);
    var next = path(playlist[(snapshot.idx + 1) % playlist.length]);
    requests.forEach(function (_, source) { if (source !== current && source !== next) requests.delete(source); });
    if (next !== placeholder) load(next);
  }

  window.__vinylCoverLoader = {
    placeholder: placeholder,
    path: path,
    load: load,
    prefetch: prefetch,
    retry: function (source) { requests.delete(source); return load(source); }
  };
})();
