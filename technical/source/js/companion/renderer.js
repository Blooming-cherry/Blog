(function (global) {
  'use strict';
  const api = global.BlogCompanion = global.BlogCompanion || {};
  const scripts = new Map();
  function loadScript(source) {
    const url = api.sameOrigin(source);
    if (!scripts.has(url)) scripts.set(url, new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = url;
      const timer = setTimeout(() => { script.remove(); scripts.delete(url); reject(new Error('Renderer dependency timed out')); }, 10000);
      script.onload = () => { clearTimeout(timer); resolve(); };
      script.onerror = () => { clearTimeout(timer); script.remove(); scripts.delete(url); reject(new Error('Renderer dependency failed')); };
      document.head.appendChild(script);
    }));
    return scripts.get(url);
  }
  function checkFiles(value, base) {
    if (typeof value === 'string') api.sameOrigin(new URL(value, base).href);
    else if (Array.isArray(value)) value.forEach(entry => checkFiles(entry, base));
    else if (value && typeof value === 'object') {
      for (const [name, entry] of Object.entries(value)) {
        if (['File', 'Moc', 'Physics', 'Pose', 'DisplayInfo', 'Textures'].includes(name)) checkFiles(entry, base);
        else if (entry && typeof entry === 'object') checkFiles(entry, base);
        if (name === 'Sound' || name === 'sound') delete value[name];
      }
    }
  }
  api.Renderer = class {
    constructor(host, onFailure) { this.host = host; this.onFailure = onFailure; this.serial = 0; this.app = null; this.model = null; this.paused = true; this.reducedMotion = false; this.userUntil = 0; }
    async load(manifest, signal) {
      const serial = ++this.serial;
      const valid = () => serial === this.serial && !signal.aborted;
      const engine = manifest.renderer;
      if (!engine || engine.id !== 'pixi-cubism4' || engine.pixiVersion !== '6.5.10' || engine.adapterVersion !== '0.4.0') throw new Error('Unsupported companion renderer');
      for (const path of [engine.pixi, engine.core, engine.adapter]) { if (!valid()) throw new Error('Cancelled'); await loadScript(path); }
      if (!valid()) throw new Error('Cancelled');
      if (!global.PIXI || global.PIXI.VERSION !== engine.pixiVersion || !global.PIXI.live2d?.Live2DModel) throw new Error('Renderer version mismatch');
      const url = api.sameOrigin(manifest.model);
      const response = await global.fetch(url, { signal, credentials: 'omit' });
      if (!response.ok) throw new Error('Model request failed: ' + response.status);
      const source = await response.json();
      if (source.Version !== 3 || !source.FileReferences?.Moc) throw new Error('A real Cubism model is required');
      checkFiles(source.FileReferences, url); source.url = url;
      const size = this.host.clientHeight || 270;
      const app = new global.PIXI.Application({ width: size, height: size, backgroundAlpha: 0, antialias: true, autoStart: false, resolution: Math.min(global.devicePixelRatio || 1, 1.5), autoDensity: true });
      app.ticker.maxFPS = 30;
      let model;
      try {
        model = await global.PIXI.live2d.Live2DModel.from(source, { autoUpdate: false, autoInteract: false, motionPreload: 'IDLE' });
        if (!valid()) throw new Error('Cancelled');
        this.app = app; this.model = model; this.manifest = manifest;
        app.stage.addChild(model);
        this.fit();
        app.view.setAttribute('aria-hidden', 'true'); app.view.style.pointerEvents = 'none';
        app.view.addEventListener('webglcontextlost', this.contextLost = event => { event.preventDefault(); this.destroy(); if (this.onFailure) this.onFailure(new Error('WebGL context lost')); });
        this.host.appendChild(app.view);
        app.ticker.add(() => { if (this.model) this.model.update(Math.min(app.ticker.deltaMS, 50)); });
        app.renderer.render(app.stage);
      } catch (error) { if (model) model.destroy(); app.destroy(true, { children: true }); throw error; }
    }
    fit() {
      if (!this.app || !this.model) return;
      const size = this.host.clientHeight || 270;
      this.app.renderer.resize(size, size);
      this.model.scale.set(1);
      this.model.scale.set(Math.min(size / this.model.width, size / this.model.height) * (this.manifest.scale || 0.95));
      this.model.anchor.set(0.5, 0.5); this.model.position.set(size / 2, size / 2);
      this.app.renderer.render(this.app.stage);
    }
    motion(id, user = false) {
      if (!this.model || this.paused || this.reducedMotion || (!user && Date.now() < this.userUntil)) return;
      const motion = this.manifest.motions?.[id] || this.manifest.motions?.idle;
      if (!motion) return;
      if (user) this.userUntil = Date.now() + 5000;
      Promise.resolve(this.model.motion(motion.group, motion.index || 0, user ? 3 : 1)).catch(error => { if (this.onFailure) this.onFailure(error); });
    }
    expression(id) {
      if (!this.model || this.reducedMotion) return;
      const expression = this.manifest.expressions?.[id];
      if (expression) Promise.resolve(this.model.expression(expression)).catch(() => {});
    }
    focus(x, y) { if (this.model && !this.paused && !this.reducedMotion) this.model.focus(x, y); }
    pause() { this.paused = true; if (this.app) this.app.stop(); }
    resume(reducedMotion = false) {
      this.reducedMotion = reducedMotion; this.paused = false;
      if (!this.app) return;
      if (reducedMotion) { this.app.stop(); this.app.renderer.render(this.app.stage); }
      else { this.app.ticker.lastTime = performance.now(); this.app.start(); }
    }
    destroy() {
      this.serial++; this.pause();
      if (this.app) {
        this.app.view.removeEventListener('webglcontextlost', this.contextLost);
        this.app.destroy(true, { children: true, texture: true, baseTexture: true });
      }
      this.app = null; this.model = null;
    }
  };
})(window);
