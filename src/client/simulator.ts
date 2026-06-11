// Mars settlement simulator island. Vanilla: reads the controls, re-runs the
// SAME model the server rendered with (src/lib/marsModel), updates the DOM,
// and mirrors the scenario into the URL so it can be shared.
import { simulate, curvePath, DEFAULTS, HORIZON, type SimParams } from '../lib/marsModel'

function start() {
  const root = document.querySelector<HTMLElement>('[data-sim]')
  if (!root) return
  const form = root.querySelector<HTMLFormElement>('[data-sim-form]')
  if (!form) return

  const q = <T extends Element>(sel: string) => root.querySelector<T>(sel)

  const read = (): SimParams => {
    const data = new FormData(form)
    const num = (k: string, fallback: number) => {
      const v = Number(data.get(k))
      return Number.isFinite(v) && v > 0 ? v : fallback
    }
    return {
      firstYear: num('w', DEFAULTS.firstYear),
      flights0: num('f', DEFAULTS.flights0),
      fleetGrowth: num('g', DEFAULTS.fleetGrowth * 100) / 100,
      perShip: num('s', DEFAULTS.perShip),
      popGrowth: Number(data.get('p') ?? DEFAULTS.popGrowth * 100) / 100,
    }
  }

  const fmt = (n: number) => n.toLocaleString('en-US')

  const render = () => {
    const p = read()

    // Live slider value readouts.
    const outs: Record<string, string> = {
      f: String(p.flights0),
      g: `+${Math.round(p.fleetGrowth * 100)}%`,
      s: String(p.perShip),
      p: `${(p.popGrowth * 100).toFixed(1)}%/yr`,
    }
    for (const [k, v] of Object.entries(outs)) {
      const el = root.querySelector(`[data-out="${k}"]`)
      if (el) el.textContent = v
    }

    const r = simulate(p)
    const year = q<HTMLElement>('[data-sim-year]')
    const headline = q<HTMLElement>('[data-sim-headline]')
    if (year) year.textContent = r.year ? String(r.year) : `${HORIZON}+`
    if (headline) headline.textContent = r.year ? 'Self-sustaining by' : 'Not self-sustaining by'

    const path = curvePath(r.curve)
    q<SVGPathElement>('[data-sim-path]')?.setAttribute('d', path)
    q<SVGPathElement>('[data-sim-area]')?.setAttribute('d', `${path} L100 44 L0 44 Z`)

    const x1 = r.curve[r.curve.length - 1].year
    const setText = (sel: string, text: string) => {
      const el = q<HTMLElement>(sel)
      if (el) el.textContent = text
    }
    setText('[data-sim-x0]', String(p.firstYear))
    setText('[data-sim-x1]', String(Math.ceil(x1)))
    setText('[data-sim-people]', fmt(r.pop))
    setText('[data-sim-flights]', fmt(r.flights))
    setText('[data-sim-first]', String(p.firstYear))

    // Shareable scenario URL (replace, no history spam).
    const url = new URL(location.href)
    url.searchParams.set('w', String(p.firstYear))
    url.searchParams.set('f', String(p.flights0))
    url.searchParams.set('g', String(Math.round(p.fleetGrowth * 100)))
    url.searchParams.set('s', String(p.perShip))
    url.searchParams.set('p', (p.popGrowth * 100).toFixed(1))
    history.replaceState(null, '', url)
  }

  // Restore a shared scenario from the URL.
  const params = new URLSearchParams(location.search)
  for (const key of ['f', 'g', 's', 'p'] as const) {
    const v = params.get(key)
    if (v === null) continue
    const input = form.querySelector<HTMLInputElement>(`input[name="${key}"]`)
    if (input) input.value = v
  }
  const w = params.get('w')
  if (w) {
    const radio = form.querySelector<HTMLInputElement>(`input[name="w"][value="${w}"]`)
    if (radio) radio.checked = true
  }

  form.addEventListener('input', render)
  if ([...params.keys()].length > 0) render()
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start)
} else {
  start()
}

// Module marker so each client entry has its own scope under tsc.
export {}
