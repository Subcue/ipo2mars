/** @jsxImportSource react */
import { useEffect, useState } from 'react'
import { useProgress } from '@react-three/drei'

// Full-screen veil while textures and models stream in: a hairline progress
// bar and a mono readout, then a slow fade as the camera begins its approach.
export function Loader({ ready }: { ready: boolean }) {
  // `ready` = the stage's own Suspense resolved. Surface bases keep
  // streaming after that (their own boundaries), so don't wait on them.
  const { progress } = useProgress()
  const [gone, setGone] = useState(false)
  const done = ready
  useEffect(() => {
    if (!done) return
    const t = setTimeout(() => setGone(true), 1400)
    return () => clearTimeout(t)
  }, [done])
  if (gone) return null
  const pct = Math.round(done ? 100 : Math.min(progress, 99))
  return (
    <div
      className={`pointer-events-none absolute inset-0 z-40 flex items-center justify-center bg-space transition-opacity duration-[1200ms] ease-out ${
        done ? 'opacity-0' : 'opacity-100'
      }`}
      aria-hidden="true"
    >
      <div className="w-56 text-center">
        <p className="font-mono text-[10px] uppercase tracking-[0.34em] text-white/45">Plotting the route</p>
        <div className="mt-4 h-px w-full bg-white/10">
          <div className="h-px bg-white/80 transition-[width] duration-300 ease-out" style={{ width: `${pct}%` }} />
        </div>
        <p className="mt-3 font-mono text-[11px] tabular-nums text-white/55">{pct.toString().padStart(2, '0')}%</p>
      </div>
    </div>
  )
}
