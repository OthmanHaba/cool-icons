# Cool Icons

Every developer tool, infrastructure provider and open-source project logo, at one URL.
**https://coolicon.falak.sh**

![Docker](https://coolicon.falak.sh/i/docker.svg)
![Kubernetes](https://coolicon.falak.sh/i/kubernetes.svg)
![PostgreSQL](https://coolicon.falak.sh/i/postgresql.svg)
![Node.js](https://coolicon.falak.sh/i/nodejs.svg)
![AWS](https://coolicon.falak.sh/i/aws.svg)
![React](https://coolicon.falak.sh/i/react.svg)

About 7,600 icons and 16,000 variants, merged from [Simple Icons](https://simpleicons.org), [gilbarbara/logos](https://github.com/gilbarbara/logos),
[Devicon](https://devicon.dev), [skill-icons](https://github.com/tandpfun/skill-icons), [vscode-icons](https://github.com/vscode-icons/vscode-icons),
[svgl](https://svgl.app) and the [CNCF Landscape](https://landscape.cncf.io). Each icon comes as SVG and as PNG in six sizes.

## Use

| URL | Gives |
|---|---|
| `/i/<slug>.svg` | Default variant, SVG |
| `/i/<slug>.png` | Default variant, PNG 128px |
| `/i/<slug>/<16\|32\|64\|128\|256\|512>.png` | Default variant, PNG at that size |
| `/i/<slug>/<variant>.svg` | A specific variant (e.g. `svgl-dark`, `devicon-wordmark`, `simple-icons-mono`) |
| `/i/<slug>/<variant>/<size>.png` | A specific variant as PNG |
| `/i/<slug>.json` | Metadata and the list of variants |
| `/search.json`, `/icons.json` | The full index |

```md
![Docker](https://coolicon.falak.sh/i/docker.svg)
```
```html
<img src="https://coolicon.falak.sh/i/docker/64.png" alt="Docker" width="32" height="32">
```

Slugs are lowercase alphanumeric (`nodejs`, `nextjs`, `githubactions`, `cplusplus`). To find one, search at
[coolicon.falak.sh](https://coolicon.falak.sh) or open `/icon/<slug>` for previews and copy-paste snippets.
Responses have open CORS headers, so you can hotlink the files.

**AI agents:** read [`/llms.txt`](https://coolicon.falak.sh/llms.txt). To work on this repo, see [AGENTS.md](AGENTS.md).

## Develop

```bash
npm ci
node scripts/build.mjs          # fetches all sources, writes dist/ (~900 MB), renders PNGs
node scripts/check.mjs
docker build -t cool-icons . && docker run -p 8088:3000 cool-icons   # http://localhost:8088
```

The site is deployed on [Falak](https://falak.sh) (`falak.yaml`). A push to `main` redeploys it.

## License

The code is [MIT](LICENSE). The icons keep their source's license (CC0, MIT, or the brand owner's terms), recorded per variant
in `/i/<slug>.json`. All logos are trademarks of their respective owners: follow each owner's brand guidelines.
