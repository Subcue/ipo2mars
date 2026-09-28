/** @jsxImportSource react */
import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Html } from '@react-three/drei'
import { Vector3, type Group } from 'three'
import { anchors, EARTH_POS, MARS_POS, MARS_RADIUS, MOON_RADIUS } from '../stage'
import type { DestKey } from '../flight'

interface LabelProps {
  at: () => Vector3
  /** World-space lift above the anchor (clears the body's limb). */
  lift: number
  title: string
  sub: string
  visible: boolean
  onSelect: () => void
  /** Which side of the marker the caption sits on. */
  side?: 'left' | 'right'
}

// A map annotation: a small ring on the body, a hairline leader and a two-line
// caption. Clicking it flies there. DOM overlay (drei Html), so text stays
// crisp at any zoom.
function Label({ at, lift, title, sub, visible, onSelect, side = 'right' }: LabelProps) {
  const g = useRef<Group>(null)
  useFrame(() => {
    if (g.current) g.current.position.copy(at()).add(new Vector3(0, lift, 0))
  })
  return (
    <group ref={g}>
      <Html zIndexRange={[15, 0]} style={{ pointerEvents: 'none' }}>
        <button
          type="button"
          onClick={onSelect}
          className={`group flex -translate-y-[5px] items-start gap-2 transition-opacity duration-700 ${
            side === 'right' ? '-translate-x-[5px] text-left' : '-translate-x-[calc(100%-5px)] flex-row-reverse text-right'
          } ${visible ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'}`}
        >
          <span className="mt-[1px] block h-2.5 w-2.5 shrink-0 rounded-full border border-white/70 bg-white/10 transition-colors group-hover:bg-white" />
          <span className="mt-[5px] block h-px w-6 shrink-0 bg-white/35" />
          <span className="block whitespace-nowrap leading-tight">
            <span className="block font-mono text-[11px] uppercase tracking-[0.22em] text-white/90">{title}</span>
            <span className="mt-0.5 block text-[11px] text-white/45">{sub}</span>
          </span>
        </button>
      </Html>
    </group>
  )
}

export function OverviewLabels({ visible, onSelect }: { visible: boolean; onSelect: (k: DestKey) => void }) {
  return (
    <>
      <Label at={() => EARTH_POS} lift={1.45} title="Earth" sub="Live Starlink constellation" visible={visible} onSelect={() => onSelect('earth')} />
      <Label at={() => anchors.moon} lift={MOON_RADIUS * 1.15} title="Moon" sub="Artemis outpost" visible={visible} onSelect={() => onSelect('moon')} />
      <Label at={() => MARS_POS} lift={MARS_RADIUS * 1.3} title="Mars" sub="Settlement, 3 ships landed" visible={visible} onSelect={() => onSelect('mars')} side="left" />
      <Label at={() => anchors.ship} lift={0.25} title="Starship" sub="In transit" visible={visible} onSelect={() => onSelect('ship')} />
    </>
  )
}
