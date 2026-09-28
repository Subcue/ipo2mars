/** @jsxImportSource react */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { DestKey } from '../flight'
import { padClock } from '../starbase/state'
import { refuel } from '../orbit/Refuel'

// The mission, played through: launch and catch at Starbase, refueling in
// orbit, the fleet in transit, the Moon, Mars, and back out to the whole
// stage, with a line of caption for each. Any touch of the controls or the
// camera hands control back to the visitor.
interface Step {
  focus: DestKey
  /** Seconds on this step (flights included). */
  dur: number
  caption: string
  enter?: () => void
}

const STEPS: Step[] = [
  { focus: 'overview', dur: 6, caption: 'Earth, the Moon and Mars. The route between them is the whole story.' },
  {
    focus: 'starbase',
    dur: 26,
    caption: 'Starbase, Texas. Thirty-three Raptors light, and a 120-metre rocket climbs out over the Gulf.',
    enter: () => padClock.jump(4),
  },
  {
    focus: 'starbase',
    dur: 17,
    caption: 'Minutes later the booster flies home, and the tower catches it out of the air.',
    enter: () => padClock.jump(72),
  },
  {
    focus: 'refuel',
    dur: 24,
    caption: 'In orbit, tanker after tanker refills the ship: the step that makes Mars possible.',
    enter: () => refuel.jump(4),
  },
  { focus: 'ship', dur: 12, caption: 'Every 26 months the planets line up, and the fleet leaves together.' },
  { focus: 'moon', dur: 15, caption: 'The Moon first: landers, an outpost, and industry that builds on itself.' },
  { focus: 'mars', dur: 18, caption: 'Then Mars: a city meant to keep going even if the ships stop coming.' },
  { focus: 'overview', dur: 8, caption: 'IPO is not the destination. It’s the launchpad.' },
]

export function useTour(setFocus: (k: DestKey) => void) {
  const [step, setStep] = useState(-1)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const stop = useCallback(() => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setStep(-1)
  }, [])
  const play = useCallback(() => setStep(0), [])
  useEffect(() => {
    if (step < 0) return
    if (step >= STEPS.length) {
      setStep(-1)
      return
    }
    const s = STEPS[step]
    setFocus(s.focus)
    s.enter?.()
    timer.current = setTimeout(() => setStep((n) => n + 1), s.dur * 1000)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [step, setFocus])
  return { playing: step >= 0, caption: step >= 0 && step < STEPS.length ? STEPS[step].caption : '', step, play, stop }
}

export function TourCaption({ text, playing, step }: { text: string; playing: boolean; step: number }) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[max(5.25rem,calc(env(safe-area-inset-bottom)+4.5rem))] z-20 flex justify-center px-5 sm:bottom-24">
      <p
        key={step}
        className={`max-w-xl text-center font-display text-[15px] leading-snug text-white/90 transition-opacity duration-700 [text-shadow:0_1px_12px_rgba(0,0,0,0.65)] sm:text-xl ${
          playing && text ? 'animate-fade-up opacity-100' : 'opacity-0'
        }`}
      >
        {text}
      </p>
    </div>
  )
}
