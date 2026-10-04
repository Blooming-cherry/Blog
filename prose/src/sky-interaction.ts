/** Event-driven rim light for the transparent archive panels.
 *
 * The panels stay click-through (the archive array owns drag), so the rim is
 * tracked at document level and matched against each panel's bounds. No render
 * loop, no idle motion, no new controls. Reduced motion freezes the edge at its
 * static position instead of following the pointer.
 */
export function installSkyInteraction(stage: HTMLElement): () => void {
  const controller = new AbortController();
  const signal = controller.signal;
  const passive = { signal, passive: true };
  const doc = stage.ownerDocument;
  const panels = [...stage.querySelectorAll<HTMLElement>('.archive-callout, .archive-counter, .archive-navigation, .column-navigation')];
  const enabled = () => stage.dataset.mode === 'archive' && !stage.classList.contains('reduce-motion');
  const clear = (panel: HTMLElement) => {
    delete panel.dataset.rimHover;
    delete panel.dataset.rimPressed;
  };
  const locate = (panel: HTMLElement, x: number, y: number) => {
    const bounds = panel.getBoundingClientRect();
    if (x < bounds.left || x > bounds.right || y < bounds.top || y > bounds.bottom) return false;
    panel.style.setProperty('--rim-x', `${100 * (x - bounds.left) / bounds.width}%`);
    panel.style.setProperty('--rim-y', `${100 * (y - bounds.top) / bounds.height}%`);
    return true;
  };
  doc.addEventListener('pointermove', (event: PointerEvent) => {
    if (!enabled()) return;
    for (const panel of panels) {
      if (locate(panel, event.clientX, event.clientY)) panel.dataset.rimHover = '';
      else delete panel.dataset.rimHover;
    }
  }, passive);
  doc.addEventListener('pointerdown', (event: PointerEvent) => {
    if (!enabled()) return;
    for (const panel of panels) {
      if (locate(panel, event.clientX, event.clientY)) panel.dataset.rimPressed = '';
    }
  }, passive);
  doc.addEventListener('pointerup', () => { for (const panel of panels) delete panel.dataset.rimPressed; }, passive);
  doc.addEventListener('pointercancel', () => { for (const panel of panels) delete panel.dataset.rimPressed; }, passive);
  stage.addEventListener('pointerleave', () => { for (const panel of panels) clear(panel); }, passive);
  return () => {
    controller.abort();
    for (const panel of panels) {
      clear(panel);
      panel.style.removeProperty('--rim-x');
      panel.style.removeProperty('--rim-y');
    }
  };
}
