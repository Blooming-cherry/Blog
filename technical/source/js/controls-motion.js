(function (global) {
  'use strict';
  const reduce = global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)');
  function bloom(trigger, panel, options) {
    if (!trigger || !panel || (reduce && reduce.matches)) return;
    const opts = options || {};
    const t = trigger.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    if (!t.width || !t.height || !p.width || !p.height) return;
    trigger.animate([
      { transform: 'scale(1)' },
      { transform: 'scale(.92)' },
      { transform: 'scale(1.06)' },
      { transform: 'scale(1)' }
    ], { duration: 280, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    const shell = document.createElement('div');
    shell.className = 'ctl-bloom';
    shell.style.cssText = 'position:fixed;pointer-events:none;border-radius:50%;background:var(--ctl-ink);'
      + 'left:' + t.left + 'px;top:' + t.top + 'px;width:' + t.width + 'px;height:' + t.height + 'px;'
      + 'z-index:' + (opts.zIndex == null ? 0 : opts.zIndex) + ';';
    panel.parentNode.insertBefore(shell, panel);
    const sx = p.width / t.width, sy = p.height / t.height;
    const dx = p.left - t.left, dy = p.top - t.top;
    const run = shell.animate([
      { transform: 'translate(0,0) scale(1,1)', borderRadius: '50%', backgroundColor: 'var(--ctl-ink)' },
      { transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sx + ',' + sy + ')', borderRadius: '24px', backgroundColor: 'var(--ctl-surface)' }
    ], { duration: 300, easing: 'cubic-bezier(.22,1.18,.36,1)', fill: 'both' });
    run.onfinish = function () { shell.remove(); };
    panel.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, delay: 70, easing: 'ease-out', fill: 'both' });
    Array.prototype.forEach.call(panel.children, function (element, index) {
      element.animate([{ opacity: 0, transform: 'translateY(5px)' }, { opacity: 1, transform: 'none' }], {
        duration: 180, delay: 90 + index * 16, easing: 'cubic-bezier(.22,1.18,.36,1)', fill: 'both'
      });
    });
  }
  global.__ctlMotion = { bloom: bloom };
})(window);
