(function (global) {
  'use strict';
  var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)');
  // The trigger itself hops and squashes; then the real panel grows out of the
  // trigger footprint. No extra overlay element is created.
  var HOP = 520, HOLD = 140, EXPAND = 380, FADE = 200, STAGGER = 16;

  function cancel(panel) {
    var run = panel && panel.__ctlBloomRun;
    if (!run) return;
    panel.__ctlBloomRun = null;
    run.animations.forEach(function (animation) { try { animation.cancel(); } catch (_) {} });
    clearTimeout(run.timer);
  }

  function bloom(trigger, panel, options) {
    if (!trigger || !panel || (reduce && reduce.matches)) return;
    var t = trigger.getBoundingClientRect();
    var p = panel.getBoundingClientRect();
    if (!t.width || !t.height || !p.width || !p.height) return;
    cancel(panel);

    var triggerStyle = global.getComputedStyle(trigger);
    var panelStyle = global.getComputedStyle(panel);
    var ink = triggerStyle.getPropertyValue('--ctl-ink').trim() || '#161514';
    var surface = panelStyle.backgroundColor;
    var triggerRadius = triggerStyle.borderTopLeftRadius || '50%';
    var panelRadius = panelStyle.borderTopLeftRadius || '24px';

    // Centre-to-centre FLIP: the panel starts exactly on top of the trigger.
    var dx = (t.left + t.width / 2) - (p.left + p.width / 2);
    var dy = (t.top + t.height / 2) - (p.top + p.height / 2);
    var sx = t.width / p.width;
    var sy = t.height / p.height;

    var animations = [];

    // 1. The real control hops: up, stretch, land with a squash, settle.
    animations.push(trigger.animate([
      { transform: 'translateY(0) scale(1, 1)', offset: 0 },
      { transform: 'translateY(-9px) scale(.97, 1.05)', offset: .12 },
      { transform: 'translateY(0) scale(1.08, .90)', offset: .26 },
      { transform: 'translateY(-4px) scale(.99, 1.03)', offset: .38 },
      { transform: 'translateY(0) scale(1.02, .98)', offset: .54 },
      { transform: 'translateY(0) scale(1, 1)', offset: .72 },
      { transform: 'translateY(0) scale(1, 1)', offset: 1 }
    ], { duration: HOP, easing: 'ease-in-out', fill: 'none' }));

    // 2. Keep the panel invisible during the hop, then reveal it exactly as its
    //    small ink block appears at the trigger footprint and starts to grow.
    animations.push(panel.animate([
      { opacity: 0 },
      { opacity: 1 }
    ], { duration: 40, delay: HOP + HOLD, fill: 'both' }));

    animations.push(panel.animate([
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')', borderRadius: triggerRadius, backgroundColor: ink, offset: 0 },
      { transform: 'translate(0, 0) scale(1, 1)', borderRadius: panelRadius, backgroundColor: surface, offset: 1 }
    ], {
      duration: EXPAND,
      delay: HOP + HOLD,
      easing: 'cubic-bezier(.2,.9,.3,1.06)',
      fill: 'forwards'
    }));

    // 3. Contents fade in only after the panel has mostly grown.
    var contentDelay = HOP + HOLD + EXPAND * .62;
    Array.prototype.forEach.call(panel.children, function (element, index) {
      animations.push(element.animate([
        { opacity: 0, transform: 'translateY(6px)' },
        { opacity: 1, transform: 'none' }
      ], {
        duration: FADE,
        delay: contentDelay + index * STAGGER,
        easing: 'cubic-bezier(.2,.9,.3,1.06)',
        fill: 'both'
      }));
    });

    var run = { animations: animations, timer: 0 };
    panel.__ctlBloomRun = run;
    run.timer = setTimeout(function () {
      if (panel.__ctlBloomRun !== run) return;
      panel.__ctlBloomRun = null;
      animations.forEach(function (animation) { try { animation.cancel(); } catch (_) {} });
    }, HOP + HOLD + EXPAND + panel.children.length * STAGGER + FADE + 80);
  }

  global.__ctlMotion = {
    bloom: bloom,
    cancel: cancel
  };
})(window);
