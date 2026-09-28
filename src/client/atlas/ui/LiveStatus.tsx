/** @jsxImportSource react */
import { useEffect, useState } from 'react'
import type { DestKey } from '../flight'
import { MOMENTS } from '../starbase/sequence'
import { pad, padClock } from '../starbase/state'
import { refuel } from '../orbit/Refuel'

// A live line under the info card for the stops that run a sequence: which
// moment of the Starbase cycle is playing (with jumps to each one), and how
// the refueling is going. Polled a few times a second; the 3D sets the pace.
export function LiveStatus({ focus }: { focus: DestKey }) {
  const [, tick] = useState(0)
  useEffect(() => {
    if (focus !== 'starbase' && focus !== 'refuel') return
    const id = setInterval(() => tick((n) => n + 1), 250)
    return () => clearInterval(id)
  }, [focus])

  if (focus === 'starbase') {
    const t = pad.t
    return (
      <div className="mt-3 border-t border-white/10 pt-3">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#ff9a4a]" />
          {pad.phase}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {MOMENTS.map((m, i) => {
            const next = MOMENTS[i + 1]?.t ?? 1e9
            const on = t >= m.t && t < next
            return (
              <button
                key={m.label}
                type="button"
                onClick={() => padClock.jump(m.t)}
                className={`rounded-full border px-2.5 py-1 font-mono text-[10px] uppercase tracking-[0.08em] transition-colors ${
                  on ? 'border-white/70 bg-white/15 text-white' : 'border-white/15 text-white/55 hover:border-white/40 hover:text-white'
                }`}
              >
                {m.label}
              </button>
            )
          })}
        </div>
      </div>
    )
  }
  if (focus === 'refuel') {
    const pct = Math.round(refuel.transfer * 100)
    return (
      <div className="mt-3 border-t border-white/10 pt-3">
        <p className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.18em] text-white/55">
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[#8fb4ff]" />
          {refuel.phase}
        </p>
        <p className="mt-1.5 font-mono text-[11px] tabular-nums text-white/70">
          Tanker {refuel.tanker} · load {pct.toString().padStart(2, ' ')}% transferred
        </p>
        <div className="mt-1.5 h-px w-full bg-white/10">
          <div className="h-px bg-[#8fb4ff]" style={{ width: `${pct}%` }} />
        </div>
      </div>
    )
  }
  return null
}
