import "./theme.css";
import { applyDesignTheme } from "./sky-design";
export let themeAmount = 0;
export function paintTheme(amount: number) {
  themeAmount = amount;
  document.documentElement.dataset.colorTheme = amount > .5 ? "dark" : "light";
  document.documentElement.dataset.darkSurface = String(amount > .0001);
  applyDesignTheme(amount);
}
export function themeSettingsMarkup(dark: boolean) {
  return `<div class="theme-settings"><div><strong>界面配色</strong><span>玻璃阵列随配色逐张过渡</span></div><div class="theme-choices" role="group" aria-label="界面配色"><button data-color-theme="light" aria-pressed="${!dark}">亮色</button><button data-color-theme="dark" aria-pressed="${dark}">暗色</button></div></div>`;
}
