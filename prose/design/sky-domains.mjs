// Shared sky colour-domain geometry and slow-flow math.
//
// One source for both renderers:
//   1. src/theme-material.ts — analytic GLSL domains + per-frame uniforms.
//   2. scripts/prose-pages.mjs — the reader's colour-domain layers and their
//      CSS keyframes.
// Keeping the geometry and motion here means the WebGL sky and the static
// reader share the same centres, axes, orientation, periods and phases instead
// of each inventing its own.
//
// Coordinates are viewport fractions measured from the TOP-LEFT (the CSS
// convention): `cx`/`cy` are the domain centre, `rx`/`ry` the ellipse radii as
// fractions of viewport width/height. That matches CSS
// `radial-gradient(<rx>% <ry>% at <cx>% <cy>%, ...)` and the WebGL shader
// converts the [0,1] screen UV (y up) back to this top-down space.
//
// Each domain is a large, soft, asymmetrically placed colour mass. It is NOT a
// rigid stamp: over one slow loop it
//   * drifts on a bounded, ease-in-out orbit (`ax`/`ay`),
//   * changes its major-axis orientation (`rot` + `spin`),
//   * changes its axis ratio while roughly preserving area (`shape`),
//   * and its rim is warped by a travelling low-order angular wave (`wobble`),
// which is what makes the blur visibly flow and intermingle instead of a fixed
// radial layer sliding around. Every frequency is an integer multiple of the
// domain period, so the loop seam is invisible.
//
// `alpha` is the centre opacity; both renderers fade it to zero at the warped
// rim, so the soft edge is the same source value. `period` is the seconds of
// one full loop and `phase` (0..1) staggers the domains.
//
// Paint order is canonical: index 0 is painted LAST, i.e. it sits on top. The
// GLSL composition, `domainComposite` below and the reader's DOM order are all
// written to this same rule; keep them in step.
export const skyDomains = [
  // Cool upper-left mass: the zenith tone sprawling off the top edge.
  { step: "zenith",  cx: 0.28, cy: 0.10, rx: 0.52, ry: 0.34, alpha: 0.90, period: 54, phase: 0.00, ax: 0.069, ay: 0.052,
    rot: -0.32, spin: 0.46, spinCycles: 1, spinPhase: 0.00,
    shape: 0.27, shapeCycles: 2, shapePhase: 0.90,
    wobble: 0.19, wobbleCycles: 2, wobblePhase: 0.00 },
  // Warm lower-right mass: the horizon glow.
  { step: "horizon", cx: 0.79, cy: 0.66, rx: 0.62, ry: 0.52, alpha: 0.88, period: 47, phase: 0.35, ax: 0.063, ay: 0.072,
    rot: 0.46, spin: 0.51, spinCycles: 1, spinPhase: 2.10,
    shape: 0.30, shapeCycles: 1, shapePhase: 1.70,
    wobble: 0.20, wobbleCycles: 3, wobblePhase: 1.20 },
  // Broad neutral middle mass: keeps the two ends from reading as a band. Kept
  // last (bottom of the stack) with a lower alpha so it does not wash the
  // chromatic ends toward grey, and a slightly smaller footprint so the two
  // coloured masses stay distinct as they move.
  { step: "lower",   cx: 0.48, cy: 0.34, rx: 0.46, ry: 0.48, alpha: 0.28, period: 59, phase: 0.68, ax: 0.080, ay: 0.057,
    rot: 0.12, spin: 0.34, spinCycles: 2, spinPhase: 4.00,
    shape: 0.21, shapeCycles: 1, shapePhase: 3.10,
    wobble: 0.15, wobbleCycles: 2, wobblePhase: 2.60 },
];

/** Base fill behind the domains; a mid sky step keeps the page open. */
export const skyDomainBase = "haze";

