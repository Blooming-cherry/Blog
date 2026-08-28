/**
 * Monster Siren URL Loader
 * Fetches fresh audio URLs from the site's music.json, caches in localStorage (30min TTL).
 * Sets window.__sirenUrls before the player initializes.
 */
var PROXY_URL = "https://blog.adaydream.cn/music.json";

(function loadSirenUrls() {
  var CACHE_KEY = "siren_urls_v2"; // v2: 值改为 /audio/<cid>，旧缓存存的是会过期的 HyCDN 直链，作废
  var TTL = 30 * 60 * 1000;

  function fetchFresh() {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", PROXY_URL, true);
    xhr.timeout = 10000;
    xhr.onload = function () {
      if (xhr.status === 200) {
        try {
          var json = JSON.parse(xhr.responseText);
          if (json.code === 0 && json.data) {
            var map = {};
            json.data.forEach(function (s) {
              map[s.cid] = '/audio/' + s.cid;
            });
            var cache = { ts: Date.now(), urls: map };
            try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache)); } catch (e) {}
            window.__sirenUrls = map;
            window.__sirenReady = true;
            return;
          }
        } catch (e) {}
      }
      fallback();
    };
    xhr.onerror = fallback;
    xhr.ontimeout = fallback;
    xhr.send();
  }

  function fallback() {
    try {
      var raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        var cache = JSON.parse(raw);
        if (cache.urls) { window.__sirenUrls = cache.urls; }
      }
    } catch (e) {}
    window.__sirenReady = true;
  }

  try {
    var raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      var cache = JSON.parse(raw);
      if (cache.ts && (Date.now() - cache.ts < TTL) && cache.urls) {
        window.__sirenUrls = cache.urls;
        window.__sirenReady = true;
        return;
      }
    }
  } catch (e) {}

  fetchFresh();
})();
