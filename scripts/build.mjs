// Pulls every icon source, merges them by slug, writes dist/ (SVG + PNG + JSON index + site).
// Run: node scripts/build.mjs   (needs git + network; first run clones into .cache/)
import { execFileSync, spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(ROOT, '.cache');
const DIST = path.join(ROOT, 'dist');
const SIZES = [16, 32, 64, 128, 256, 512];
const require = createRequire(import.meta.url);
const SELF = fileURLToPath(import.meta.url);

// ---------- PNG renderer (child process) ----------
// resvg panics abort the whole process on a few malformed SVGs, so rendering runs in children that record
// progress before each job; the parent restarts a crashed child past the bad file.
if (process.argv[2] === '--render') {
  const [, , , jobsFile, progressFile] = process.argv;
  const { Resvg } = require('@resvg/resvg-js');
  const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
  // ponytail: no system fonts (loading them per render is 50x slower); the rare <text> in a wordmark renders blank.
  const font = { loadSystemFonts: false };
  for (let i = +fs.readFileSync(progressFile, 'utf8'); i < jobs.length; i++) {
    fs.writeFileSync(progressFile, String(i));
    const { svgFile, outDir, w, h } = jobs[i];
    const svg = fs.readFileSync(svgFile);
    fs.mkdirSync(outDir, { recursive: true });
    for (const size of SIZES) {
      try {
        const fitTo = w >= h ? { mode: 'width', value: size } : { mode: 'height', value: size };
        fs.writeFileSync(path.join(outDir, `${size}.png`), new Resvg(svg, { fitTo, font }).render().asPng());
      } catch { /* unparsable: no PNG for this size */ }
    }
  }
  process.exit(0);
}

function renderChunk(jobs, k) {
  const jobsFile = path.join(CACHE, `render-${k}.json`), progressFile = path.join(CACHE, `render-${k}.progress`);
  fs.writeFileSync(jobsFile, JSON.stringify(jobs));
  fs.writeFileSync(progressFile, '0');
  return new Promise((ok) => {
    const run = () => spawn(process.execPath, [SELF, '--render', jobsFile, progressFile], { stdio: ['ignore', 'ignore', 'ignore'] })
      .on('exit', (code) => {
        if (code === 0) return ok(); // a panic exits by SIGABRT: code is null
        const at = +fs.readFileSync(progressFile, 'utf8');
        console.warn(`  renderer crashed on ${path.relative(DIST, jobs[at].svgFile)}, skipping it`);
        fs.writeFileSync(progressFile, String(at + 1));
        run();
      });
    run();
  });
}

// ---------- merge ----------
// Names that differ across sources for the same thing. ponytail: hand-kept list, grow it as duplicates show up.
const ALIAS = {
  amazonwebservices: 'aws', amazonaws: 'aws', node: 'nodejs', googlecloudplatform: 'googlecloud', gcp: 'googlecloud',
  microsoftazure: 'azure', k8s: 'kubernetes', golang: 'go', postgres: 'postgresql', mongo: 'mongodb', js: 'javascript',
  ts: 'typescript', csharp: 'csharp', cplusplus: 'cplusplus', cpp: 'cplusplus', vscode: 'visualstudiocode',
  reactjs: 'react', vue: 'vuejs', tailwind: 'tailwindcss', tailwindcssicon: 'tailwindcss', gitlabicon: 'gitlab',
};
const keyOf = (name) => {
  const k = name.toLowerCase().replace(/\+/g, 'plus').replace(/#/g, 'sharp').replace(/&/g, 'and')
    .replace(/\./g, 'dot').replace(/[^a-z0-9]/g, '').replace(/dotjs$/, 'js');
  return ALIAS[k] ?? k;
};
const titleize = (s) => s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
// Third-party SVGs end up in <img> and in copy-paste inline snippets: drop anything scriptable.
const UNSAFE = /<script|<foreignObject|\bon[a-z]+\s*=|javascript:/i;

const icons = new Map();
let rejected = 0;
function add(name, { variant, source, license, svg, title, aliases = [], categories = [], description, url, dark = false, wordmark = false }) {
  const slug = keyOf(name);
  if (!slug || !svg) return;
  if (UNSAFE.test(svg)) { rejected++; return; }
  const box = viewBox(svg);
  if (!box) { rejected++; return; }
  let e = icons.get(slug);
  if (!e) icons.set(slug, (e = { slug, name: title ?? titleize(name), titled: !!title, aliases: new Set(), categories: new Set(), variants: [] }));
  if (title && !e.titled) Object.assign(e, { name: title, titled: true });
  if (keyOf(e.name) !== slug) e.aliases.add(name);
  aliases.forEach((a) => e.aliases.add(a));
  categories.flat().filter(Boolean).forEach((c) => e.categories.add(c));
  e.description ??= description;
  e.url ??= url;
  let id = variant, n = 2;
  while (e.variants.some((v) => v.id === id)) id = `${variant}-${n++}`;
  e.variants.push({ id, source, license, dark, wordmark, w: box[0], h: box[1], svg: sized(svg, box) });
}
// Root <svg> gets a modest intrinsic size (64px tall, wordmarks at most 256px wide) so a bare Markdown/<img> embed
// doesn't render full-width; width attributes and CSS still override it. viewBox keeps it scalable.
function sized(svg, [w, h]) {
  const H = Math.min(64, (256 * h) / w), W = (H * w) / h, r = (x) => +x.toFixed(2);
  return svg.replace(/<svg\b[^>]*>/i, (tag) => {
    const t = tag.replace(/\s(width|height)\s*=\s*("[^"]*"|'[^']*')/gi, '');
    return t.replace(/^<svg/i, `<svg width="${r(W)}" height="${r(H)}"${/viewBox=/i.test(t) ? '' : ` viewBox="0 0 ${w} ${h}"`}`);
  });
}
function viewBox(svg) {
  const vb = svg.match(/viewBox=["']\s*[-\d.]+[\s,]+[-\d.]+[\s,]+([\d.]+)[\s,]+([\d.]+)/i);
  if (vb) return [+vb[1], +vb[2]];
  const w = svg.match(/<svg[^>]*\swidth=["']([\d.]+)/i), h = svg.match(/<svg[^>]*\sheight=["']([\d.]+)/i);
  return w && h ? [+w[1], +h[1]] : null;
}

// ---------- sources ----------
function gitSparse(repo, dir, paths) {
  const dest = path.join(CACHE, dir);
  if (fs.existsSync(dest)) {
    // Shallow clones can't `pull` once upstream moves on; take the new tip as is.
    execFileSync('git', ['-C', dest, 'fetch', '-q', '--depth', '1', 'origin', 'HEAD'], { stdio: 'inherit' });
    execFileSync('git', ['-C', dest, 'reset', '-q', '--hard', 'FETCH_HEAD'], { stdio: 'inherit' });
  } else {
    execFileSync('git', ['clone', '-q', '--depth', '1', '--filter=blob:none', '--sparse', repo, dest], { stdio: 'inherit' });
    execFileSync('git', ['-C', dest, 'sparse-checkout', 'set', ...paths], { stdio: 'inherit' });
  }
  return dest;
}

function simpleIcons() {
  const pkg = path.join(ROOT, 'node_modules/simple-icons');
  const data = JSON.parse(fs.readFileSync(path.join(pkg, 'data/simple-icons.json'), 'utf8'));
  const list = Array.isArray(data) ? data : data.icons;
  const dir = path.join(pkg, 'icons');
  for (const i of list) {
    const file = path.join(dir, `${i.slug}.svg`);
    if (!fs.existsSync(file)) continue;
    const svg = fs.readFileSync(file, 'utf8');
    const aliases = [...(i.aliases?.aka ?? []), ...Object.values(i.aliases?.loc ?? {})];
    const license = i.license?.type ?? 'CC0-1.0';
    const meta = { title: i.title, aliases, url: i.guidelines ?? i.source, license };
    add(i.slug, { ...meta, variant: 'simple-icons', source: 'simple-icons', svg: svg.replace('<svg ', `<svg fill="#${i.hex}" `) });
    add(i.slug, { ...meta, variant: 'simple-icons-mono', source: 'simple-icons', svg });
  }
}

function iconify(set, { variantOf }) {
  const j = require(`@iconify-json/${set}/icons.json`);
  const { license } = require(`@iconify-json/${set}/info.json`);
  for (const [name, ic] of Object.entries(j.icons)) {
    const r = variantOf(name);
    if (!r) continue;
    const [l, t, w, h] = [ic.left ?? j.left ?? 0, ic.top ?? j.top ?? 0, ic.width ?? j.width ?? 16, ic.height ?? j.height ?? 16];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="${l} ${t} ${w} ${h}" width="${w}" height="${h}">${ic.body}</svg>`;
    add(r.name, { source: set, license: license.spdx, svg, ...r });
  }
}
// "docker-wordmark" -> { name: docker, variant: <set>-wordmark, wordmark: true }
const suffixed = (set, suffixes) => (name) => {
  const m = name.match(new RegExp(`^(.+?)-(${suffixes.join('|')})$`));
  const sfx = m?.[2];
  return {
    name: m ? m[1] : name, variant: sfx ? `${set}-${sfx}` : set,
    wordmark: sfx === 'wordmark', dark: sfx === 'dark',
  };
};

function logos() {
  // logos: "docker" is the wordmark when "docker-icon" exists; "-icon" is the symbol; "-dark" a dark-mode version.
  const names = new Set(Object.keys(require('@iconify-json/logos/icons.json').icons));
  iconify('logos', {
    variantOf: (full) => {
      const dark = full.endsWith('-dark'), n = dark ? full.slice(0, -5) : full, d = dark ? '-dark' : '';
      return n.endsWith('-icon') ? { name: n.slice(0, -5), variant: `logos${d}`, dark }
        : names.has(`${n}-icon`) ? { name: n, variant: `logos-wordmark${d}`, wordmark: true, dark } : { name: n, variant: `logos${d}`, dark };
    },
  });
}

// Glyph sets: generic dev/infra icons (server, load balancer, terminal, database…) drawn in currentColor, no background.
// "brand-x"/"logo-x"/"language-x" are brands and merge into x; "-filled"/"-outline" are variants of the same icon.
function glyphs(set, variant = set) {
  iconify(set, {
    variantOf: (n) => {
      const m = n.replace(/^(brand|logo|language)-/, '').match(/^(.+?)(?:-(filled|outline))?$/);
      return { name: m[1], variant: m[2] ? `${variant}-${m[2]}` : variant, categories: ['glyph'] };
    },
  });
}

function vscode() {
  iconify('vscode-icons', {
    variantOf: (n) => {
      const m = n.match(/^file-type-(light-)?(.+?)(\d*)$/);
      return m && { name: m[2], variant: `vscode${m[1] ? '-light' : ''}` };
    },
  });
}

async function svgl() {
  const dir = gitSparse('https://github.com/pheralb/svgl', 'svgl', ['static/library']);
  const list = await (await fetch('https://api.svgl.app', { signal: AbortSignal.timeout(60_000) })).json();
  const read = (u) => { const f = path.join(dir, 'static/library', path.basename(new URL(u).pathname)); return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : null; };
  for (const i of list) {
    const meta = { title: i.title, categories: [i.category], url: i.url, source: 'svgl', license: 'trademark of owner (via svgl)' };
    for (const [key, wordmark] of [['route', false], ['wordmark', true]]) {
      const r = i[key];
      if (!r) continue;
      const base = wordmark ? 'svgl-wordmark' : 'svgl';
      if (typeof r === 'string') add(i.title, { ...meta, wordmark, variant: base, svg: read(r) });
      else {
        add(i.title, { ...meta, wordmark, variant: base, svg: read(r.light) });
        add(i.title, { ...meta, wordmark, variant: `${base}-dark`, dark: true, svg: read(r.dark) });
      }
    }
  }
}

async function cncf() {
  const dir = gitSparse('https://github.com/cncf/landscape', 'cncf', ['hosted_logos']);
  const { parse } = await import('yaml');
  const y = parse(fs.readFileSync(path.join(dir, 'landscape.yml'), 'utf8'));
  for (const c of y.landscape) for (const s of c.subcategories ?? []) for (const i of s.items ?? []) {
    const f = i.logo && path.join(dir, 'hosted_logos', i.logo);
    if (!f || !fs.existsSync(f)) continue;
    add(i.name, {
      title: i.name, variant: 'cncf', source: 'cncf-landscape', license: 'trademark of owner (via CNCF Landscape)',
      categories: [c.name, s.name], description: i.description, url: i.homepage_url, svg: fs.readFileSync(f, 'utf8'),
    });
  }
}

// ---------- output ----------
// The page's own files get content-hashed copies under /assets/ (cached forever, see nginx.conf). Public URLs such as
// /search.json stay as they are for API users; only index.html and app.js are pointed at the hashed copies.
function fingerprint() {
  const hashed = (file) => {
    const buf = fs.readFileSync(path.join(DIST, file));
    const h = crypto.createHash('sha256').update(buf).digest('hex').slice(0, 10);
    const out = `assets/${file.replace(/(\.\w+)$/, `.${h}$1`)}`;
    fs.mkdirSync(path.join(DIST, 'assets'), { recursive: true });
    fs.writeFileSync(path.join(DIST, out), buf);
    return `/${out}`;
  };
  const edit = (file, fn) => fs.writeFileSync(path.join(DIST, file), fn(fs.readFileSync(path.join(DIST, file), 'utf8')));
  const search = hashed('search.json');
  edit('app.js', (s) => s.replace("'/search.json'", `'${search}'`));
  const app = hashed('app.js'), css = hashed('style.css');
  edit('index.html', (s) => s.replace('/app.js', app).replace('/style.css', css).replace('/search.json', search));
}
// nginx serves these with gzip_static instead of compressing a 1 MB index on every request.
// ponytail: only the site + index files; /i/ SVGs are tiny and the CDN caches them anyway.
function precompress() {
  const files = ['index.html', 'llms.txt', 'icons.json', 'search.json', ...fs.readdirSync(path.join(DIST, 'assets')).map((f) => `assets/${f}`)];
  for (const f of files) fs.writeFileSync(path.join(DIST, `${f}.gz`), zlib.gzipSync(fs.readFileSync(path.join(DIST, f)), { level: 9 }));
}

// Default variant: colored, symbol-only, light first.
const RANK = ['svgl', 'logos', 'devicon', 'skill-icons', 'simple-icons', 'cncf-landscape', 'devicon-plain', 'vscode-icons',
  'material-icon-theme', 'lucide', 'tabler', 'carbon', 'codicon', 'mdi'];
const score = (v) => RANK.indexOf(v.source) + (v.wordmark ? 20 : 0) + (v.dark ? 10 : 0) + (v.id === 'simple-icons-mono' ? 5 : 0);

async function main() {
  const t0 = Date.now();
  fs.mkdirSync(CACHE, { recursive: true });
  simpleIcons();
  logos();
  iconify('devicon', { variantOf: suffixed('devicon', ['wordmark']) });
  iconify('devicon-plain', { variantOf: suffixed('devicon-plain', ['wordmark']) });
  iconify('skill-icons', { variantOf: suffixed('skill-icons', ['dark', 'light']) });
  vscode();
  // Language/tool file icons (colored); folder-* icons are skipped as noise.
  iconify('material-icon-theme', { variantOf: (n) => !n.startsWith('folder') && suffixed('material', ['light'])(n) });
  for (const set of ['lucide', 'tabler', 'carbon', 'codicon', 'mdi']) glyphs(set);
  await svgl();
  await cncf();

  fs.rmSync(DIST, { recursive: true, force: true });
  fs.cpSync(path.join(ROOT, 'site'), DIST, { recursive: true });
  const I = path.join(DIST, 'i');
  const jobs = [], all = [], search = [];
  for (const e of [...icons.values()].sort((a, b) => a.slug.localeCompare(b.slug))) {
    e.variants.sort((a, b) => score(a) - score(b));
    const d = path.join(I, e.slug);
    fs.mkdirSync(d, { recursive: true });
    for (const v of e.variants) {
      fs.writeFileSync(path.join(d, `${v.id}.svg`), v.svg);
      jobs.push({ svgFile: path.join(d, `${v.id}.svg`), outDir: path.join(d, v.id), w: v.w, h: v.h });
      delete v.svg;
    }
    // Default-variant shortcuts: /i/<slug>.svg, /i/<slug>.png (128px), /i/<slug>/<size>.png
    const def = e.variants[0].id;
    fs.symlinkSync(`${e.slug}/${def}.svg`, path.join(I, `${e.slug}.svg`));
    fs.symlinkSync(`${e.slug}/${def}/128.png`, path.join(I, `${e.slug}.png`));
    for (const s of SIZES) fs.symlinkSync(`${def}/${s}.png`, path.join(d, `${s}.png`));
    const out = { slug: e.slug, name: e.name, aliases: [...e.aliases], categories: [...e.categories], description: e.description, url: e.url, variants: e.variants };
    fs.writeFileSync(path.join(I, `${e.slug}.json`), JSON.stringify(out));
    all.push(out);
    search.push([e.slug, e.name, out.aliases.join(' '), out.categories.join(' '), def, e.variants.length]);
  }
  fs.writeFileSync(path.join(DIST, 'icons.json'), JSON.stringify(all));
  fs.writeFileSync(path.join(DIST, 'search.json'), JSON.stringify(search));
  fingerprint();
  precompress();
  console.log(`${icons.size} icons, ${jobs.length} variants, ${rejected} rejected SVGs (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

  if (process.env.SKIP_PNG) return;
  const n = os.availableParallelism();
  await Promise.all(Array.from({ length: n }, (_, k) => renderChunk(jobs.filter((_, i) => i % n === k), k)));
  console.log(`PNGs rendered with ${n} threads (${((Date.now() - t0) / 1000).toFixed(1)}s total)`);
}

if (process.argv[2] !== '--render') await main();
