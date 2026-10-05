/**
 * A presentational sky-pool button. The host owns selection, theme and angle.
 * Load sky-pool-button.css once alongside this module.
 * @param {{root: Element, onAdvance: () => void}} options
 */
export function createSkyPoolButton({ root, onAdvance }) {
  const document = root.ownerDocument;
  const element = document.createElement('button');
  element.type = 'button';
  element.className = 'sky-pool-button';
  element.setAttribute('aria-label', '切换天幕');

  const face = document.createElement('span');
  face.className = 'sky-pool-button__face';
  face.setAttribute('aria-hidden', 'true');
  const card = document.createElement('span');
  card.className = 'sky-pool-button__card';
  const prism = document.createElement('span');
  prism.className = 'sky-pool-button__prism';
  face.append(card, prism);
  element.append(face);
  root.append(element);

  let disposed = false;
  const advance = (event) => {
    event.stopPropagation();
    if (!disposed) onAdvance();
  };
  // Preserve native focus/activation while isolating archive keyboard shortcuts.
  const isolateKey = (event) => event.stopPropagation();
  element.addEventListener('click', advance);
  element.addEventListener('keydown', isolateKey);
  element.addEventListener('keyup', isolateKey);

  return {
    element,
    /** @param {{pool: string, angle: number, reduced: boolean, label: string,
     * card: [string, string], prism: [string, string, string],
     * surface: {ink: string, edge: string, highlight: string}}} view */
    update(view) {
      if (disposed) return;
      element.dataset.pool = view.pool;
      element.dataset.reduced = String(Boolean(view.reduced));
      element.setAttribute('aria-label', view.label);
      element.title = view.label;
      const tokens = {
        'zenith': view.card[0],
        'horizon': view.card[1],
        'dusk': view.prism[0],
        'celadon': view.prism[1],
        'prism-ink': view.prism[2],
        'ink': view.surface.ink,
        'edge': view.surface.edge,
        'highlight': view.surface.highlight,
      };
      for (const [name, color] of Object.entries(tokens)) {
        element.style.setProperty(`--sky-button-${name}`, color);
      }
      // Native transitions retarget from the current painted angle. No queue,
      // animation completion callbacks or theme updates can outlive this view.
      prism.style.transform = `rotate(${view.angle}deg)`;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      element.removeEventListener('click', advance);
      element.removeEventListener('keydown', isolateKey);
      element.removeEventListener('keyup', isolateKey);
      element.remove();
    },
  };
}
