(function (global) {
  'use strict';
  var reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)');
  // Beat in place, then grow into the panel, then let the panel materialise.
  var PULSE = 260, EXPAND = 320, FADE = 160, STAGGER = 16;

  function stop(panel) {
    var run = panel && panel.__ctlBloomRun;
    if (!run) return;
    panel.__ctlBloomRun = null;
    run.animations.forEach(function (animation) { try { animation.cancel(); } catch (_) {} });
    if (run.shell && run.shell.parentNode) run.shell.parentNode.removeChild(run.shell);
    clearTimeout(run.timer);
  }

  function bloom(trigger, panel, options) {
    if (!trigger || !panel || (reduce && reduce.matches)) return;
    var opts = options || {};
    var t = trigger.getBoundingClientRect();
    var p = panel.getBoundingClientRect();
    if (!t.width || !t.height || !p.width || !p.height) return;
    stop(panel);

    var triggerRadius = global.getComputedStyle(trigger).borderTopLeftRadius || '50%';
    var panelRadius = global.getComputedStyle(panel).borderTopLeftRadius || '24px';
    var animations = [];

    // A single ink block lives at the trigger's exact footprint for the whole
    // animation. Its background never changes colour: it is the button itself
    // that appears to turn ink, beat in place, then grow into the panel.
    var shell = document.createElement('div');
    shell.className = 'ctl-bloom';
    shell.setAttribute('aria-hidden', 'true');
    shell.style.cssText = 'position:fixed;pointer-events:none;box-sizing:border-box;'
      + 'border-radius:' + triggerRadius + ';background:var(--ctl-ink);'
      + 'left:' + t.left + 'px;top:' + t.top + 'px;width:' + t.width + 'px;height:' + t.height + 'px;'
      + 'z-index:' + (opts.zIndex == null ? 0 : opts.zIndex) + ';';
    panel.parentNode.insertBefore(shell, panel);

    // 1. Spring beat, in place, around the control's own centre. Per-keyframe
    //    easing keeps the three beats spread across the whole pulse instead of
    //    letting a global overshoot curve collapse them into the first frames.
    animations.push(shell.animate([
      { transform: 'scale(1)', easing: 'cubic-bezier(.4,0,.6,1)' },
      { transform: 'scale(.94)', offset: .22, easing: 'ease-out' },
      { transform: 'scale(1.06)', offset: .55, easing: 'ease-in-out' },
      { transform: 'scale(1)' }
    ], { duration: PULSE }));

    // 2. Continuous expansion to the panel rect. Centre-to-centre translate
    //    keeps the scale origin (50% 50%) aligned, so the final rect matches
    //    the panel exactly and the radius flows trigger radius -> panel radius.
    var dx = (p.left + p.width / 2) - (t.left + t.width / 2);
    var dy = (p.top + p.height / 2) - (t.top + t.height / 2);
    var sx = p.width / t.width, sy = p.height / t.height;
    animations.push(shell.animate([
      { transform: 'translate(0,0) scale(1,1)', borderRadius: triggerRadius },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')', borderRadius: panelRadius }
    ], { duration: EXPAND, delay: PULSE, easing: 'cubic-bezier(.22,1.18,.36,1)', fill: 'forwards' }));

    // 3. The surface panel stays invisible while the ink block grows, then
    //    crossfades in exactly when the block has landed.
    var total = PULSE + EXPAND + FADE;
    var panelFade = panel.animate([
      { opacity: 0, offset: 0 },
      { opacity: 0, offset: (PULSE + EXPAND) / total, easing: 'ease-out' },
      { opacity: 1, offset: 1 }
    ], { duration: total, fill: 'both' });
    animations.push(panelFade);

    // 4. Contents stagger in only after the expansion has finished.
    Array.prototype.forEach.call(panel.children, function (element, index) {
      animations.push(element.animate([
        { opacity: 0, transform: 'translateY(5px)' },
        { opacity: 1, transform: 'none' }
      ], {
        duration: FADE,
        delay: PULSE + EXPAND + index * STAGGER,
        easing: 'cubic-bezier(.22,1.18,.36,1)',
        fill: 'both'
      }));
    });

    var run = { shell: shell, animations: animations, timer: 0 };
    panel.__ctlBloomRun = run;
    panelFade.onfinish = function () {
      if (panel.__ctlBloomRun !== run) return;
      if (shell.parentNode) shell.parentNode.removeChild(shell);
      run.shell = null;
      // Cancel fill-mode animations once the last staggered child has landed,
      // leaving every element at its natural CSS values.
      run.timer = setTimeout(function () {
        if (panel.__ctlBloomRun !== run) return;
        panel.__ctlBloomRun = null;
        animations.forEach(function (animation) { try { animation.cancel(); } catch (_) {} });
      }, panel.children.length * STAGGER + 60);
    };
  }

  global.__ctlMotion = {
    bloom: bloom,
    cancel: function (panel) { stop(panel); }
  };
})(window);
