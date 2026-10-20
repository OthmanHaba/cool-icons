// Search + detail SPA. Routes: /  (search, ?q=)  and  /icon/<slug>  (nginx falls back to index.html).
const $ = (s) => document.querySelector(s);
const app = $('#app'), q = $('#q'), count = $('#count');
const SIZES = [16, 32, 64, 128, 256, 512];
const PAGE = 240;
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const keyOf = (s) => s.toLowerCase().replace(/\+/g, 'plus').replace(/#/g, 'sharp').replace(/\./g, 'dot').replace(/[^a-z0-9]/g, '');

let index = []; // [slug, name, aliases, categories, defaultVariant, variantCount]
const ready = fetch('/search.json').then((r) => r.json()).then((d) => {
  index = d.map(([slug, name, aliases, cats, def, n]) => ({ slug, name, def, n, hay: [name.toLowerCase(), aliases.toLowerCase(), cats.toLowerCase()] }));
});

// ponytail: linear scan over ~8k entries is <5ms; swap for an inverted index if the catalog grows 10x.
function search(term) {
  const t = term.trim().toLowerCase(), k = keyOf(t);
  if (!t) return [...index].sort((a, b) => b.n - a.n);
  const hits = [];
  for (const e of index) {
    const [name, aliases, cats] = e.hay;
    const s = e.slug === k || name === t ? 0 : e.slug.startsWith(k) || name.startsWith(t) ? 1
      : e.slug.includes(k) || name.includes(t) ? 2 : aliases.includes(t) ? 3 : cats.includes(t) ? 4 : -1;
    if (s >= 0) hits.push([s, e]);
  }
  return hits.sort((a, b) => a[0] - b[0] || b[1].n - a[1].n || a[1].name.length - b[1].name.length).map((h) => h[1]);
}

function renderList(term) {
  const res = search(term);
  count.textContent = `${res.length.toLocaleString()} icons`;
  if (!res.length) { app.innerHTML = `<p class="empty">Nothing for “${esc(term)}”.</p>`; return; }
  app.innerHTML = '<div class="grid"></div><div id="more"></div>';
  const grid = app.firstChild;
  let shown = 0;
  const more = () => {
    grid.insertAdjacentHTML('beforeend', res.slice(shown, shown += PAGE).map((e) =>
      `<a class="tile" href="/icon/${e.slug}" data-link><img src="/i/${e.slug}/${esc(e.def)}.svg" alt="" loading="lazy">` +
      `<b title="${esc(e.name)}">${esc(e.name)}</b><small>${e.n} variant${e.n > 1 ? 's' : ''}</small></a>`).join(''));
    if (shown >= res.length) io.disconnect();
  };
  const io = new IntersectionObserver((x) => x[0].isIntersecting && more(), { rootMargin: '800px' });
  more();
  io.observe($('#more'));
}

async function renderIcon(slug) {
  const r = await fetch(`/i/${encodeURIComponent(slug)}.json`);
  if (!r.ok) { app.innerHTML = `<p class="empty">No icon “${esc(slug)}”. <a href="/" data-link>Back to search</a></p>`; return; }
  const icon = await r.json();
  document.title = `${icon.name} icon: SVG & PNG · Cool Icons`;
  count.textContent = '';
  app.innerHTML = `<section class="detail">
    <h1>${esc(icon.name)}</h1>
    <p class="meta">${[icon.description, icon.categories.join(' · '), icon.aliases.length && `aka ${icon.aliases.join(', ')}`]
      .filter(Boolean).map(esc).join(' — ')}${icon.url ? ` · <a href="${esc(icon.url)}" rel="noopener nofollow" target="_blank">website</a>` : ''}</p>
    <div class="variants">${icon.variants.map((v, i) =>
      `<button class="variant${v.dark ? ' dark' : ''}" data-i="${i}" aria-pressed="${!i}"><div class="pic"><img src="/i/${icon.slug}/${esc(v.id)}.svg" alt="${esc(v.id)}"></div><span>${esc(v.id)}</span></button>`).join('')}</div>
    <div id="pick"></div></section>`;
  const pick = (i) => {
    app.querySelectorAll('.variant').forEach((b) => b.setAttribute('aria-pressed', b.dataset.i == i));
    renderPick(icon, icon.variants[i], i === 0);
  };
  app.querySelector('.variants').onclick = (ev) => { const b = ev.target.closest('.variant'); if (b) pick(+b.dataset.i); };
  pick(0);
}

async function renderPick(icon, v, isDefault) {
  const o = location.origin;
  const base = isDefault ? `/i/${icon.slug}` : `/i/${icon.slug}/${v.id}`;
  const svgUrl = `${o}${base}.svg`;
  const pngUrl = (s) => isDefault ? `${o}/i/${icon.slug}/${s}.png` : `${o}/i/${icon.slug}/${v.id}/${s}.png`;
  const svgText = await (await fetch(svgUrl)).text();
  const rows = [
    ['SVG URL', svgUrl],
    ['PNG URL', pngUrl(128)],
    ['<img>', `<img src="${svgUrl}" alt="${icon.name}" width="48" height="48">`],
    ['Markdown', `![${icon.name}](${svgUrl})`],
    ['Inline SVG', svgText],
    ['Data URI', `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgText)))}`],
  ];
  $('#pick').innerHTML = `
    <div class="downloads">
      <a class="btn" href="${base}.svg" download="${icon.slug}-${v.id}.svg">Download SVG</a>
      ${SIZES.map((s) => `<a class="btn" href="${pngUrl(s)}" download="${icon.slug}-${v.id}-${s}.png">PNG ${s}</a>`).join('')}
      <small style="color:var(--muted)">variant <code>${esc(v.id)}</code> · ${esc(v.source)} · ${esc(v.license)}</small>
    </div>
    <div class="snips">${rows.map(([l, val], i) =>
      `<div class="snip"><label for="s${i}">${esc(l)}</label><input id="s${i}" readonly value="${esc(val)}"><button class="copy" data-i="${i}">Copy</button></div>`).join('')}</div>`;
  $('#pick').querySelectorAll('button.copy').forEach((b) => b.onclick = async () => {
    await navigator.clipboard.writeText(rows[b.dataset.i][1]);
    b.textContent = 'Copied'; setTimeout(() => (b.textContent = 'Copy'), 1200);
  });
}

async function route() {
  await ready;
  const m = location.pathname.match(/^\/icon\/([^/]+)/);
  if (m) return renderIcon(decodeURIComponent(m[1]));
  document.title = 'Cool Icons: every dev logo, one URL';
  q.value = new URLSearchParams(location.search).get('q') ?? q.value;
  renderList(q.value);
}

let timer;
q.addEventListener('input', () => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const url = q.value ? `/?q=${encodeURIComponent(q.value)}` : '/';
    location.pathname === '/' ? history.replaceState(null, '', url) : history.pushState(null, '', url);
    route();
  }, 80);
});
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('a[data-link]');
  if (!a || ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
  ev.preventDefault();
  if (a.getAttribute('href') === '/') q.value = '';
  history.pushState(null, '', a.href);
  route().then(() => window.scrollTo(0, 0));
});
addEventListener('popstate', route);
route();
