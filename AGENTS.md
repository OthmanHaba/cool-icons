# AGENTS.md

Cool Icons: a static catalog of developer, infrastructure and project logos, live at **https://coolicon.falak.sh**.
**Using** the icons (URLs, slugs, variants)? Read [`site/llms.txt`](site/llms.txt), also served at https://coolicon.falak.sh/llms.txt.
This file is for **changing** the project.

## Layout

| Path | What |
|---|---|
| `scripts/build.mjs` | The whole pipeline: fetch sources → merge by slug → write `dist/` (SVG, JSON, symlinks) → render PNGs |
| `scripts/check.mjs` | Smoke check of a finished `dist/` (merges, shortcuts, PNG coverage, no unsafe SVGs) |
| `site/` | Static frontend (`index.html`, `app.js`, `style.css`, `llms.txt`), copied into `dist/` as is. No framework, no bundler |
| `Dockerfile` | Build stage runs `build.mjs`; final stage is nginx serving `dist/` |
| `nginx.conf` | Port **3000** (Falak's container port). `/i/` has CORS `*`, a 1-day cache and a no-script CSP; SPA fallback for `/icon/<slug>` |
| `falak.yaml` | Falak config-as-code: Docker app `coolicons` on server `main-1`, `build.mode: on-server`, domain `coolicon.falak.sh` |

## Commands

```bash
npm ci                              # use npm: pnpm here does not create node_modules
node scripts/build.mjs              # full build, about 30 s on a laptop; clones svgl + cncf/landscape into .cache/
SKIP_PNG=1 node scripts/build.mjs   # index + SVG only, about 10 s; use this while iterating on merge logic
node scripts/check.mjs              # run after every build (SKIP_PNG=1 if PNGs were skipped)
docker build -t cool-icons . && docker run -p 8088:3000 cool-icons
```

`dist/` is about 900 MB and 100k files, `.cache/` about 110 MB; both are git-ignored. Never commit them.

## How the build works

- **Sources:** npm packages (`simple-icons`, `@iconify-json/{logos,devicon,devicon-plain,skill-icons,vscode-icons}`) and sparse git clones (svgl `static/library` plus `api.svgl.app` metadata; `cncf/landscape` `hosted_logos` plus `landscape.yml`). There are no cloud-provider architecture packs (AWS, Azure, GCP), on purpose: their licenses don't allow redistribution.
- **Merge:** `keyOf(name)` gives the slug. Lowercase, `.`→`dot`, `+`→`plus`, `#`→`sharp`, `&`→`and`, strip non-alnum, `dotjs$`→`js`, then the `ALIAS` map. When the same product shows up under two slugs, add an `ALIAS` entry and don't touch `keyOf`. `site/app.js` has a copy of `keyOf` for search; keep the two in sync.
- **Variant ids:** `<source>[-wordmark][-dark|-light]`, plus `-2`, `-3`… for duplicates. The default variant is the lowest `score()` (the source order in `RANK`, with penalties for wordmark, dark and mono).
- **Safety:** an SVG matching `UNSAFE` (script, foreignObject, `on*=`, `javascript:`) is dropped at ingest. Keep it that way: SVGs are offered as inline snippets.
- **Output:** `dist/i/<slug>/<variant>.svg` and `dist/i/<slug>/<variant>/<size>.png`. The default-variant shortcuts (`i/<slug>.svg`, `i/<slug>.png`, `i/<slug>/<size>.png`) are **relative symlinks**, so keep them working in Docker COPY and nginx. Also `i/<slug>.json`, `icons.json`, and `search.json` (compact arrays read by `app.js`).
- **PNGs:** resvg runs in child processes, one per CPU. A few SVGs make resvg **panic**, which aborts the process with SIGABRT (exit code `null`, not `!= 0`). The child writes its progress to a file before each job, and the parent restarts it past the bad file. System fonts stay off: loading them made the build 50x slower.

## Deploy (Falak)

- Repo `github.com/falak-sh/cool-icons`, branch `main`. A push deploys automatically. The image is built on **main-1** itself.
- Config-as-code is enabled, but a plain push redeploys without applying `falak.yaml`. After you edit `falak.yaml`:
  `falak validate && falak plan -p "Cool Icons" -e production && falak apply -p "Cool Icons" -e production`.
- A deploy takes about 10 minutes when the build cache is cold: it re-fetches every source and renders about 97k PNGs.
- Check it after deploying: `curl -sI https://coolicon.falak.sh/i/docker.svg` should give `200 image/svg+xml`.

## Rules

- Keep it static: there is no server code, and nginx serves only files. Use a pre-rendered file, not a query parameter.
- Public URLs (`/i/...`, slugs, variant ids, `search.json` shape) are an API other people embed: don't rename or reshape them.
  If you add new sizes or variants, update `site/llms.txt` and the footer in `site/index.html` as well.
- Every new source needs a license that allows redistribution, recorded per variant (`license` field).
