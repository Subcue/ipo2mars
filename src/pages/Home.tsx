import type { FC } from 'hono/jsx'
import { SITE } from '../data/site'

const SECTIONS = [
  {
    href: '/spacex-ipo',
    eyebrow: 'The launchpad',
    title: 'A $1.77 trillion IPO',
    body: 'SpaceX lists on the Nasdaq as SPCX — the largest IPO in history, several times the size of Saudi Aramco’s record. We visualize the valuation, the demand, and the countdown to the open.',
  },
  {
    href: '/starlink',
    eyebrow: 'Low Earth orbit',
    title: 'A live Starlink constellation',
    body: 'Thousands of satellites, propagated in real time from public CelesTrak orbital data, wrapping the planet in a mesh that already serves nine million subscribers.',
  },
  {
    href: '/spacex-ai',
    eyebrow: 'Orbital compute',
    title: 'Space × AI',
    body: 'With xAI now inside SpaceX, the story stretches from rockets to data centers in orbit. We map what is real today and what is still a future scenario.',
  },
  {
    href: '/moon',
    eyebrow: 'The proving ground',
    title: 'The Moon, first',
    body: 'Artemis II just carried humans around the Moon again — and SpaceX’s Starship HLS is the contracted lander for the first crewed landing since Apollo. Every lunar milestone is a dress rehearsal for Mars.',
  },
  {
    href: '/mars',
    eyebrow: 'The destination',
    title: 'A self-sustaining Mars city',
    body: 'Earth-to-Mars transfer windows, Starship cadence, and the long arc toward a city of a million people. The IPO is not the destination — it is the launchpad.',
  },
]

export const Home: FC = () => (
  <>
    {/* Hero — text overlaid on the fixed 3D Earth/constellation backdrop. */}
    <section class="relative flex min-h-[100svh] flex-col items-center justify-center px-6 text-center">
      <div class="hero-scrim pointer-events-none absolute inset-0" aria-hidden="true" />
      <div class="relative z-10 flex flex-col items-center">
        <p class="animate-fade-up font-mono text-[11px] uppercase tracking-[0.4em] text-haze/70">
          Unofficial · Open Source · Not investment advice
        </p>
        <h1 class="animate-fade-up mt-6 max-w-4xl text-balance text-4xl font-semibold leading-[1.05] tracking-tightest text-glow sm:text-6xl md:text-7xl">
          {SITE.tagline}
        </h1>
        <p class="animate-fade-up mt-7 max-w-xl text-base leading-relaxed text-white/75 sm:text-lg">
          An open-source 3D atlas of SpaceX — from reusable rockets and the live
          Starlink constellation to a record IPO, orbital AI, and a city on Mars.
        </p>
        <div class="animate-fade-up mt-10 flex flex-wrap items-center justify-center gap-3">
          <a
            href="/spacex-ipo"
            class="rounded-full bg-accent px-6 py-3 text-sm font-semibold text-space transition-transform hover:scale-[1.03]"
          >
            Enter the atlas
          </a>
          <a
            href={SITE.repo}
            rel="noopener noreferrer"
            class="rounded-full border border-haze/25 px-6 py-3 text-sm font-medium text-white/85 transition-colors hover:border-haze/50 hover:text-white"
          >
            ★ Star on GitHub
          </a>
        </div>
      </div>
      <div class="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 text-xs uppercase tracking-[0.3em] text-white/40">
        Scroll ↓
      </div>
    </section>

    {/* Narrative teasers — real SSR copy so the page has content for search and
        AI engines even before the interactive modules land. */}
    <div class="mx-auto w-full max-w-site px-6 pb-24">
      {SECTIONS.map((s, i) => (
        <section class="flex min-h-[70vh] items-center">
          <a
            href={s.href}
            class={`panel group block w-full max-w-xl rounded-3xl p-8 transition-colors hover:border-haze/30 sm:p-10 ${
              i % 2 === 1 ? 'ml-auto' : ''
            }`}
          >
            <p class="font-mono text-[11px] uppercase tracking-[0.3em] text-haze/70">
              {String(i + 1).padStart(2, '0')} · {s.eyebrow}
            </p>
            <h2 class="mt-4 text-2xl font-semibold tracking-tight sm:text-3xl">{s.title}</h2>
            <p class="mt-4 leading-relaxed text-white/65">{s.body}</p>
            <span class="mt-6 inline-block text-sm font-medium text-accent transition-transform group-hover:translate-x-1">
              Explore →
            </span>
          </a>
        </section>
      ))}
    </div>
  </>
)
