// The settlement model. A deliberately small, transparent toy: every constant
// is visible here and surfaced in the UI. It is not a forecast.
//
// Shared by the worker (SSR renders the default scenario, so the page is
// complete without JavaScript) and the client island (recomputes on input).
// Single source of truth; do not fork the math.

export interface SimParams {
  /** Year of the first crewed transfer window. */
  firstYear: number
  /** Starship flights flown in that first window. */
  flights0: number
  /** Fleet growth per window, e.g. 0.4 = +40% ships each synod. */
  fleetGrowth: number
  /** Settlers per ship. */
  perShip: number
  /** Natural population growth on Mars, per year (e.g. 0.01 = 1%/yr). */
  popGrowth: number
}

export interface SimPoint {
  year: number
  pop: number
}

export interface SimResult {
  /** Year population crosses SELF_SUSTAINING, or null if not by HORIZON. */
  year: number | null
  /** Population at the end (threshold crossing or horizon). */
  pop: number
  /** Total Starship flights flown. */
  flights: number
  /** Population after each window, for the chart. */
  curve: SimPoint[]
}

/** Musk's stated threshold for a self-sustaining city. */
export const SELF_SUSTAINING = 1_000_000
/** Transfer windows repeat every ~26 months. */
export const SYNOD_YEARS = 26 / 12
/** Assumed production ceiling: ships available in any single window. */
export const MAX_FLIGHTS_PER_WINDOW = 1000
/** Give up beyond this year ("not in this century's plan"). */
export const HORIZON = 2150

export const DEFAULTS: SimParams = {
  firstYear: 2031,
  flights0: 10,
  fleetGrowth: 0.4,
  perShip: 100,
  popGrowth: 0.01,
}

export function simulate(p: SimParams): SimResult {
  let pop = 0
  let flights = 0
  let year = p.firstYear
  const curve: SimPoint[] = [{ year: p.firstYear - SYNOD_YEARS, pop: 0 }]

  for (let w = 0; year <= HORIZON; w++) {
    const fleet = Math.min(Math.round(p.flights0 * Math.pow(1 + p.fleetGrowth, w)), MAX_FLIGHTS_PER_WINDOW)
    flights += fleet
    pop += fleet * p.perShip
    curve.push({ year, pop: Math.round(pop) })

    if (pop >= SELF_SUSTAINING) {
      return { year: Math.ceil(year), pop: Math.round(pop), flights, curve }
    }

    // Natural growth across the gap to the next window.
    pop *= Math.pow(1 + p.popGrowth, SYNOD_YEARS)
    year += SYNOD_YEARS
  }

  return { year: null, pop: Math.round(pop), flights, curve }
}

/** SVG path (viewBox 0 0 100 44) for the population curve. */
export function curvePath(curve: SimPoint[]): string {
  if (curve.length < 2) return ''
  const x0 = curve[0].year
  const x1 = curve[curve.length - 1].year
  const span = Math.max(x1 - x0, 1)
  const yFor = (pop: number) => 42 - Math.min(pop / SELF_SUSTAINING, 1) * 40
  const xFor = (year: number) => ((year - x0) / span) * 100

  return curve
    .map((pt, i) => `${i === 0 ? 'M' : 'L'}${xFor(pt.year).toFixed(2)} ${yFor(pt.pop).toFixed(2)}`)
    .join(' ')
}
