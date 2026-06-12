/** @jsxImportSource react */
import { DESTINATIONS, type DestKey } from '../flight'

interface DockProps {
  keys: DestKey[]
  focus: DestKey
  onSelect: (k: DestKey) => void
}

export function Dock({ keys, focus, onSelect }: DockProps) {
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-6 z-20 flex justify-center px-4">
      <div className="pointer-events-auto flex gap-1.5 rounded-full border border-white/12 bg-space/70 p-1.5 backdrop-blur-md">
        {keys.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => onSelect(k)}
            className={`rounded-full px-4 py-1.5 font-mono text-xs uppercase tracking-[0.12em] transition-colors ${
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
