(function (global) {
  'use strict';
  const api = global.BlogCompanion = global.BlogCompanion || {};
  const key = 'blog-companion-v1';
  const defaults = () => ({ disabled: false, collapsed: false, muted: true, volume: 0.5, size: 270, position: null });
  function normalize(input) {
    const value = defaults();
    if (!input || typeof input !== 'object') return value;
    for (const name of ['disabled', 'collapsed', 'muted']) if (typeof input[name] === 'boolean') value[name] = input[name];
    if (Number.isFinite(input.volume) && input.volume >= 0 && input.volume <= 1) value.volume = input.volume;
    if (Number.isFinite(input.size) && input.size >= 180 && input.size <= 320) value.size = input.size;
    if (input.position && Number.isFinite(input.position.x) && input.position.x >= 0 && Number.isFinite(input.position.y) && input.position.y >= 0) value.position = { x: input.position.x, y: input.position.y };
    return value;
  }
  api.Preferences = class {
    constructor(storage) {
      this.storage = storage;
      try { this.value = normalize(JSON.parse(storage.getItem(key))); } catch (_) { this.value = defaults(); }
    }
    update(patch) {
      this.value = normalize(Object.assign({}, this.value, patch));
      try { this.storage.setItem(key, JSON.stringify(this.value)); } catch (_) { /* Private browsing remains usable. */ }
      return this.value;
    }
    reset() { return this.update(defaults()); }
  };
  api.shouldAutoLoad = state => !state.mobile && !state.collapsed && !state.disabled && !state.reducedMotion;
  api.sameOrigin = function (value) {
    const url = new URL(value, global.location.href);
    if (url.origin !== global.location.origin || !/^https?:$/.test(url.protocol)) throw new Error('Companion resources must use the same origin');
    return url.href;
  };
})(window);
