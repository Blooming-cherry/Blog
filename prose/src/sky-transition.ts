import { designState, setDesignStage, type DesignStage } from "./sky-design";
const weights: Record<DesignStage, number> = { intro: 0, archive: 1, read: .35, focus: 0 };
/** Same 850 ms background channel as ThemeWave, sampled from the current value. */
export class SkyTransition {
  private from = 0;
  private target = 0;
  private start = 0;
  private stage: DesignStage = "intro";
  private moving = false;
  set(stage: DesignStage, reduced: boolean, now = performance.now()) {
    this.tick(now);
    this.stage = stage;
    this.from = designState.weight;
    this.target = weights[stage];
    this.start = now;
    this.moving = !reduced && Math.abs(this.from - this.target) > .0001;
    setDesignStage(stage, this.moving ? this.from : this.target);
  }
  tick(now = performance.now()) {
    if (!this.moving) return;
    const t = Math.max(0, Math.min(1, (now - this.start) / 850));
    const eased = t * t * (3 - 2 * t);
    setDesignStage(this.stage, this.from + (this.target - this.from) * eased);
    if (t === 1) this.moving = false;
  }
  finish() { this.moving = false; setDesignStage(this.stage, this.target); }
  get active() { return this.moving; }
  get remaining() { return this.moving ? Math.max(0, 850 - (performance.now() - this.start)) : 0; }
}
