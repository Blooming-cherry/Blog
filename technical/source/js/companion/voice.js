(function (global) {
  'use strict';
  const api = global.BlogCompanion = global.BlogCompanion || {};
  api.Voice = class {
    constructor(options = {}) {
      this.audio = options.audio || new global.Audio();
      this.audio.preload = 'none';
      this.audio.volume = 0.5;
      this.muted = true; this.state = 'muted'; this.serial = 0; this.id = null; this.listeners = []; this.timer = null; this.destroyed = false;
      this.onState = options.onState || (() => {});
      this.duck = options.duck || (active => { if (global.__vinyl && typeof global.__vinyl.setCompanionDucking === 'function') global.__vinyl.setCompanionDucking(active); });
    }
    setState(state, error) { this.state = state; this.onState(state, error); }
    clear() {
      this.serial++;
      clearTimeout(this.timer); this.timer = null;
      for (const [name, listener] of this.listeners) this.audio.removeEventListener(name, listener);
      this.listeners = []; this.id = null;
      this.audio.pause();
      this.audio.removeAttribute('src'); this.audio.load();
      this.duck(false);
    }
    stop() { this.clear(); this.setState(this.muted ? 'muted' : 'idle'); }
    setMuted(value) { this.muted = Boolean(value); if (this.muted) this.stop(); else this.setState('idle'); }
    setVolume(value) { if (Number.isFinite(value)) this.audio.volume = Math.max(0, Math.min(1, value)); }
    async play(id, source) {
      if (this.destroyed || this.muted || !source || (this.id === id && ['loading', 'playing'].includes(this.state))) return false;
      this.clear();
      const serial = this.serial;
      const valid = () => !this.destroyed && serial === this.serial;
      let url;
      try { url = api.sameOrigin(source); } catch (error) { this.setState('error', error); return false; }
      this.id = id;
      this.setState('loading');
      const finish = (state, error) => { if (!valid()) return; this.clear(); this.setState(state, error); };
      const waitForMedia = () => { clearTimeout(this.timer); this.timer = setTimeout(() => finish('error', new Error('Voice loading timed out')), 10000); };
      const listen = (name, callback) => {
        const handler = () => { if (valid() && (!this.audio.currentSrc || this.audio.currentSrc === url)) callback(); };
        this.audio.addEventListener(name, handler); this.listeners.push([name, handler]);
      };
      listen('playing', () => { clearTimeout(this.timer); this.timer = null; this.setState('playing'); this.duck(true); });
      listen('waiting', () => { this.setState('loading'); this.duck(false); waitForMedia(); });
      listen('stalled', () => { this.setState('loading'); this.duck(false); waitForMedia(); });
      listen('ended', () => finish('idle'));
      listen('pause', () => { if (this.audio.paused) finish(this.muted ? 'muted' : 'idle'); });
      listen('error', () => finish('error', new Error('Voice could not be loaded')));
      this.audio.src = url;
      waitForMedia();
      try { await this.audio.play(); return valid(); }
      catch (error) {
        if (!valid()) return false;
        if (error.name === 'NotAllowedError') { this.muted = true; finish('muted', error); }
        else finish('error', error);
        return false;
      }
    }
    syncMusic() { this.duck(this.state === 'playing' && !this.muted); }
    destroy() { this.destroyed = true; this.stop(); }
  };
})(window);
