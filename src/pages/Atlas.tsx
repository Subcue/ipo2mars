import type { FC } from 'hono/jsx'

// SSR shell for the interactive atlas. The experience itself is the
// /assets/atlas.js island mounted on #atlas (see Layout). This block is the
// crawlable, no-JS fallback: it sits at the bottom of the viewport and the
// island hides it once WebGL is up (display gated via .atlas-ready).
export const Atlas: FC = () => (
  <section class="atlas-fallback pointer-events-auto fixed inset-x-0 bottom-0 z-10 mx-auto max-w-2xl px-6 pb-8 text-center">
    <h1 class="sr-only">The ipo2mars atlas: an interactive 3D map of SpaceX's future</h1>
    <p class="text-sm leading-relaxed text-white/55">
      An interactive 3D stage: Earth wrapped in the live Starlink constellation,
      the Moon and Mars with their future bases, and Starships in flight.
      Select a destination and the camera flies there.
    </p>
    <p class="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-sm">
      <a href="/starlink" class="text-accent hover:underline">Starlink</a>
      <a href="/moon" class="text-accent hover:underline">The Moon</a>
      <a href="/mars" class="text-accent hover:underline">Mars</a>
      <a href="/spacex-ipo" class="text-accent hover:underline">The IPO</a>
    </p>
  </section>
)
