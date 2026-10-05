/** Per-document memory fallback; only the two per-tab session keys persist. */
export function createSkyPoolState(storageProvider = () => globalThis.sessionStorage) {
  const order = ["dusk", "celadon", "ink"];
  let pool = "A", palette = "dawn", angle = 0;
  function restore() {
    try {
      const storage = storageProvider();
      const storedPool = storage.getItem("rhine-sky-pool");
      const storedPalette = storage.getItem("rhine-sky-palette");
      if (storedPool === "B") { pool = "B"; palette = order.includes(storedPalette) ? storedPalette : "dusk"; }
    } catch { /* Current document remains operable with memory state. */ }
    return view();
  }
  function view(author = "dawn") { return { pool, palette: pool === "B" ? palette : author, angle }; }
  function advance() {
    palette = pool === "A" ? order[0] : order[(order.indexOf(palette) + 1) % order.length];
    pool = "B"; angle += 120;
    try {
      const storage = storageProvider();
      storage.setItem("rhine-sky-palette", palette);
      storage.setItem("rhine-sky-pool", pool);
    } catch { /* No localStorage fallback. */ }
    return view();
  }
  restore();
  return { restore, view, advance };
}
/** @returns {{pool: string, angle: number, reduced: boolean, label: string, card: [string,string], prism: [string,string,string], surface: {ink:string,edge:string,highlight:string}}} */
export function skyPoolButtonView(state, resolved, prism, reduced) {
  const labels = { dawn: "晨雾", tea: "茶", slate: "石", dusk: "暮", celadon: "青", ink: "墨" };
  const next = state.pool === "A" ? "dusk" : ({ dusk: "celadon", celadon: "ink", ink: "dusk" })[state.palette];
  return { pool: state.pool, angle: state.angle, reduced,
    label: `切换天幕：当前${labels[state.palette]}，下一种${labels[next]}`,
    card: [resolved.sky.zenith, resolved.sky.horizon], prism,
    surface: { ink: resolved.surface.ink, edge: resolved.surface.edge, highlight: resolved.surface.highlight } };
}
