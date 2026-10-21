(function (global) {
  'use strict';
  const api = global.BlogCompanion = global.BlogCompanion || {};
  const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const ACTIONS = ['happy', 'wave', 'nod', 'tail'];
  function waveJoints(p) {
    const lift = smooth(p / .24) * (1 - smooth((p - .76) / .24));
    const elbow = smooth((p - .05) / .24) * (1 - smooth((p - .72) / .24));
    const swing = p > .30 && p < .72 ? Math.sin((p - .30) / .42 * Math.PI * 4) * Math.sin((p - .30) / .42 * Math.PI) : 0;
    const sway = smooth(p / .20) * (1 - smooth((p - .78) / .22));
    return { shoulder: -13 * lift, elbow: -116 * elbow, wrist: 12 * elbow + 9 * swing, head: 3.2 * Math.sin((p - .08) * Math.PI * 3) * sway, hair: -.65 * Math.sin((p - .12) * Math.PI * 3) * sway };
  }
  function happyJoints(p) {
    const lift = smooth(p / .24) * (1 - smooth((p - .80) / .20));
    return { shoulder: -13 * lift, elbow: -116 * lift, wrist: 8 * lift, head: -5 * lift, hair: .7 * lift };
  }
  function pivotTransform(rig, parent, pivot, angle = 0, sx = 1, sy = 1, dx = 0, dy = 0) {
    return parent.translate(pivot[0] * rig.width + dx, pivot[1] * rig.height + dy)
      .rotate(angle).scale(sx, sy)
      .translate(-pivot[0] * rig.width, -pivot[1] * rig.height);
  }
  const HEAD_IDS = new Set(['hair-left', 'hair-right', 'head', 'bangs', 'fin-left', 'fin-right', 'ahoge', 'eye-left', 'eye-right', 'iris-left', 'iris-right', 'mouth']);
  const REAR_IDS = new Set(['hair-left', 'hair-right']);
  api.RigRenderer = class {
    constructor(host, onFailure) {
      this.host = host; this.onFailure = onFailure;
      this.rig = null; this.images = new Map(); this.seams = new Map();
      this.canvas = null; this.ctx = null; this.headBack = null; this.headFront = null;
      this.frame = 0; this.paused = true; this.reduced = false;
      this.time = 0; this.lastFrame = 0; this.blinkAt = -10; this.nextBlink = 3;
      this.action = null; this.actionAt = 0; this.lastAction = null; this.cooldownUntil = 0;
      this.look = [0, 0]; this.target = [0, 0];
      this.destroyed = false; this.serial = 0;
    }
    async load(manifest, signal) {
      const serial = ++this.serial;
      const valid = () => !this.destroyed && serial === this.serial && !signal.aborted;
      const base = manifest.base || '/';
      const rigURL = api.sameOrigin(manifest.rig || new URL('rig.json', new URL(base, global.location.href)).href);
      const response = await global.fetch(rigURL, { signal, credentials: 'omit', cache: 'no-cache' });
      if (!response.ok) throw new Error('Rig request failed: ' + response.status);
      const rig = await response.json();
      if (!rig.layers || !rig.layers.length) throw new Error('Invalid rig');
      if (!valid()) throw new Error('Cancelled');
      const loadImage = url => new Promise((resolve, reject) => {
        const image = new global.Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Layer failed: ' + url));
        image.src = url;
      });
      const resolveFile = file => api.sameOrigin(new URL(file, rigURL).href);
      const layers = rig.layers.map(layer => loadImage(resolveFile(layer.file)).then(image => [layer.id, image]));
      const seams = (rig.seams || []).map(seam => loadImage(resolveFile(seam.file)).then(image => [seam.id, image]));
      const extra = ['wave-backing.png', 'hand-peace-chibi.png', 'elbow-underlay.png',
        'underlay-shoulder-left.png', 'underlay-shoulder-right.png', 'arm-texture.png'
      ].map(file => loadImage(resolveFile('layers/' + file)));
      const results = await Promise.all([...layers, ...seams, ...extra]);
      if (!valid()) throw new Error('Cancelled');
      this.rig = rig;
      this.images = new Map(rig.layers.map((layer, index) => [layer.id, results[index][1]]));
      this.seams = new Map((rig.seams || []).map((seam, index) => [seam.id, results[rig.layers.length + index][1]]));
      const baseIndex = rig.layers.length + (rig.seams || []).length;
      this.waveBacking = results[baseIndex];
      this.peaceHand = results[baseIndex + 1];
      this.elbowUnderlay = results[baseIndex + 2];
      this.underlayShoulderLeft = results[baseIndex + 3];
      this.underlayShoulderRight = results[baseIndex + 4];
      this.armTexture = results[baseIndex + 5];
      this.armMesh = this.buildArmMesh();
      const canvas = document.createElement('canvas');
      canvas.width = 880; canvas.height = 880;
      canvas.style.cssText = 'width:100%;height:100%;display:block';
      canvas.setAttribute('aria-hidden', 'true');
      this.canvas = canvas; this.ctx = canvas.getContext('2d');
      this.headBack = document.createElement('canvas'); this.headBack.width = 880; this.headBack.height = 880;
      this.headFront = document.createElement('canvas'); this.headFront.width = 880; this.headFront.height = 880;
      this.host.appendChild(canvas);
      this.manifest = manifest;
      this.draw(0);
    }
    schedule() {
      if (this.destroyed || this.paused || this.reduced || this.frame) return;
      if (this.host.ownerDocument?.hidden) return;
      this.frame = global.requestAnimationFrame(now => this.draw(now));
    }
    draw(now) {
      this.frame = 0;
      if (this.destroyed || !this.rig) return;
      if (this.reduced) { this.render(0, 0, null, 0, [0, 0], 1, 1); return; }
      if (this.lastFrame && now - this.lastFrame < 30) { this.schedule(); return; }
      const dt = this.lastFrame ? Math.min((now - this.lastFrame) / 1000, .05) : 0;
      this.lastFrame = now; this.time += dt;
      if (this.time >= this.nextBlink) { this.blinkAt = this.time; this.nextBlink = this.time + 3.2 + Math.random() * 2.4; }
      this.look = this.look.map((value, index) => value + (this.target[index] - value) * .12);
      const elapsed = (now - this.actionAt) / 1000;
      const duration = this.rig.actions?.[this.action]?.seconds || 1;
      const phase = Math.min(1, elapsed / duration);
      if (elapsed > duration) this.action = null;
      const response = this.action ? Math.sin(Math.PI * phase) : 0;
      let blink = Math.max(0, 1 - Math.abs((this.time - this.blinkAt - .10) / .10));
      let blinkLeft = blink, blinkRight = blink;
      if (this.action === 'happy') {
        const wink = smooth((phase - .12) / .12) * (1 - smooth((phase - .68) / .16));
        blinkLeft = .5 * wink; blinkRight = wink;
      }
      const openLeft = Math.max(.025, 1 - blinkLeft), openRight = Math.max(.025, 1 - blinkRight);
      this.render(this.time, response, this.action, phase, this.look, openLeft, openRight);
      this.schedule();
    }
    render(time, response, action, phase, look, openLeft = 1, openRight = 1) {
      const rig = this.rig;
      const width = 880, height = 880;
      const projection = global.CompanionHeadProjection;
      const pitch = action === 'nod' && projection ? .20 * smooth(phase / .38) * (1 - smooth((phase - .5) / .5)) : 0;
      const scale = Math.min(width / rig.width, height / rig.height) * .91;
      const base = new global.DOMMatrix().translate(width / 2, height / 2).scale(scale).translate(-rig.width / 2, -rig.height / 2);
      const root = new global.DOMMatrix();
      const torso = root.translate(0, -Math.sin(time * 1.7) * 1.7);
      const waving = action === 'happy' || action === 'wave';
      const wave = action === 'happy' ? happyJoints(phase) : action === 'wave' ? waveJoints(phase) : { shoulder: 0, elbow: 0, wrist: 0, head: 0, hair: 0 };
      const headAngle = Math.sin(time * 1.1) * .35 + (waving || pitch ? 0 : look[0] * .7) + wave.head;
      const head = pivotTransform(rig, torso, rig.groups.headGroup.pivot, headAngle, 1, 1, waving || pitch ? 0 : look[0] * 1.4, waving || pitch ? 0 : look[1] * .7);
      const armL = pivotTransform(rig, torso, rig.groups.armLeftGroup.pivot, -.35 * Math.sin(time * 1.7));
      const armR = pivotTransform(rig, torso, rig.groups.armRightGroup.pivot, .35 * Math.sin(time * 1.7) + wave.shoulder);
      const forearmR = pivotTransform(rig, armR, rig.groups.forearmRightGroup.pivot, wave.elbow);
      const groups = {
        root, torso, headGroup: head, armLeftGroup: armL, armRightGroup: armR,
        forearmRightGroup: forearmR, handLeftGroup: pivotTransform(rig, armL, rig.groups.handLeftGroup.pivot, 0),
        handRightGroup: pivotTransform(rig, forearmR, rig.groups.handRightGroup.pivot, wave.wrist),
        eyeLeftGroup: pivotTransform(rig, head, rig.groups.eyeLeftGroup.pivot, 0, 1, openLeft),
        eyeRightGroup: pivotTransform(rig, head, rig.groups.eyeRightGroup.pivot, 0, 1, openRight)
      };
      const transforms = new Map();
      const duration = rig.actions?.[action]?.seconds || 1;
      for (const layer of rig.layers) {
        let angle = 0, dx = 0, dy = 0, sy = 1;
        if (layer.id === 'tail') { angle = Math.sin(time * 1.5) * 1.1 + (action === 'tail' ? Math.sin(phase * duration * 8) * 3.5 * response : 0); }
        if (layer.id.startsWith('hair-')) angle = Math.sin(time * 1.6 + (layer.id === 'hair-left' ? 0 : .7)) * .55 + wave.hair;
        if (layer.id.startsWith('fin-')) angle = Math.sin(time * 1.8) * .45;
        if (layer.id === 'ahoge') angle = Math.sin(time * 2) * 1.1;
        if (layer.id === 'bangs') angle = Math.sin(time * 1.4) * .12;
        if (layer.id === 'skirt') angle = Math.sin(time * 1.7) * .12;
        if (layer.id.startsWith('iris-')) { dx = look[0] * 2.0; dy = look[1] * 1.1; }
        if (layer.id === 'mouth' && action === 'happy') sy = 1 + .08 * response;
        transforms.set(layer.id, pivotTransform(rig, groups[layer.parent], layer.pivot, angle, 1, sy, dx, dy));
      }
      const mainCtx = this.ctx, backCtx = this.headBack.getContext('2d'), frontCtx = this.headFront.getContext('2d');
      const canvases = [mainCtx, backCtx, frontCtx];
      for (const target of canvases) { target.setTransform(1, 0, 0, 1, 0, 0); target.clearRect(0, 0, width, height); }
      let ctx = mainCtx;
      const set = (matrix, id) => {
        ctx = pitch && HEAD_IDS.has(id) ? (REAR_IDS.has(id) ? backCtx : frontCtx) : mainCtx;
        const m = base.multiply(matrix); ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
      };
      const imageAt = (image, bounds) => ctx.drawImage(image, bounds[0], bounds[1], bounds[2] - bounds[0], bounds[3] - bounds[1]);
      const layerById = id => rig.layers.find(layer => layer.id === id);
      const trace = shape => {
        ctx.beginPath();
        if (shape.ellipse) { const e = shape.ellipse; ctx.ellipse(e[0] * rig.width, e[1] * rig.height, e[2] * rig.width, e[3] * rig.height, 0, 0, Math.PI * 2); }
        else { shape.polygon.forEach(([x, y], index) => index ? ctx.lineTo(x * rig.width, y * rig.height) : ctx.moveTo(x * rig.width, y * rig.height)); ctx.closePath(); }
      };
      const neck = rig.groups.headGroup.pivot.map((value, index) => value * (index ? rig.height : rig.width));
      let backFlushed = false, frontFlushed = false;
      const flushBack = () => { if (!pitch || backFlushed) return; projection.paint(mainCtx, this.headBack, pitch, base.multiply(torso), neck); backFlushed = true; };
      const lids = () => {
        set(head, 'head'); ctx.strokeStyle = '#392c42'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        for (const [x, amount] of [[.397, 1 - openLeft], [.547, 1 - openRight]]) {
          if (amount <= .8) continue;
          ctx.beginPath(); ctx.moveTo((x - .033) * rig.width, .407 * rig.height);
          ctx.quadraticCurveTo(x * rig.width, .416 * rig.height, (x + .033) * rig.width, .407 * rig.height); ctx.stroke();
        }
      };
      const flushFront = () => { if (!pitch || frontFlushed) return; lids(); projection.paint(mainCtx, this.headFront, pitch, base.multiply(torso), neck); frontFlushed = true; };
      const armParts = ['arm-right', 'forearm-right', 'hand-right'];
      const order = ['hair-left', 'hair-right', 'leg-left', 'leg-right', 'body', 'skirt', 'arm-left', 'arm-right', 'hand-left', 'head', 'bangs', 'fin-left', 'fin-right', 'ahoge', 'eye-left', 'eye-right', 'iris-left', 'iris-right', 'mouth'];
      order.splice(order.indexOf('hand-right'), 1);
      order.push('forearm-right', 'hand-right');
      // The tail is the deepest moving layer. Its seam moves with it, then the
      // approved rear-hair cleanplate is projected with hair-right above it.
      const tailLayer = layerById('tail');
      const tailSeam = (rig.seams || []).find(seam => seam.id === 'tail');
      set(transforms.get('tail'), 'tail');
      if (tailSeam) imageAt(this.seams.get('tail'), tailSeam.bounds);
      imageAt(this.images.get('tail'), tailLayer.bounds);
      set(transforms.get('hair-right'), 'hair-right');
      if (this.waveBacking) ctx.drawImage(this.waveBacking, 0, 0, rig.width, rig.height);
      this.drawNeckBacking(mainCtx, base, torso, neck);
      set(torso, 'underlay-shoulders');
      for (const underlay of [this.underlayShoulderLeft, this.underlayShoulderRight]) {
        if (underlay) ctx.drawImage(underlay, 0, 0, rig.width, rig.height);
      }
      for (const seam of rig.seams || []) {
        if (seam.id === 'head' && waving) {
          set(transforms.get('head'), 'head');
          const image = this.seams.get('head'), w = seam.bounds[2] - seam.bounds[0], h = seam.bounds[3] - seam.bounds[1];
          const sourceW = image.width || w, sourceH = image.height || h;
          // head-seam.png contains a two-pixel horizontal strip at the neck.
          // Head rotation exposes it as a pale crack, so preserve both image
          // sections while omitting only that strip.
          const stripTop = 597, stripBottom = 599;
          const topHeight = stripTop / sourceH * h;
          const bottomY = stripBottom / sourceH * h;
          ctx.drawImage(image, 0, 0, sourceW, stripTop,
            seam.bounds[0], seam.bounds[1], w, topHeight);
          ctx.drawImage(image, 0, stripBottom, sourceW, sourceH - stripBottom,
            seam.bounds[0], seam.bounds[1] + bottomY, w, h - bottomY);
          continue;
        }
        if (seam.id === 'tail' || (waving && seam.id === 'body') || armParts.includes(seam.id) || seam.id.startsWith('iris-') || seam.id.startsWith('eye-') || seam.id === 'mouth') continue;
        set(transforms.get(seam.id), seam.id); imageAt(this.seams.get(seam.id), seam.bounds);
      }
      set(head, 'head');
      for (const id of ['eye-left', 'eye-right', 'mouth']) { trace(layerById(id).shape); ctx.fillStyle = '#ffefea'; ctx.fill(); }
      for (const id of order) {
        if (id === 'leg-left') flushBack();
        if (id === 'forearm-right') flushFront();
        if (id === 'arm-right') {
          this.drawArmMesh(base, torso, .35 * Math.sin(time * 1.7) + wave.shoulder, wave.elbow, wave.wrist);
          continue;
        }
        if (id === 'forearm-right' || id === 'hand-right') continue;
        const layer = layerById(id);
        set(transforms.get(id), id);
        if (!waving && armParts.includes(id)) {
          const seam = (rig.seams || []).find(s => s.id === id);
          if (seam) imageAt(this.seams.get(id), seam.bounds);
        }
        if (id.startsWith('eye-')) { ctx.fillStyle = '#fdfbff'; trace(layerById('iris-' + id.split('-')[1]).shape); ctx.fill(); }
        ctx.save();
        if (id.startsWith('iris-')) { trace(layerById('eye-' + id.split('-')[1]).shape); ctx.clip(); }
        if (id === 'hand-right' && action === 'happy' && phase > .20 && phase < .85) {
          ctx.translate(851, 871); ctx.rotate(135 * Math.PI / 180); ctx.scale(-1, 1); ctx.drawImage(this.peaceHand, -29, -66, 58, 70);
        } else imageAt(this.images.get(id), layer.bounds);
        ctx.restore();
        if (id === 'body') this.drawNeckCover(mainCtx, base, torso, neck);
      }
      flushBack(); flushFront();
      if (!pitch) lids();
    }
    drawNeckBacking(ctx, base, torso, neck) {
      const m = base.multiply(torso), x = neck[0], y = neck[1];
      ctx.save();
      ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
      // A torso-space backing follows the shoulders while the head rotates,
      // covering the cleanplate cut edge before the rear hair and body.
      ctx.fillStyle = '#31477f';
      ctx.beginPath();
      ctx.moveTo(x - 220, y - 45);
      ctx.quadraticCurveTo(x, y + 10, x + 220, y - 45);
      ctx.lineTo(x + 220, y + 32);
      ctx.quadraticCurveTo(x, y + 48, x - 220, y + 32);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    drawNeckCover(ctx, base, torso, neck) {
      const m = base.multiply(torso), x = neck[0], y = neck[1];
      ctx.save();
      ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
      // Cover the small central cut left in the static body asset. The narrow
      // V stays behind the head and reads as the neck shadow during rotation.
      if (typeof ctx.createLinearGradient === 'function') {
        const shade = ctx.createLinearGradient(x, y - 24, x, y + 5);
        shade.addColorStop(0, '#405b92');
        shade.addColorStop(.55, '#324779');
        shade.addColorStop(1, '#24345d');
        ctx.fillStyle = shade;
      } else ctx.fillStyle = '#324779';
      ctx.beginPath();
      ctx.moveTo(x - 62, y - 19);
      ctx.quadraticCurveTo(x, y - 25, x + 62, y - 19);
      ctx.lineTo(x + 10, y + 1);
      ctx.quadraticCurveTo(x, y + 5, x - 10, y + 1);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
    buildArmMesh() {
      const rig = this.rig, tex = this.armTexture;
      if (!rig || !tex) return null;
      const box = [695, 630, 955, 950];
      const S = [rig.groups.armRightGroup.pivot[0] * rig.width, rig.groups.armRightGroup.pivot[1] * rig.height];
      const E = [rig.groups.forearmRightGroup.pivot[0] * rig.width, rig.groups.forearmRightGroup.pivot[1] * rig.height];
      const H = [rig.groups.handRightGroup.pivot[0] * rig.width, rig.groups.handRightGroup.pivot[1] * rig.height];
      const len1 = Math.hypot(E[0] - S[0], E[1] - S[1]);
      const len2 = Math.hypot(H[0] - E[0], H[1] - E[1]);
      const sE = len1, sH = len1 + len2;
      const smooth01 = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
      const arc = p => {
        const t1 = Math.max(0, Math.min(1, ((p[0] - S[0]) * (E[0] - S[0]) + (p[1] - S[1]) * (E[1] - S[1])) / (len1 * len1)));
        const q1 = [S[0] + t1 * (E[0] - S[0]), S[1] + t1 * (E[1] - S[1])];
        const d1 = Math.hypot(p[0] - q1[0], p[1] - q1[1]);
        const t2 = Math.max(0, Math.min(1, ((p[0] - E[0]) * (H[0] - E[0]) + (p[1] - E[1]) * (H[1] - E[1])) / (len2 * len2)));
        const q2 = [E[0] + t2 * (H[0] - E[0]), E[1] + t2 * (H[1] - E[1])];
        const d2 = Math.hypot(p[0] - q2[0], p[1] - q2[1]);
        return d1 <= d2 ? t1 * len1 : len1 + t2 * len2;
      };
      const cols = 8, rows = 10;
      const texW = tex.width, texH = tex.height;
      // downsample the texture alpha once to skip empty cells (browser only)
      let pa = null;
      if (global.document && global.document.createElement) {
        const probe = global.document.createElement('canvas');
        probe.width = cols; probe.height = rows;
        const pctx = probe.getContext('2d');
        pctx.drawImage(tex, 0, 0, cols, rows);
        pa = pctx.getImageData(0, 0, cols, rows).data;
      }
      const verts = [], uv = [];
      for (let j = 0; j <= rows; j++) for (let i = 0; i <= cols; i++) {
        const u = i / cols * texW, v = j / rows * texH;
        const p = [box[0] + u, box[1] + v];
        const s = arc(p);
        let wf = smooth01((s - sE + 26) / 52);
        let wh = smooth01((s - sH + 14) / 28);
        let wu = 1 - wf - wh;
        if (wu < 0) { const k = wf + wh; wf /= k; wh /= k; wu = 0; }
        verts.push({ p, wu, wf, wh });
        uv.push([u, v]);
      }
      const tris = [];
      for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
        if (pa) {
          const a = pa[(j * cols + i) * 4 + 3], b = pa[(j * cols + i + 1) * 4 + 3];
          const c = pa[((j + 1) * cols + i) * 4 + 3], d = pa[((j + 1) * cols + i + 1) * 4 + 3];
          if (Math.max(a, b, c, d) < 6) continue;
        }
        const i00 = j * (cols + 1) + i, i10 = i00 + 1, i01 = i00 + cols + 1, i11 = i01 + 1;
        tris.push([i00, i10, i11], [i00, i11, i01]);
      }
      return { S, E, H, verts, uv, tris };
    }
    drawArmMesh(base, torso, a, e, w) {
      const mesh = this.armMesh;
      if (!mesh) return;
      const ctx = this.ctx, M0 = base.multiply(torso);
      const rot = (p, pivot, ang) => {
        const rad = ang * Math.PI / 180;
        const c = Math.cos(rad), s = Math.sin(rad);
        const dx = p[0] - pivot[0], dy = p[1] - pivot[1];
        return [pivot[0] + c * dx - s * dy, pivot[1] + s * dx + c * dy];
      };
      const dest = mesh.verts.map(vr => {
        const pu = rot(vr.p, mesh.S, a);
        const pf = rot(rot(vr.p, mesh.E, e), mesh.S, a);
        const ph = rot(rot(rot(vr.p, mesh.H, w), mesh.E, e), mesh.S, a);
        return [
          vr.wu * pu[0] + vr.wf * pf[0] + vr.wh * ph[0],
          vr.wu * pu[1] + vr.wf * pf[1] + vr.wh * ph[1]
        ];
      });
      for (const tri of mesh.tris) {
        const s0 = mesh.uv[tri[0]], s1 = mesh.uv[tri[1]], s2 = mesh.uv[tri[2]];
        const d0 = dest[tri[0]], d1 = dest[tri[1]], d2 = dest[tri[2]];
        const den = (s1[0] - s0[0]) * (s2[1] - s0[1]) - (s2[0] - s0[0]) * (s1[1] - s0[1]);
        if (Math.abs(den) < 1e-6) continue;
        const A = (d1[0] - d0[0]) * (s2[1] - s0[1]) - (d2[0] - d0[0]) * (s1[1] - s0[1]);
        const C = (d2[0] - d0[0]) * (s1[0] - s0[0]) - (d1[0] - d0[0]) * (s2[0] - s0[0]);
        const B = (d1[1] - d0[1]) * (s2[1] - s0[1]) - (d2[1] - d0[1]) * (s1[1] - s0[1]);
        const D = (d2[1] - d0[1]) * (s1[0] - s0[0]) - (d1[1] - d0[1]) * (s2[0] - s0[0]);
        const m = M0.multiply(new global.DOMMatrix([
          A / den, B / den, C / den, D / den,
          d0[0] - (A / den) * s0[0] - (C / den) * s0[1],
          d0[1] - (B / den) * s0[0] - (D / den) * s0[1]
        ]));
        const cx = (d0[0] + d1[0] + d2[0]) / 3, cy = (d0[1] + d1[1] + d2[1]) / 3;
        const k = 1.035;
        ctx.save();
        ctx.setTransform(M0.a, M0.b, M0.c, M0.d, M0.e, M0.f);
        ctx.beginPath();
        ctx.moveTo(cx + (d0[0] - cx) * k, cy + (d0[1] - cy) * k);
        ctx.lineTo(cx + (d1[0] - cx) * k, cy + (d1[1] - cy) * k);
        ctx.lineTo(cx + (d2[0] - cx) * k, cy + (d2[1] - cy) * k);
        ctx.closePath();
        ctx.clip();
        ctx.setTransform(m.a, m.b, m.c, m.d, m.e, m.f);
        ctx.drawImage(this.armTexture, 0, 0);
        ctx.restore();
      }
    }
    fit() { /* CSS keeps the square canvas inside the stage. */ }
    motion(id) {
      if (this.paused || this.reduced) return;
      if (id !== 'tap') return;
      const now = global.performance.now();
      if (now < this.cooldownUntil) return;
      const pool = ACTIONS.filter(name => name !== this.lastAction);
      const next = pool[Math.floor(Math.random() * pool.length)];
      this.lastAction = next; this.action = next; this.actionAt = now; this.cooldownUntil = now + 3000;
      this.schedule();
    }
    expression() {}
    focus(x, y) {
      const size = this.host.clientHeight || 270;
      this.target = [Math.max(-1, Math.min(1, (x / size) * 2 - 1)), Math.max(-1, Math.min(1, (y / size) * 2 - 1))];
    }
    pause() { this.paused = true; if (this.frame) { global.cancelAnimationFrame(this.frame); this.frame = 0; } }
    resume(reducedMotion = false) {
      this.reduced = reducedMotion; this.paused = false; this.lastFrame = 0;
      if (reducedMotion) { this.render(0, 0, null, 0, [0, 0], 1, 1); return; }
      this.schedule();
    }
    destroy() {
      this.serial++; this.pause(); this.destroyed = true;
      if (this.canvas) this.canvas.remove();
      this.canvas = null; this.ctx = null; this.headBack = null; this.headFront = null;
      this.images.clear(); this.seams.clear(); this.rig = null;
    }
  };
})(window);
