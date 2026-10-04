/* global hexo */
'use strict';

const fs = require('fs');
const path = require('path');

// Read the same author-owned palette as the prose renderer. The index borrows
// its accent and title scale; the existing NexT paper background is retained.
const palettePath = path.resolve(hexo.base_dir, '../prose/design/sky-palettes.json');
const design = JSON.parse(fs.readFileSync(palettePath, 'utf8'));
const paletteName = design.palettes[design.defaults.palette] ? design.defaults.palette : 'dawn';
const palette = design.palettes[paletteName];
const titleScale = Math.min(1.1, Math.max(0.9, Number(design.defaults.titleScale) || 1));

function rgb(value) {
  if (!/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Invalid shared sky palette color');
  return [1, 3, 5].map(offset => parseInt(value.slice(offset, offset + 2), 16)).join(', ');
}

function variables(theme) {
  return ['accent', 'paper', 'ink', 'muted', 'line', 'panel', 'field']
    .map(key => `--sky-${key}-rgb: ${rgb(theme[key])};`)
    .join('');
}

hexo.extend.filter.register('theme_inject', injects => {
  injects.head.raw('sky-home-palette', `<style id="sky-home-palette">:root{${variables(palette.light)}--sky-title-scale:${titleScale};}@media(prefers-color-scheme:dark){:root{${variables(palette.dark)}}}</style>`);
});