/** Presentation-only chroma gain for the sky domains and base. The user asked
 * to reduce the flat/uniform blend and widen saturation a little; 1.35 is the
 * adopted value (1.10 read as indistinguishable in the same-condition shots).
 * Lightness/hue stay put and the boost relaxes out of gamut — see `boostChroma`
 * in sky-math.mjs. The palette itself is untouched. */
export const skyChromaGain = 1.35;

const TAU = Math.PI * 2;

/**
 * Bounded, seamless flow state for one domain at `seconds` since the shared sky
 * phase began. Returns the live centre, live axes, orientation, wobble
 * amplitude and a travelling wobble phase. All terms are periodic with the
 * domain's `period`, so the loop never jumps. `shape` is area-preserving: the
 * long axis grows while the short axis shrinks by the same factor, so the blur
 * changes form without pulsing the whole page brighter/darker.
 */
export function domainMotion(domain, seconds) {
  const t = (seconds / domain.period + domain.phase) * TAU;
  const stretch = Math.cos(t * (domain.shapeCycles ?? 1) + (domain.shapePhase ?? 0)) * (domain.shape ?? 0);
  return {
    cx: domain.cx + Math.sin(t) * domain.ax,
    cy: domain.cy + Math.cos(t) * domain.ay,
    // Area-preserving non-rigid axis morph: rx*ry stays exactly rx0*ry0.
    rx: domain.rx * (1 + stretch),
    ry: domain.ry / (1 + stretch),
    // Local rotation about the domain centre.
    rot: (domain.rot ?? 0) + Math.sin(t * (domain.spinCycles ?? 1) + (domain.spinPhase ?? 0)) * (domain.spin ?? 0),
    bend: domain.wobble ?? 0,
    bendPhase: t * (domain.wobbleCycles ?? 2) + (domain.wobblePhase ?? 0),
  };
}

/** Centre drift only, in viewport fractions. Kept for callers that just need
 * the bounded translation and for the reduced-motion diagnostic. */
export function domainOffset(domain, seconds) {
  const motion = domainMotion(domain, seconds);
  return [motion.cx - domain.cx, motion.cy - domain.cy];
}

/** Warped radial weight shared by the JS mirror and described for GLSL.
 * `rot` is in radians; the low-order angular waves make the rim non-rigid.
 * Both harmonics use an INTEGER multiple of `bendPhase` (1x and 2x). Because
 * `bendPhase` advances by an integer number of cycles per domain period, the
 * rim returns to its start at the seam. The GLSL fold in theme-material.ts
 * must use the same 1x/2x multipliers; a non-integer factor (e.g. 1.35) does
 * not close the loop. */
function domainWeight(dx, dy, motion, alpha) {
  const c = Math.cos(motion.rot), s = Math.sin(motion.rot);
  const rx = c * dx + s * dy, ry = -s * dx + c * dy;
  const ux = rx / motion.rx, uy = ry / motion.ry;
  const angle = Math.atan2(uy, ux);
  let radius = Math.hypot(ux, uy);
  radius *= 1 + motion.bend * (0.62 * Math.sin(angle * 2 + motion.bendPhase) + 0.38 * Math.sin(angle * 3 - motion.bendPhase * 2));
  return Math.max(0, 1 - Math.min(1, radius)) * alpha;
}

/** Sample the composed domain field for one point (top-down fractions).
 * Colours are sRGB channel triples (0-255); mirrors the GLSL composition.
 * Painted base-first with index 0 last, so entry 0 sits on top. */
export function domainComposite(point, base, colors, seconds = 0) {
  let out = base.slice();
  for (let i = skyDomains.length - 1; i >= 0; i--) {
    const domain = skyDomains[i];
    const motion = domainMotion(domain, seconds);
    const weight = domainWeight(point[0] - motion.cx, point[1] - motion.cy, motion, domain.alpha);
    const colour = colors[i] ?? base;
    out = out.map((channel, index) => channel + (colour[index] - channel) * weight);
  }
  return out.map(value => Math.max(0, Math.min(255, value)));
}
