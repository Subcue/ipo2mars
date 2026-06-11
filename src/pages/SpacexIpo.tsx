import type { FC } from 'hono/jsx'
import {
  IPO_OPEN_UTC,
  IPO_OPEN_LABEL,
  HEADLINE_FACTS,
  RAISE_BARS,
  VALUATION_BARS,
  OVERSUBSCRIPTION,
  IPO_CONTEXT,
  type Bar,
} from '../data/ipo'

const CountdownUnit: FC<{ unit: string; label: string }> = ({ unit, label }) => (
  <div class="flex min-w-[64px] flex-col items-center rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-3 sm:min-w-[84px] sm:px-5">
    <span data-unit={unit} class="font-mono text-3xl font-medium tabular-nums sm:text-5xl">
      --
    </span>
    <span class="mt-1.5 text-[10px] uppercase tracking-[0.2em] text-white/45">{label}</span>
  </div>
)

const BarRow: FC<{ bar: Bar; max: number }> = ({ bar, max }) => {
  const pct = Math.max(4, Math.round((bar.amount / max) * 100))
  return (
    <div>
      <div class="flex items-baseline justify-between gap-3">
        <span class={`text-sm ${bar.highlight ? 'font-semibold text-accent' : 'text-white/80'}`}>
          {bar.name}
        </span>
        <span class="font-mono text-sm tabular-nums">{`$${bar.amount}${bar.unit.slice(1)}`}</span>
      </div>
      <div class="mt-2 h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          class={`h-full rounded-full ${bar.highlight ? 'bg-accent' : 'bg-haze/35'}`}
          style={`width:${pct}%`}
        />
      </div>
      <p class="mt-1.5 text-xs text-white/40">{bar.sub}</p>
    </div>
  )
}

export const SpacexIpo: FC = () => {
  const raiseMax = Math.max(...RAISE_BARS.map((b) => b.amount))
  const valMax = Math.max(...VALUATION_BARS.map((b) => b.amount))
  const overPct = Math.round((OVERSUBSCRIPTION.raise / OVERSUBSCRIPTION.demand) * 100)

  return (
    <div class="mx-auto w-full max-w-site px-6 pb-28 pt-36">
      <header class="mx-auto max-w-3xl text-center" data-reveal>
        <h1 class="text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tightest sm:text-6xl">
          The largest IPO in history
        </h1>
        <p class="mx-auto mt-6 max-w-2xl leading-relaxed text-white/60">
          SpaceX lists on the Nasdaq as <span class="font-mono text-white">SPCX</span>. This is the
          public picture of the offering, visualized from reporting. It is not a trading terminal.
        </p>
      </header>

      <div
        data-countdown={IPO_OPEN_UTC}
        data-live-label="SPCX is trading on the Nasdaq"
        class="mx-auto mt-14 flex max-w-2xl flex-col items-center rounded-2xl border border-white/10 bg-white/[0.02] p-8"
        data-reveal
      >
        <p data-count-label class="text-[11px] uppercase tracking-[0.22em] text-white/45">
          T-minus to the open
        </p>
        <div class="mt-5 flex items-center gap-2 sm:gap-3">
          <CountdownUnit unit="days" label="Days" />
          <CountdownUnit unit="hours" label="Hrs" />
          <CountdownUnit unit="mins" label="Min" />
          <CountdownUnit unit="secs" label="Sec" />
        </div>
        <p class="mt-5 font-mono text-xs text-haze/70">{IPO_OPEN_LABEL}</p>
      </div>

      {/* Headline facts as a hairline strip */}
      <div
        class="mt-14 grid grid-cols-2 border-y border-white/10 md:grid-cols-4 md:divide-x md:divide-white/10"
        data-reveal
      >
        {HEADLINE_FACTS.map((f) => (
          <div class="px-2 py-8 md:px-8 md:first:pl-0">
            <p class="text-xs text-white/45">{f.label}</p>
            <p class="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl">{f.value}</p>
            {f.detail ? <p class="mt-1 text-xs text-white/50">{f.detail}</p> : null}
          </div>
        ))}
      </div>

      {/* Charts */}
      <div class="mt-20 grid gap-14 md:grid-cols-2" data-reveal>
        <section>
          <h2 class="font-display text-xl font-semibold tracking-tight">
            Biggest IPO ever, by capital raised
          </h2>
          <p class="mt-1 text-sm text-white/50">Reported deal size against the prior records.</p>
          <div class="mt-7 space-y-6">
            {RAISE_BARS.map((b) => (
              <BarRow bar={b} max={raiseMax} />
            ))}
          </div>
        </section>

        <section>
          <h2 class="font-display text-xl font-semibold tracking-tight">Valuation, for scale</h2>
          <p class="mt-1 text-sm text-white/50">Market value at the offer price.</p>
          <div class="mt-7 space-y-6">
            {VALUATION_BARS.map((b) => (
              <BarRow bar={b} max={valMax} />
            ))}
          </div>
          <div class="mt-8 border-t border-white/10 pt-6">
            <p class="text-sm text-white/70">Demand against the raise</p>
            <div class="mt-3 flex items-end gap-4">
              <div>
                <p class="font-display text-3xl font-semibold text-accent">
                  {OVERSUBSCRIPTION.multiple}
                </p>
                <p class="text-xs text-white/45">oversubscribed</p>
              </div>
              <div class="flex-1">
                <div class="h-2.5 overflow-hidden rounded-full bg-white/[0.06]">
                  <div class="h-full rounded-full bg-accent" style={`width:${overPct}%`} />
                </div>
                <p class="mt-1.5 text-xs text-white/40">
                  ${OVERSUBSCRIPTION.raise}B sought, more than ${OVERSUBSCRIPTION.demand}B in demand
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Context */}
      <section class="mt-20 border-t border-white/10 pt-10" data-reveal>
        <h2 class="font-display text-xl font-semibold tracking-tight">Why the demand</h2>
        <p class="mt-4 max-w-3xl leading-relaxed text-white/65">{IPO_CONTEXT}</p>
        <div class="mt-7 flex flex-wrap gap-3 text-sm">
          <a
            href="/starlink"
            class="rounded-full border border-white/15 px-4 py-2 text-white/80 transition-colors hover:border-white/40 hover:text-white"
          >
            See the Starlink mesh →
          </a>
          <a
            href="/spacex-ai"
            class="rounded-full border border-white/15 px-4 py-2 text-white/80 transition-colors hover:border-white/40 hover:text-white"
          >
            Space × AI →
          </a>
          <a
            href="/mars"
            class="rounded-full border border-white/15 px-4 py-2 text-white/80 transition-colors hover:border-white/40 hover:text-white"
          >
            On to Mars →
          </a>
        </div>
      </section>

      {/* Sources + disclaimer */}
      <footer class="mt-16 border-t border-white/10 pt-6 text-xs leading-relaxed text-white/45" data-reveal>
        <p>
          Figures from public reporting (
          <a href={HEADLINE_FACTS[0].url} rel="noopener noreferrer" class="text-haze/80 underline">
            CNBC
          </a>
          ), last verified {HEADLINE_FACTS[0].lastVerified}. Numbers reflect the reported offering and
          may change at final pricing.
        </p>
        <p class="mt-3">
          This page is an unofficial, educational visualization of public information. It is not
          affiliated with SpaceX and is <span class="text-white/70">not investment advice</span>.
        </p>
      </footer>
    </div>
  )
}
