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
  <div class="flex min-w-[64px] flex-col items-center rounded-xl border border-haze/15 bg-white/[0.03] px-3 py-3 sm:min-w-[84px] sm:px-5">
    <span data-unit={unit} class="font-mono text-3xl font-semibold tabular-nums sm:text-5xl">
      --
    </span>
    <span class="mt-1 text-[10px] uppercase tracking-[0.25em] text-white/45">{label}</span>
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
      <div class="mt-2 h-3 overflow-hidden rounded-full bg-white/[0.06]">
        <div
          class={`h-full rounded-full ${bar.highlight ? 'bg-accent' : 'bg-haze/40'}`}
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
    <div class="mx-auto w-full max-w-site px-6 pb-28 pt-32">
      {/* Header + countdown */}
      <header class="text-center">
        <p class="font-mono text-[11px] uppercase tracking-[0.4em] text-haze/70">IPO Mission Control</p>
        <h1 class="mt-5 text-balance text-4xl font-semibold tracking-tightest text-glow sm:text-6xl">
          The largest IPO in history
        </h1>
        <p class="mx-auto mt-5 max-w-2xl leading-relaxed text-white/65">
          SpaceX lists on the Nasdaq as <span class="font-mono text-white">SPCX</span>. Here is the
          public picture of the offering, visualized — figures from reporting, not a trading terminal.
        </p>
      </header>

      <div
        data-countdown={IPO_OPEN_UTC}
        class="panel mx-auto mt-12 flex max-w-2xl flex-col items-center rounded-3xl p-8"
      >
        <p class="text-[11px] uppercase tracking-[0.3em] text-white/45">T-minus to the open</p>
        <div class="mt-5 flex items-center gap-2 sm:gap-3">
          <CountdownUnit unit="days" label="Days" />
          <CountdownUnit unit="hours" label="Hrs" />
          <CountdownUnit unit="mins" label="Min" />
          <CountdownUnit unit="secs" label="Sec" />
        </div>
        <p class="mt-5 font-mono text-xs text-haze/70">{IPO_OPEN_LABEL}</p>
      </div>

      {/* Headline facts */}
      <div class="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {HEADLINE_FACTS.map((f) => (
          <div class="panel rounded-2xl p-5">
            <p class="text-[10px] uppercase tracking-[0.2em] text-white/45">{f.label}</p>
            <p class="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{f.value}</p>
            {f.detail ? <p class="mt-1 text-xs text-white/50">{f.detail}</p> : null}
          </div>
        ))}
      </div>

      {/* Two charts */}
      <div class="mt-8 grid gap-4 md:grid-cols-2">
        <section class="panel rounded-3xl p-7">
          <h2 class="text-lg font-semibold">Biggest IPO ever, by capital raised</h2>
          <p class="mt-1 text-sm text-white/50">Reported deal size vs. the prior records.</p>
          <div class="mt-6 space-y-5">
            {RAISE_BARS.map((b) => (
              <BarRow bar={b} max={raiseMax} />
            ))}
          </div>
        </section>

        <section class="panel rounded-3xl p-7">
          <h2 class="text-lg font-semibold">Valuation, for scale</h2>
          <p class="mt-1 text-sm text-white/50">Market value at the offer price.</p>
          <div class="mt-6 space-y-5">
            {VALUATION_BARS.map((b) => (
              <BarRow bar={b} max={valMax} />
            ))}
          </div>
          <div class="mt-7 border-t border-haze/10 pt-5">
            <p class="text-sm text-white/70">Demand vs. the raise</p>
            <div class="mt-3 flex items-end gap-4">
              <div>
                <p class="font-mono text-3xl font-semibold text-accent">{OVERSUBSCRIPTION.multiple}</p>
                <p class="text-xs text-white/45">oversubscribed</p>
              </div>
              <div class="flex-1">
                <div class="h-3 overflow-hidden rounded-full bg-white/[0.06]">
                  <div class="h-full rounded-full bg-accent" style={`width:${overPct}%`} />
                </div>
                <p class="mt-1.5 text-xs text-white/40">
                  ${OVERSUBSCRIPTION.raise}B sought · &gt;${OVERSUBSCRIPTION.demand}B in demand
                </p>
              </div>
            </div>
          </div>
        </section>
      </div>

      {/* Context */}
      <section class="panel mt-8 rounded-3xl p-8">
        <h2 class="text-lg font-semibold">Why the demand</h2>
        <p class="mt-3 max-w-3xl leading-relaxed text-white/70">{IPO_CONTEXT}</p>
        <div class="mt-6 flex flex-wrap gap-3 text-sm">
          <a href="/starlink" class="rounded-full border border-haze/20 px-4 py-2 text-white/80 hover:border-haze/45 hover:text-white">
            See the Starlink mesh →
          </a>
          <a href="/spacex-ai" class="rounded-full border border-haze/20 px-4 py-2 text-white/80 hover:border-haze/45 hover:text-white">
            Space × AI →
          </a>
          <a href="/mars" class="rounded-full border border-haze/20 px-4 py-2 text-white/80 hover:border-haze/45 hover:text-white">
            On to Mars →
          </a>
        </div>
      </section>

      {/* Sources + disclaimer */}
      <footer class="mt-10 rounded-2xl border border-haze/10 bg-white/[0.02] p-6 text-xs leading-relaxed text-white/45">
        <p class="font-semibold text-white/60">Sources</p>
        <p class="mt-2">
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
