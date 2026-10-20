// Smoke check of a finished build: node scripts/check.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';

const D = new URL('../dist/', import.meta.url).pathname;
const icons = JSON.parse(fs.readFileSync(D + 'icons.json', 'utf8'));
const by = Object.fromEntries(icons.map((i) => [i.slug, i]));

assert(icons.length > 5000, `only ${icons.length} icons`);
// Cross-source merge: same thing from different sources lands on one slug.
for (const s of ['docker', 'kubernetes', 'nodejs', 'aws', 'react', 'postgresql', 'nextjs', 'go']) {
  assert(by[s], `missing ${s}`);
  assert(new Set(by[s].variants.map((v) => v.source)).size >= 3, `${s} not merged across sources`);
}
assert(!by.nodedotjs && !by.amazonwebservices, 'alias not applied');
// Default-variant shortcuts resolve, every variant has its SVG and (unless SKIP_PNG) its PNGs.
// A handful of SVGs crash or fail resvg; those have no PNG, but it must stay rare.
const png = !process.env.SKIP_PNG;
let noPng = 0;
for (const i of icons) {
  assert(fs.existsSync(`${D}i/${i.slug}.svg`), `${i.slug}.svg broken`);
  if (png && !fs.existsSync(`${D}i/${i.slug}/64.png`)) noPng++;
  for (const v of i.variants) {
    const svg = fs.readFileSync(`${D}i/${i.slug}/${v.id}.svg`, 'utf8');
    assert(!/<script|\bon[a-z]+\s*=/i.test(svg), `unsafe svg ${i.slug}/${v.id}`);
  }
}
assert(noPng < icons.length / 100, `${noPng} icons without PNG`);
console.log(`ok: ${icons.length} icons, ${icons.reduce((n, i) => n + i.variants.length, 0)} variants`);
