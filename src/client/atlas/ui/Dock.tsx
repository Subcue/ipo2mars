/** @jsxImportSource react */
import { useEffect, useRef } from 'react'
import { DESTINATIONS, type DestKey } from '../flight'

interface DockProps {
  keys: DestKey[]
  focus: DestKey
  onSelect: (k: DestKey) => void
  /** The guided tour: play/stop control at the head of the dock. */
  touring: boolean
  onTour: () => void
}

export function Dock({ keys, focus, onSelect, touring, onTour }: DockProps) {
  // narrow screens scroll the dock: keep the active stop in view
  const active = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    active.current?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' })
  }, [focus])
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-2 sm:bottom-6">
      <div className="pointer-events-auto flex max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-white/12 bg-space/70 p-1 backdrop-blur-md [scrollbar-width:none] sm:gap-1 sm:p-1.5">
        <button
          type="button"
          onClick={onTour}
          aria-label={touring ? 'Stop the mission tour' : 'Play the mission tour'}
          className={`flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors sm:px-3.5 sm:text-xs sm:tracking-[0.12em] ${
            touring ? 'bg-accent text-white' : 'text-accent hover:text-white'
          }`}
        >
          <span aria-hidden="true">{touring ? '■' : '▶'}</span>
          <span className="hidden sm:inline">{touring ? 'Stop' : 'Mission'}</span>
        </button>
        <span className="mx-0.5 h-4 w-px shrink-0 bg-white/12" aria-hidden="true" />
        {keys.map((k) => (
          <button
            key={k}
            ref={focus === k ? active : undefined}
            type="button"
            onClick={() => onSelect(k)}
            className={`shrink-0 rounded-full px-2 py-1.5 font-mono text-[10.5px] uppercase tracking-[0.06em] transition-colors sm:px-3.5 sm:text-xs sm:tracking-[0.12em] ${
              focus === k ? 'bg-white text-space' : 'text-white/65 hover:text-white'
            }`}
          >
            {DESTINATIONS[k].label}
          </button>
        ))}
      </div>
    </div>
  )
}
