/** Restrained edge feedback for the transparent archive panels.
 *
 * Panels stay click-through (the array owns drag), so hover is matched at
 * document level against each panel's bounds. There is no pointer-chasing
 * light: hover/focus/press only raise a fixed inset top highlight and accent
 * edge. Reduced motion freezes the edge statically.
 */
export function installSkyInteraction(stage: HTMLElement): () => void {
  const controller = new AbortController();
  const signal = controller.signal;
  const passive = { signal, passive: true };
  const doc = stage.ownerDocument;
  const panels = [...stage.querySelectorAll<HTMLElement>('.archive-callout, .archive-counter, .archive-navigation, .column-navigation')];
  const enabled = () => stage.dataset.mode === 'archive' && !stage.classList.contains('reduce-motion');
  const inside = (panel: HTMLElement, x: number, y: number) => {
    const bounds = panel.getBoundingClientRect();
    return x >= bounds.left && x <= bounds.right && y >= bounds.top && y <= bounds.bottom;
  };
  doc.addEventListener('pointermove', (event: PointerEvent) => {
    if (!enabled()) return;
    for (const panel of panels) {
      if (inside(panel, event.clientX, event.clientY)) panel.dataset.rimHover = '';
      else delete panel.dataset.rimHover;
    }
  }, passive);
  doc.addEventListener('pointerdown', (event: PointerEvent) => {
    if (!enabled()) return;
    for (const panel of panels) {
      if (inside(panel, event.clientX, event.clientY)) panel.dataset.rimPressed = '';
    }
  }, passive);
  doc.addEventListener('pointerup', () => { for (const panel of panels) delete panel.dataset.rimPressed; }, passive);
  doc.addEventListener('pointercancel', () => { for (const panel of panels) delete panel.dataset.rimPressed; }, passive);
  stage.addEventListener('pointerleave', () => { for (const panel of panels) { delete panel.dataset.rimHover; delete panel.dataset.rimPressed; } }, passive);
  return () => {
    controller.abort();
    for (const panel of panels) { delete panel.dataset.rimHover; delete panel.dataset.rimPressed; }
  };
}
