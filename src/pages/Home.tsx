import type { FC } from 'hono/jsx'
import { SITE } from '../data/site'

// Each narrative section below the hero uses a DIFFERENT layout family:
// stat-row, asymmetric split, offset text, milestone columns, manifesto.
// The 3D globe owns the hero; below it the page settles onto solid ground.

const IPO_STATS = [
  { value: '$1.77T', label: 'valuation at the open' },
  { value: '$75B', label: 'raised on the Nasdaq' },
  { value: '3.5-4x', label: 'oversubscribed' },
  { value: 'SPCX', label: 'the ticker' },
]

const MOON_MILESTONES = [
  { when: 'Apr 2026', what: 'Artemis II crewed flyby, flown' },
  { when: 'NET 2027', what: 'Starship HLS docking demo' },
  { when: '~2028', what: 'First crewed landing, Artemis IV' },
]

export const Home: FC = () => (
  <>
    {/* Hero: text overlaid on the live 3D Earth + Starlink constellation. */}
    <section class="relative flex min-h-[100dvh] flex-col items-center justify-center px-6 text-center">
      <div class="hero-scrim pointer-events-none absolute inset-0" aria-hidden="true" />
      <div class="relative z-10 flex w-full flex-col items-center">
        <p class="animate-fade-up font-mono text-[11px] uppercase tracking-[0.3em] text-haze/70">
          Unofficial open source · Not investment advice
        </p>
        <h1 class="animate-fade-up mt-7 max-w-4xl text-balance font-display text-4xl font-semibold leading-[1.02] tracking-tightest text-glow sm:text-6xl md:text-7xl">
          {SITE.tagline}
        </h1>
        <p class="animate-fade-up mt-7 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
          An open-source 3D atlas of SpaceX: live Starlink orbits, a record IPO,
          the Moon, and a city on Mars.
        </p>
        <div class="animate-fade-up mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/spacex-ipo"
            class="rounded-full bg-white px-7 py-3 text-sm font-semibold text-space transition-transform hover:-translate-y-[1px]"
          >
            Enter the atlas
          </a>
          <a
            href={SITE.repo}
            rel="noopener noreferrer"
            class="rounded-full border border-white/15 px-7 py-3 text-sm font-medium text-white/85 transition-colors hover:border-white/40 hover:text-white"
          >
            Star on GitHub
          </a>
        </div>
      </div>
    </section>

    {/* Solid ground: the story continues on the page color, no glass cards. */}
    <div class="ground relative">
      <div class="mx-auto w-full max-w-site px-6">
        {/* 1 · The IPO, as a stat row */}
        <section class="pb-28 pt-40 md:pb-36 md:pt-56" data-reveal>
          <h2 class="max-w-3xl font-display text-3xl font-semibold tracking-tightest sm:text-5xl">
            The largest IPO in history
          </h2>
          <p class="mt-5 max-w-xl leading-relaxed text-white/60">
            SpaceX listed on the Nasdaq at a fixed $135 per share. Reported
            demand ran multiples past the raise.
          </p>
          <div class="mt-12 grid grid-cols-2 border-y border-white/10 md:grid-cols-4 md:divide-x md:divide-white/10">
            {IPO_STATS.map((s) => (
              <div class="px-2 py-8 md:px-8 md:first:pl-0">
                <p class="font-display text-3xl font-semibold tracking-tight sm:text-4xl">{s.value}</p>
                <p class="mt-2 text-sm text-white/50">{s.label}</p>
              </div>
            ))}
          </div>
          <a href="/spacex-ipo" class="mt-8 inline-block text-sm font-medium text-accent hover:underline">
            Open IPO Mission Control →
          </a>
        </section>

        {/* 2 · Starlink, asymmetric split */}
        <section
          class="grid items-end gap-10 border-t border-white/10 py-28 md:grid-cols-12 md:py-36"
          data-reveal
        >
          <div class="md:col-span-7">
            <p class="font-display text-6xl font-semibold tracking-tightest text-white sm:text-8xl">
              7,000<span class="text-accent">+</span>
            </p>
            <p class="mt-3 text-lg text-white/60">satellites in the constellation overhead</p>
          </div>
          <div class="md:col-span-5">
            <p class="leading-relaxed text-white/60">
              Every dot on the globe above is a real Starlink satellite, placed
              from public CelesTrak orbital data and propagated live in your
              browser.
            </p>
            <a href="/starlink" class="mt-5 inline-block text-sm font-medium text-accent hover:underline">
              See the live mesh →
            </a>
          </div>
        </section>

        {/* 3 · Space × AI, offset quiet block */}
        <section class="border-t border-white/10 py-28 md:py-36" data-reveal>
          <div class="md:ml-auto md:max-w-xl">
            <h2 class="font-display text-3xl font-semibold tracking-tightest sm:text-4xl">
              Space × AI
            </h2>
            <p class="mt-5 leading-relaxed text-white/60">
              Since the 2026 merger, xAI ships inside SpaceX. We map what that
              already means, and keep what is still speculation clearly labeled.
            </p>
            <a href="/spacex-ai" class="mt-5 inline-block text-sm font-medium text-accent hover:underline">
              The grounded version →
            </a>
          </div>
        </section>

        {/* 4 · The Moon, milestone columns */}
        <section class="border-t border-white/10 py-28 md:py-36" data-reveal>
          <h2 class="font-display text-3xl font-semibold tracking-tightest sm:text-4xl">
            The Moon, first
          </h2>
          <p class="mt-5 max-w-xl leading-relaxed text-white/60">
            Starship lands on the Moon before it points at Mars. Three dates
            anchor the program.
          </p>
          <div class="mt-12 grid gap-px overflow-hidden rounded-2xl border border-white/10 bg-white/10 sm:grid-cols-3">
            {MOON_MILESTONES.map((m) => (
              <div class="bg-space p-7">
                <p class="font-mono text-sm text-haze">{m.when}</p>
                <p class="mt-3 text-[15px] leading-relaxed text-white/75">{m.what}</p>
              </div>
            ))}
          </div>
          <a href="/moon" class="mt-8 inline-block text-sm font-medium text-accent hover:underline">
            Why the Moon is the dress rehearsal →
          </a>
        </section>

        {/* 5 · Mars, closing manifesto */}
        <section class="border-t border-white/10 py-32 text-center md:py-44" data-reveal>
          <h2 class="mx-auto max-w-3xl text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tightest sm:text-6xl">
            Mars is the business plan.
          </h2>
          <p class="mx-auto mt-6 max-w-xl leading-relaxed text-white/60">
            Transfer windows, Starship cadence, and the long arc to a
            self-sustaining city. The IPO pays for the ships.
          </p>
          <a
            href="/mars"
            class="mt-10 inline-block rounded-full bg-white px-7 py-3 text-sm font-semibold text-space transition-transform hover:-translate-y-[1px]"
          >
            Read the Mars plan
          </a>
        </section>
      </div>
    </div>
  </>
)
