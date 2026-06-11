import type { FC } from 'hono/jsx'
import { DEFAULTS, simulate, curvePath, SELF_SUSTAINING, MAX_FLIGHTS_PER_WINDOW, HORIZON } from '../lib/marsModel'

// SSR renders the DEFAULT scenario completely (numbers + curve), so the page
// works and reads without JavaScript. /assets/simulator.js re-runs the same
// shared model on input and keeps the URL shareable.

const WINDOW_CHOICES = [2031, 2033, 2035]

const Slider: FC<{
  name: string
  label: string
  min: number
  max: number
  step: number
  value: number
  display: string
}> = ({ name, label, min, max, step, value, display }) => (
  <label class="block">
    <span class="flex items-baseline justify-between">
      <span class="text-sm text-white/70">{label}</span>
      <output data-out={name} class="font-mono text-sm tabular-nums text-white">
        {display}
      </output>
    </span>
    <input
      type="range"
      name={name}
      min={String(min)}
      max={String(max)}
      step={String(step)}
      value={String(value)}
      class="mt-3 block h-1.5 w-full cursor-pointer appearance-none rounded-full bg-white/10 accent-accent"
    />
  </label>
)

export const MarsSimulator: FC = () => {
  const d = simulate(DEFAULTS)
  const path = curvePath(d.curve)
  const x1 = d.curve[d.curve.length - 1].year

  return (
    <section id="simulator" class="border-t border-white/10 pt-10" data-reveal data-sim>
      <h2 class="font-display text-2xl font-semibold tracking-tight">The settlement simulator</h2>
      <p class="mt-4 max-w-2xl leading-relaxed text-white/65">
        Set the fleet, watch the math. A toy model with every assumption on
        screen: transfer windows every 26 months, production capped at{' '}
        {MAX_FLIGHTS_PER_WINDOW.toLocaleString('en-US')} ships per window, and
        self-sustaining defined as a city of one million.
      </p>

      <div class="mt-10 grid gap-10 lg:grid-cols-12">
        {/* Controls */}
        <form class="space-y-7 lg:col-span-5" data-sim-form>
          <fieldset>
            <legend class="text-sm text-white/70">First crewed window</legend>
            <div class="mt-3 flex gap-2">
              {WINDOW_CHOICES.map((y) => (
                <label class="cursor-pointer">
                  <input
                    type="radio"
                    name="w"
                    value={String(y)}
                    checked={y === DEFAULTS.firstYear}
                    class="peer sr-only"
                  />
                  <span class="block rounded-full border border-white/15 px-4 py-1.5 font-mono text-sm text-white/70 transition-colors peer-checked:border-white peer-checked:bg-white peer-checked:text-space">
                    {y}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <Slider name="f" label="Flights in the first window" min={5} max={100} step={5} value={DEFAULTS.flights0} display={String(DEFAULTS.flights0)} />
          <Slider name="g" label="Fleet growth per window" min={0} max={100} step={5} value={DEFAULTS.fleetGrowth * 100} display={`+${Math.round(DEFAULTS.fleetGrowth * 100)}%`} />
          <Slider name="s" label="Settlers per ship" min={20} max={200} step={10} value={DEFAULTS.perShip} display={String(DEFAULTS.perShip)} />
          <Slider name="p" label="Population growth on Mars" min={0} max={3} step={0.1} value={DEFAULTS.popGrowth * 100} display={`${(DEFAULTS.popGrowth * 100).toFixed(1)}%/yr`} />
        </form>

        {/* Result */}
        <div class="lg:col-span-7" aria-live="polite">
          <p data-sim-headline class="text-sm text-white/50">
            Self-sustaining by
          </p>
          <p
            data-sim-year
            class="mt-1 font-display text-6xl font-semibold tracking-tightest text-white sm:text-7xl"
          >
            {d.year ?? `${HORIZON}+`}
          </p>

          <svg
            viewBox="0 0 100 44"
            preserveAspectRatio="none"
            class="mt-8 h-40 w-full"
            role="img"
            aria-label="Mars population over time"
          >
            <line x1="0" y1="2" x2="100" y2="2" stroke="rgba(255,255,255,0.14)" stroke-width="0.3" stroke-dasharray="1.6 1.6" />
            <path data-sim-area d={`${path} L100 44 L0 44 Z`} fill="rgba(27,156,255,0.10)" stroke="none" />
            <path
              data-sim-path
              d={path}
              fill="none"
              stroke="#1b9cff"
              stroke-width="0.8"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <div class="mt-2 flex items-baseline justify-between font-mono text-[11px] text-white/40">
            <span data-sim-x0>{DEFAULTS.firstYear}</span>
            <span>{SELF_SUSTAINING.toLocaleString('en-US')} people at the dashed line</span>
            <span data-sim-x1>{Math.ceil(x1)}</span>
          </div>

          <div class="mt-8 grid grid-cols-3 border-y border-white/10 sm:divide-x sm:divide-white/10">
            <div class="px-1 py-5 sm:px-6 sm:first:pl-0">
              <p data-sim-people class="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                {d.pop.toLocaleString('en-US')}
              </p>
              <p class="mt-1 text-xs text-white/50">people on Mars</p>
            </div>
            <div class="px-1 py-5 sm:px-6">
              <p data-sim-flights class="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                {d.flights.toLocaleString('en-US')}
              </p>
              <p class="mt-1 text-xs text-white/50">Starship flights flown</p>
            </div>
            <div class="px-1 py-5 sm:px-6">
              <p data-sim-first class="font-display text-xl font-semibold tracking-tight sm:text-2xl">
                {DEFAULTS.firstYear}
              </p>
              <p class="mt-1 text-xs text-white/50">first boots on Mars</p>
            </div>
          </div>

          <p class="mt-5 text-xs leading-relaxed text-white/40">
            Assumptions over forecasts: immigration plus natural growth, no
            attrition, and a clean production ramp. Drag the sliders and the
            URL updates, so any scenario is shareable.
          </p>
        </div>
      </div>
    </section>
  )
}
