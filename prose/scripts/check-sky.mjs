/** Check the independently generated reader without its 3D/font resources.
 * Run after npm run build and serve dist; REVIEW_URL is the archive directory.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const modulePath = process.env.PLAYWRIGHT_MODULE || 'playwright';
const { chromium } = await import(path.isAbsolute(modulePath) ? pathToFileURL(modulePath).href : modulePath);
const archive = new URL(process.env.REVIEW_URL || 'http://127.0.0.1:5204/');
const palette = JSON.parse(await fs.readFile(new URL('../design/sky-palettes.json', import.meta.url), 'utf8'));
const content = JSON.parse(await fs.readFile(new URL('../content/archives.json', import.meta.url), 'utf8'));
const record = content.records[0];
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
try {
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: width === 1440 ? 900 : 844 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => localStorage.setItem('rhine-settings', JSON.stringify({ colorTheme: 'dark', reduced: true, sound: false, music: false })));
    const page = await context.newPage();
    await page.route(/\.(?:glb|woff2?)(?:\?|$)/i, route => route.abort());
    const url = new URL(`${record.id.toLowerCase()}/`, archive); url.search = '?palette=tea&presence=1&titleScale=1.1&hour=14.5';
    await page.goto(url.href, { waitUntil: 'domcontentloaded' });
    await page.locator('.rd-body p').first().waitFor();
    const actual = await page.evaluate(() => {
      const sheet = document.querySelector('.sheet'), title = document.querySelector('h1'), body = getComputedStyle(document.body);
      const style = getComputedStyle(sheet), ink = getComputedStyle(title);
      return {
        text: title.textContent, opacity: ink.opacity, visibility: ink.visibility,
        sheetBg: style.backgroundColor, blur: style.backdropFilter, bodyImage: body.backgroundImage,
        theme: document.documentElement.dataset.colorTheme, palette: document.documentElement.dataset.skyPalette,
        stage: document.documentElement.dataset.skyStage, hour: document.documentElement.dataset.skyHour,
        focusButton: !!document.querySelector('[data-action="focus-reading"]'),
        overflow: document.documentElement.scrollWidth > innerWidth,
      };
    });
    assert.equal(actual.text, record.title); assert.equal(actual.opacity, '1'); assert.equal(actual.visibility, 'visible');
    assert.equal(actual.theme, 'dark'); assert.equal(actual.palette, 'tea'); assert.equal(actual.stage, 'read'); assert.equal(actual.hour, '14.50');
    assert.equal(actual.blur, 'none'); assert.equal(actual.overflow, false);
    assert.equal(actual.focusButton, false, 'No focus/reading-mode control remains');
    assert.equal(actual.sheetBg, 'rgba(0, 0, 0, 0)', 'Reader sheet is not a paper card');
    assert.match(actual.bodyImage, /linear-gradient/, 'Reader body uses the unified sky gradient');
    const back = await page.locator('a.back').getAttribute('href');
    assert.equal(new URL(back, page.url()).pathname, archive.pathname); assert.equal(new URL(back, page.url()).searchParams.get('archive'), record.id);
    console.log(JSON.stringify({ scene: 'dark blocked fonts/model reader, unified sky, direct return', width, actual, back, result: 'pass' }));
    await page.goto(new URL(`${record.id.toLowerCase()}/?palette=toString`, archive).href, { waitUntil: 'domcontentloaded' });
    assert.equal(await page.evaluate(() => document.documentElement.dataset.skyPalette), 'dawn', 'Inherited palette names fall back to dawn');
    await context.close();
  }
  function luminance(hex) { const rgb = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4); return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722; }
  for (const [name, ends] of Object.entries(palette.palettes)) for (const [theme, side] of Object.entries(ends)) {
    const surface = side.surface;
    for (const role of ['ink', 'muted']) { const pair = [luminance(surface[role]), luminance(surface.paper)].sort((a, b) => b - a); assert.ok((pair[0] + .05) / (pair[1] + .05) >= 4.5, `${name}/${theme}/${role} contrast`); }
  }
} finally { await browser.close(); }
