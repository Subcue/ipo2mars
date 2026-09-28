# ipo2mars

**IPO is not the destination. It's the launchpad.**

An open-source, interactive 3D atlas of SpaceX — from reusable rockets and the **live Starlink constellation** to a record-breaking IPO, orbital AI, and a self-sustaining city on Mars.

> ⚠️ **Unofficial fan project.** Not affiliated with, endorsed by, or sponsored by SpaceX, Starlink, xAI, Tesla, or Elon Musk. Nothing here is investment advice. All figures cite public reporting.

![ipo2mars atlas: a Starship lifting off at Starbase, the tower catching the booster, a tanker docked to a depot above Earth, and the city on Mars](docs/preview.png)

**Live:** https://ipo2mars.com · **Built in public** for the SpaceX (SPCX) listing.

---

## What's inside

- 🧭 **The atlas (`/atlas`)** — a full-screen interactive stage: pick a stop and the camera flies there (zoom out, travel, zoom in), with shareable deep links (`/atlas?focus=starbase`), or press **▶ Mission** to play the whole story from launch to Mars.
  - **Starbase** — the launch site at Boca Chica, from a telephoto lens across the flats: the fueled stack venting and frosting over, ignition, 33 Raptors lifting it off through billowing exhaust clouds, the climb east over the Gulf, hot staging far overhead, then the booster flying home on its landing burn and the tower's chopsticks catching it, setting it down, catching the ship after its belly-flop and flip, and stacking it again. Jump to any moment (liftoff, booster catch, ship catch, restack) from the info card. A ground-level sky with real scale heights, drifting cumulus, surf on the Gulf and a flooded tidal flat.
  - **Orbital refueling** — 450 km up over the day side: a tanker comes in tail-first on cold-gas thrusters, docks aft-to-aft with a propellant depot, pumps its load across (frost creeps over the depot's tanks), undocks, yaws away and burns for home. Earth below with a real-scale, razor-thin blue limb and cloud fields sharpened with procedural detail.
  - **Earth** with physically based atmospheric scattering, ocean glint, cloud shadows, city lights on the night side, the live Starlink shell, and an ascent streak climbing out of Starbase over the Gulf.
  - **The Moon** — an outpost built on Starship landers: one comes down on the thrusters mounted high on its hull, spraying regolith ballistically across the ground, sits, and lifts off again. A two-kilometre mass driver flings payloads over the horizon, solar towers stand in a row, and the Earth hangs over the rim.
  - **Mars** — a city and its starport: a fleet of Starships on the pads (one landing, one lifting off for home), a geodesic glass dome over a park, habitats and buried modules, greenhouses, a solar farm, propellant plants and a tank farm, an open-pit mine, a tunnel portal and reactors, under a butterscotch sky with a crater rim on the horizon.
  - **The fleet** — Starships leave for Mars together when the transfer window opens: the chase camera flies with a convoy of them, and the overview route carries a stream of hundreds more.
- 🌍 **Live Starlink hero** — a textured Earth wrapped in the real Starlink constellation. Every dot is an actual satellite, placed from public [CelesTrak](https://celestrak.org) orbital data and propagated in your browser with SGP4.
- 🚀 **IPO Mission Control** — a live countdown to the Nasdaq open, the $1.77T valuation, the $75B raise, and the demand-vs-raise oversubscription, every figure sourced and dated.
- 🛰️ **The Starlink mesh** — what the constellation is, and why it's the revenue engine under the IPO story.
- 🤖 **Space × AI** — what the SpaceX × xAI merger really means today, and what's still speculative (clearly labeled).
- 🌕 **The Moon, first** — where Starship HLS fits in the Artemis return: the docking demo, the first crewed landing targeted for Artemis IV, and why every lunar milestone is a dress rehearsal for Mars. (The hero scene has a slowly orbiting Moon, too.)
- 🔴 **Mars** — transfer windows, Starship cadence, and the arc toward a city of a million people. Includes the interactive settlement simulator: set the fleet, see when a city of a million becomes self-sustaining.

## How it works

One Cloudflare Worker, two cleanly separated rendering paths:

- **Hono JSX SSR** renders every page as real server HTML — full text content, per-page JSON-LD, OpenGraph, `llms.txt`, `robots.txt`, `sitemap.xml`. Great for search and AI engines; the 3D is pure progressive enhancement.
- **A React + React Three Fiber island** (bundled separately by esbuild → `public/assets/scene.js`) mounts the WebGL Earth/constellation as a fixed backdrop on the home page only. Content pages get a lightweight CSS starfield instead — no 1MB bundle on your SEO pages.
- The worker **proxies and caches the CelesTrak TLE feed in KV** (with a cron warmer), so the browser fetches same-origin and CelesTrak is never hammered.

```
Browser ──/──▶ Hono Worker (SSR HTML) ──▶ #scene <div>
                     │                          ▲
                     └─/api/tle/starlink─▶ KV ──┘  scene.js (React/R3F) propagates
                                  │                 satellites with satellite.js
                              CelesTrak (cron-warmed)
```

## Tech stack

[Cloudflare Workers](https://workers.cloudflare.com) · [Hono](https://hono.dev) (`hono/jsx` SSR) · [React 19](https://react.dev) · [React Three Fiber](https://r3f.docs.pmnd.rs) + [drei](https://github.com/pmndrs/drei) · [three.js](https://threejs.org) · [satellite.js](https://github.com/shashwatak/satellite-js) · [Blender](https://www.blender.org) (asset pipeline) · [Tailwind CSS](https://tailwindcss.com) · esbuild

No postprocessing: glows are sprites and shader terms, so nothing can bloom-flicker.

## Run locally

```bash
npm install
npm run dev          # wrangler dev → http://localhost:8787
# in a second terminal, for live rebuilds while you edit:
npm run dev:client   # rebuild the R3F island on change
npm run dev:css      # rebuild Tailwind on change
```

`npm run build` produces `public/styles.css` + `public/assets/*.js`. `npm run typecheck` checks both the worker (`hono/jsx`) and the client (`react`) projects.

## Project structure

```
src/
  index.tsx          Hono worker: routes, SSR, /api, cron warmer
  pages/             Hono JSX SSR pages (Home, SpacexIpo, Starlink, SpacexAi, Moon, Mars)
  components/        Layout, Footer, Article (shared SSR UI)
  lib/               tle.ts (CelesTrak + KV), seo.ts (JSON-LD)
  data/              site.ts, ipo.ts (facts with source + lastVerified)
  routes/api.ts      /api/tle/starlink
  client/            React + R3F islands (built separately by esbuild)
    scene/           Earth (day/night/glint), Starlink glints, Moon, scattering Atmosphere, Experience
    atlas/           /atlas experience:
      render/          sky (stars + Milky Way), ground-level skies, sun, env lighting, GLB materials, procedural textures
      planets/         Earth/Moon/Mars bodies with procedural surface detail
      terrain/         displaced terrain patches, boulders, baked ground detail, horizon ridges
      bases/           settlement layouts (shared with Blender), structures, landings, the mass driver
      starbase/        the launch site: coast and ground, the launch-and-catch sequence, exhaust clouds
      orbit/           ship-to-ship refueling in low orbit
      ships/           transit Starships and the fleet, plumes, the cycler route, the Earth launch streak
      ui/              dock, info card with live status, map labels, the mission tour
    countdown.ts     tiny vanilla countdown
public/textures/     planet maps (NASA-derived public domain + CC BY 4.0 Mars)
```

## Data sources & credits

- **Orbital data:** [CelesTrak](https://celestrak.org) Starlink GP/TLE feed (public).
- **Earth & Moon textures:** NASA-derived imagery (public domain), via the three.js examples.
- **Mars texture:** [Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0).
- **Surface-detail maps:** [ambientCG](https://ambientcg.com) brushed-steel normal map (CC0 / public domain), applied to the hulls at load (`src/client/atlas/render/materials.ts`). Everything else is procedural: heat-shield tiles, solar cells, landing pads, crater fields and terrain are generated in the browser.
- **Vehicles, launch site & bases:** original stylized designs, not official SpaceX models or site plans. Built procedurally with Blender: `tools/blender/build_assets.py` regenerates every GLB in `public/models/` (`blender --background --factory-startup --python tools/blender/build_assets.py`, or `-- starbase booster` for just some), laid out from `src/client/atlas/bases/layout.json`, which the app reads too.
- **IPO figures:** public reporting (CNBC and others), each carrying a `source` + `lastVerified` in [`src/data/ipo.ts`](src/data/ipo.ts).

## Contributing

This is built in public and contributions are very welcome — especially:

- 🔴 **Extending the settlement simulator** (attrition, cargo splits, Monte Carlo on `src/lib/marsModel.ts`).
- 🌐 **Internationalization** of the SSR pages.
- ⚡ **Perf** — move SGP4 propagation into a Web Worker; trim the R3F bundle.
- 🛰️ **Starlink coverage/latency modes** on a dedicated 3D view.

See [CONTRIBUTING.md](CONTRIBUTING.md). Good first issues are tagged in the tracker.

## Disclaimer

ipo2mars is an unofficial, open-source visualization project for educational and commentary purposes. It is **not affiliated with, endorsed by, or sponsored by** SpaceX, Starlink, xAI, Tesla, or Elon Musk, and uses no official logos. Nothing on the site is **investment advice**. Trademarks belong to their respective owners.

## License

Code: [MIT](LICENSE). Content & visualizations: CC BY 4.0.
