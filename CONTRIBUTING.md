# Contributing to ipo2mars

Thanks for wanting to help build the map from IPO to Mars. This is a build-in-public project — issues, ideas, and PRs are all welcome.

## Getting started

```bash
git clone https://github.com/Subcue/ipo2mars.git
cd ipo2mars
npm install
npm run dev          # wrangler dev → http://localhost:8787
```

For a fast inner loop while editing the 3D scene or styles, run these in extra terminals:

```bash
npm run dev:client   # esbuild rebuilds the React/R3F island on change
npm run dev:css      # Tailwind rebuilds on change
```

Before opening a PR:

```bash
npm run typecheck    # checks the worker (hono/jsx) AND the client (react)
npm run build        # ensure the production build is clean
```

## Architecture in one minute

- **Two JSX worlds, two builds.** The worker (`src/index.tsx` and everything under `src/` except `src/client/`) is `hono/jsx`, bundled by wrangler. The client island (`src/client/`) is React, bundled by esbuild into `public/assets/`. They never share a build, so the two JSX runtimes never collide. Client files start with `/** @jsxImportSource react */`.
- **SSR first.** Every page must render real text server-side — view source and you should see the content, not an empty `<div>`. The 3D is progressive enhancement.
- **Facts carry sources.** Anything quantitative about the IPO lives in `src/data/ipo.ts` with a `source` + `lastVerified`. Keep that discipline — it's what lets us stay credible and compliant.

## Good first issues

- **Extend the settlement simulator** on `/mars`: attrition, cargo-vs-crew splits, ISRU milestones, or a Monte Carlo mode on top of the shared model in `src/lib/marsModel.ts`.
- **i18n** — the SSR pages are English-only; a locale layer (à la a `?lang=` or path prefix) would open up the content.
- **Perf** — move SGP4 propagation into a Web Worker so the constellation never janks the main thread; code-split the R3F bundle.
- **Starlink modes** — a dedicated `/starlink` 3D view with coverage / latency / direct-to-cell overlays.

## Ground rules

- Keep it **unofficial and compliant**: no official SpaceX/Starlink/NASA logos as project branding, no "buy now" / price targets / "guaranteed returns", and keep the "not investment advice" framing intact.
- Match the surrounding code style. No giant dependencies for small wins — the worker's only runtime dependency is Hono.
- Self-made or public-domain assets only. Credit sources.

## Deploys

Production deploys happen automatically via the **Cloudflare Workers Builds GitHub integration** on push to `main` — please don't `wrangler deploy` from your machine. `wrangler dev` is for local only.
