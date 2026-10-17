(function (global) {
  'use strict';
  const api = global.BlogCompanion = global.BlogCompanion || {};
  const poster = '/assets/companion/blue-maid/v1/poster.png';
  api.Controller = class {
    constructor(options = {}) {
      this.manifestURL = options.manifest || '/assets/companion/manifest.json';
      let storage; try { storage = global.localStorage; } catch (_) { storage = { getItem() {}, setItem() {} }; }
      this.preferences = new api.Preferences(storage);
      this.mobileQuery = global.matchMedia('(max-width: 768px), (pointer: coarse)');
      this.motionQuery = global.matchMedia('(prefers-reduced-motion: reduce)');
      this.serial = 0; this.state = 'poster'; this.renderer = null; this.request = null; this.disposers = []; this.destroyed = false; this.inNavigation = false;
      this.mobileExpanded = false;
      this.voice = new api.Voice({ onState: (state, error) => {
        if (state === 'muted' && error) { this.preferences.update({ muted: true }); this.message('浏览器未允许播放，请点击开启声音。'); this.syncControls(); }
        else if (state === 'error') this.message('语音未加载，可再次点击重试。');
      } });
      this.voice.setMuted(this.preferences.value.muted); this.voice.setVolume(this.preferences.value.volume);
      this.createUI(); this.bind(); this.apply(); this.schedule();
    }
    listen(target, name, callback, options) {
      target.addEventListener(name, callback, options); this.disposers.push(() => target.removeEventListener(name, callback, options));
    }
    createUI() {
      const root = document.createElement('aside'); root.id = 'blog-companion'; root.setAttribute('aria-label', '蓝女仆看板娘');
      root.innerHTML = `<div class="companion-status" role="status" aria-live="polite" hidden></div><button type="button" data-companion-avatar aria-label="打开蓝女仆看板娘"><img src="${poster}" alt="原创静态看板娘图标"><span class="companion-stage" aria-hidden="true"></span></button><button type="button" data-companion-more aria-label="看板娘设置" aria-expanded="false" aria-controls="companion-menu">···</button><section id="companion-menu" data-companion-menu role="dialog" aria-label="看板娘设置" hidden><div class="companion-menu-head"><span>看板娘</span><button type="button" data-companion-close aria-label="关闭设置">×</button></div><div data-companion-voice-notice role="status">形象加载后检查语音资源。</div><div data-companion-voice-controls hidden><button type="button" data-companion-sound>开启声音</button><label>语音音量<input data-companion-volume type="range" min="0" max="1" step="0.05" aria-label="看板娘语音音量"></label></div><div class="companion-size"><span>大小</span><div class="companion-segments" data-companion-size role="group" aria-label="看板娘大小"><button type="button" data-size="220" aria-pressed="false">小</button><button type="button" data-size="270" aria-pressed="true">中</button><button type="button" data-size="310" aria-pressed="false">大</button></div></div><div class="companion-actions"><button type="button" data-companion-retry>重新加载</button><button type="button" data-companion-position>归位</button><button type="button" data-companion-collapse>收起</button><button type="button" data-companion-credits>授权</button><button type="button" data-companion-disable>关闭看板娘</button></div></section>`;
      this.root = root; this.avatar = root.querySelector('[data-companion-avatar]'); this.stage = root.querySelector('.companion-stage'); this.status = root.querySelector('.companion-status'); this.menu = root.querySelector('[data-companion-menu]'); this.more = root.querySelector('[data-companion-more]');
      this.syncVoiceControls();
      document.body.appendChild(root);
      this.listen(root.querySelector('img'), 'error', event => { const image = event.target; if (!image.src.endsWith(poster)) image.src = poster; });
    }
    bind() {
      this.listen(this.avatar, 'click', () => {
        if (this.suppressClick) { this.suppressClick = false; return; }
        if (this.preferences.value.disabled) this.preferences.update({ disabled: false });
        if (this.isCollapsed()) this.expand();
        else { if (this.renderer) this.renderer.motion('tap', true); const voice = this.manifest?.voices?.tap; if (voice) this.voice.play('tap', voice); }
      });
      this.listen(this.more, 'click', () => this.setMenu(this.menu.hidden));
      this.listen(this.avatar, 'contextmenu', event => { event.preventDefault(); this.setMenu(true); });
      this.listen(this.root.querySelector('[data-companion-close]'), 'click', () => this.setMenu(false, true));
      const sizeGroup = this.root.querySelector('[data-companion-size]');
      for (const button of sizeGroup.querySelectorAll('[data-size]')) this.listen(button, 'click', () => { this.preferences.update({ size: Number(button.dataset.size) }); this.apply(); this.renderer?.fit(); });
      this.listen(this.root.querySelector('[data-companion-sound]'), 'click', () => {
        const muted = !this.preferences.value.muted;
        this.preferences.update({ muted }); this.voice.setMuted(muted); this.syncControls();
        if (!muted) { const voice = this.manifest?.voices?.tap; if (voice) this.voice.play('tap', voice); else this.message(this.manifest?.voiceNotice || '看板娘语音尚未提供。'); }
      });
      this.listen(this.root.querySelector('[data-companion-volume]'), 'input', event => { const volume = Number(event.target.value); this.preferences.update({ volume }); this.voice.setVolume(volume); });      this.listen(this.root.querySelector('[data-companion-retry]'), 'click', () => { this.setMenu(false, true); this.expand(true); });
      this.listen(this.root.querySelector('[data-companion-collapse]'), 'click', () => { this.collapse(); this.avatar.focus(); });
      this.listen(this.root.querySelector('[data-companion-position]'), 'click', () => { this.preferences.update({ position: null }); this.apply(); });
      this.listen(this.root.querySelector('[data-companion-disable]'), 'click', () => { this.disable(); this.avatar.focus(); });
      this.listen(this.root.querySelector('[data-companion-credits]'), 'click', () => {
        this.message('蓝女仆：Canvas2D 分层实现；作者与授权见资源说明。', true);
        if (this.manifest?.credits) { const link = document.createElement('a'); link.href = api.sameOrigin(this.manifest.credits); link.textContent = '查看作者与授权'; link.target = '_blank'; link.rel = 'noopener'; this.status.appendChild(link); }
      });
      this.listen(this.menu, 'keydown', event => {
        if (event.key === 'Escape') { event.preventDefault(); this.setMenu(false, true); }
        if (event.key === 'Tab') {
          const items = this.menuItems(); const first = items[0], last = items.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      });
      this.listen(document, 'pointerdown', event => { if (!this.root.contains(event.target)) this.setMenu(false); });
      this.listen(document, 'focusin', event => { if (!this.root.contains(event.target)) this.setMenu(false); });
      this.listen(document, 'visibilitychange', () => { if (document.hidden) this.voice.stop(); this.syncRendering(); });
      this.listen(document, 'pjax:send', () => { this.inNavigation = true; this.setMenu(false); this.voice.stop(); this.cancelLoading(); this.syncRendering(); });
      this.listen(document, 'pjax:success', () => { this.inNavigation = false; this.mount(); this.syncRendering(); this.schedule(); });
      this.listen(global, 'blog:music-state', event => {
        this.voice.syncMusic();
        if (event.detail?.playing && this.lastTrack !== event.detail.trackId) { this.lastTrack = event.detail.trackId; this.renderer?.motion('listening'); this.renderer?.expression('listening'); }
      });
      this.listen(global, 'resize', () => { this.apply(); this.renderer?.fit(); });
      this.listen(this.mobileQuery, 'change', () => { this.apply(); this.syncRendering(); this.schedule(); });
      this.listen(this.motionQuery, 'change', () => this.syncRendering());
      this.listen(global, 'pagehide', event => { if (event.persisted) { this.voice.stop(); this.renderer?.pause(); } else this.destroy(); });
      this.listen(global, 'pageshow', () => this.syncRendering());
      this.listen(this.avatar, 'pointerdown', event => {
        if (this.mobileQuery.matches || event.button !== 0) return;
        const rect = this.root.getBoundingClientRect(); this.drag = { id: event.pointerId, x: event.clientX, y: event.clientY, left: rect.left, top: rect.top, active: false };
        this.avatar.setPointerCapture(event.pointerId);
      });
      this.listen(this.avatar, 'pointermove', event => {
        const drag = this.drag;
        if (!drag) { if (this.renderer && !this.mobileQuery.matches) { const r = this.stage.getBoundingClientRect(); this.renderer.focus(Math.max(0, Math.min(r.width, event.clientX - r.left)), Math.max(0, Math.min(r.height, event.clientY - r.top))); } return; }
        const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
        if (Math.hypot(dx, dy) > 6) drag.active = true;
        if (drag.active) { event.preventDefault(); this.place(drag.left + dx, drag.top + dy); }
      });
      const end = event => {
        if (!this.drag || event.pointerId !== this.drag.id) return;
        if (this.drag.active) { const rect = this.root.getBoundingClientRect(); const x = rect.left + rect.width / 2 < global.innerWidth / 2 ? 12 : global.innerWidth - rect.width - 12; const pos = this.place(x, rect.top); this.preferences.update({ position: pos }); this.suppressClick = true; clearTimeout(this.dragTimer); this.dragTimer = setTimeout(() => { this.suppressClick = false; }, 350); }
        this.drag = null;
      };
      this.listen(this.avatar, 'pointerup', end); this.listen(this.avatar, 'pointercancel', end); this.listen(this.avatar, 'lostpointercapture', end);
    }
    mount() { if (!this.destroyed && !this.root.isConnected) document.body.appendChild(this.root); }
    isCollapsed() { return this.preferences.value.disabled || this.preferences.value.collapsed || (this.mobileQuery.matches && !this.mobileExpanded); }
    place(x, y) {
      const rect = this.root.getBoundingClientRect();
      const position = { x: Math.max(8, Math.min(x, global.innerWidth - rect.width - 8)), y: Math.max(8, Math.min(y, global.innerHeight - rect.height - 8)) };
      this.root.style.left = position.x + 'px'; this.root.style.top = position.y + 'px'; this.root.style.bottom = 'auto'; return position;
    }
    apply() {
      const collapsed = this.isCollapsed(); this.root.classList.toggle('is-collapsed', collapsed); this.root.classList.toggle('is-disabled', this.preferences.value.disabled);
      this.root.style.setProperty('--companion-size', (this.mobileQuery.matches ? Math.min(this.preferences.value.size, 230) : this.preferences.value.size) + 'px');
      this.avatar.setAttribute('aria-label', this.preferences.value.disabled ? '重新启用蓝女仆看板娘' : collapsed ? '打开蓝女仆看板娘' : '与蓝女仆看板娘互动');
      if (!this.mobileQuery.matches && this.preferences.value.position) this.place(this.preferences.value.position.x, this.preferences.value.position.y);
      else { this.root.style.left = ''; this.root.style.top = ''; this.root.style.bottom = ''; }
      this.syncControls();
    }
    syncControls() {
      if (!this.root) return;
      const muted = this.preferences.value.muted;
      this.root.querySelector('[data-companion-sound]').textContent = muted ? '开启声音' : '关闭声音';
      this.root.querySelector('[data-companion-sound]').setAttribute('aria-pressed', String(!muted));
      this.root.querySelector('[data-companion-volume]').value = String(this.preferences.value.volume);
      this.root.querySelectorAll('[data-size]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.size) === this.preferences.value.size)));
    }
    menuItems() { return [...this.menu.querySelectorAll('button,input,select')].filter(item => !item.closest('[hidden]')); }
    syncVoiceControls() {
      if (!this.root) return;
      const available = Object.values(this.manifest?.voices || {}).some(voice => typeof voice === 'string' && voice.length > 0);
      this.root.querySelector('[data-companion-voice-controls]').hidden = !available;
      const notice = this.root.querySelector('[data-companion-voice-notice]');
      notice.hidden = available;
      notice.textContent = this.manifest ? (this.manifest.voiceNotice || '看板娘语音尚未提供。') : '形象加载后检查语音资源。';
    }
    setMenu(open, restore = false) {
      this.menu.hidden = !open; this.more.setAttribute('aria-expanded', String(open));
      if (open) this.menuItems()[0]?.focus(); else if (restore) this.more.focus();
    }
    message(text, persistent = false) {
      clearTimeout(this.messageTimer); this.status.textContent = text; this.status.hidden = false;
      if (!persistent) this.messageTimer = setTimeout(() => { this.status.hidden = true; }, 6500);
    }
    schedule() {
      if (this.destroyed || this.state === 'ready' || this.state === 'loading' || this.state === 'error' || this.idleHandle != null) return;
      if (!api.shouldAutoLoad({ mobile: this.mobileQuery.matches, collapsed: this.isCollapsed(), disabled: this.preferences.value.disabled, reducedMotion: this.motionQuery.matches })) return;
      const load = () => { this.idleHandle = null; if (!this.destroyed && !document.hidden && !this.inNavigation && !this.isCollapsed()) this.load(); };
      this.idleHandle = global.requestIdleCallback ? global.requestIdleCallback(load, { timeout: 1800 }) : setTimeout(load, 1000);
    }
    cancelLoading() {
      if (this.request) { this.serial++; this.request.abort(); this.request = null; clearTimeout(this.loadTimer); if (this.state === 'loading') this.state = 'poster'; }
    }
    async load() {
      if (this.destroyed || this.state === 'loading') return;
      this.cancelLoading(); const serial = ++this.serial; const request = new AbortController(); this.request = request; this.state = 'loading'; this.message('正在加载形象…', true);
      const renderer = new api.Renderer(this.stage, error => { if (!this.destroyed && serial === this.serial) this.fail(error); });
      this.loadTimer = setTimeout(() => { if (serial === this.serial) { request.abort(); this.fail(new Error('Model loading timed out')); } }, 10000);
      try {
        const response = await global.fetch(api.sameOrigin(this.manifestURL), { signal: request.signal, cache: 'no-cache', credentials: 'omit' });
        if (!response.ok) throw new Error('Manifest request failed: ' + response.status);
        const manifest = await response.json();
        if (!manifest.id || !manifest.version) throw new Error('Invalid model manifest');
        for (const voice of Object.values(manifest.voices || {})) api.sameOrigin(voice);
        if (manifest.poster) api.sameOrigin(manifest.poster);
        await renderer.load(manifest, request.signal);
        if (this.destroyed || request.signal.aborted || serial !== this.serial) { renderer.destroy(); return; }
        this.renderer?.destroy(); this.renderer = renderer; this.manifest = manifest; this.syncVoiceControls();
        this.root.querySelector('img').src = manifest.poster || poster;
        this.state = 'ready'; this.root.classList.add('is-ready'); this.status.hidden = true; this.syncRendering();
      } catch (error) { renderer.destroy(); if (!this.destroyed && serial === this.serial && !request.signal.aborted) this.fail(error); }
      finally { if (serial === this.serial) { clearTimeout(this.loadTimer); this.request = null; } }
    }
    fail(error) {
      this.lastError = error; this.state = 'error'; this.root.classList.remove('is-ready'); this.renderer?.destroy(); this.renderer = null; this.voice.stop();
      this.message('形象未加载，可打开设置重试。当前显示静态看板娘图标。', true);
      console.warn('[Companion]', error.message);
    }
    syncRendering() { if (!this.renderer) return; if (document.hidden || this.inNavigation || this.isCollapsed()) this.renderer.pause(); else this.renderer.resume(this.motionQuery.matches); }
    expand(retry = false) {
      this.mobileExpanded = true; this.preferences.update({ collapsed: false, disabled: false }); this.apply();
      if (this.state === 'ready' && !retry) this.syncRendering(); else if (this.state !== 'loading') this.load();
    }
    collapse() { this.preferences.update({ collapsed: true }); this.mobileExpanded = false; this.cancelLoading(); this.voice.stop(); this.setMenu(false); this.apply(); this.syncRendering(); }
    disable() { this.collapse(); this.preferences.update({ disabled: true }); this.renderer?.destroy(); this.renderer = null; this.state = 'poster'; this.root.classList.remove('is-ready'); this.apply(); }
    destroy() {
      if (this.destroyed) return;
      this.destroyed = true; this.cancelLoading();
      if (global.cancelIdleCallback) global.cancelIdleCallback(this.idleHandle); else clearTimeout(this.idleHandle);
      for (const timer of [this.messageTimer, this.loadTimer, this.dragTimer]) clearTimeout(timer);
      this.voice.destroy(); this.renderer?.destroy(); this.disposers.forEach(dispose => dispose()); this.disposers = []; this.root.remove();
      if (global.__blogCompanion === this) global.__blogCompanion = null;
    }
  };
  api.bootstrap = options => {
    if (global.__blogCompanion && !global.__blogCompanion.destroyed) { global.__blogCompanion.mount(); return global.__blogCompanion; }
    return global.__blogCompanion = new api.Controller(options);
  };
})(window);
