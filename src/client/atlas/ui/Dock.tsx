/** @jsxImportSource react */
import { DESTINATIONS, type DestKey } from '../flight'

interface DockProps {
  keys: DestKey[]
  focus: DestKey
  onSelect: (k: DestKey) => void
}

export function Dock({ keys, focus, onSelect }: DockProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-[max(1.25rem,env(safe-area-inset-bottom))] z-20 flex justify-center px-3 sm:bottom-6">
      <div className="pointer-events-auto flex gap-0.5 rounded-full border border-white/12 bg-space/70 p-1 backdrop-blur-md sm:gap-1.5 sm:p-1.5">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onSelect(k)}
            className={`rounded-full px-2.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.08em] transition-colors sm:px-4 sm:text-xs sm:tracking-[0.12em] ${
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
