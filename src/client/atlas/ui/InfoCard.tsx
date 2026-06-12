/** @jsxImportSource react */
import { DESTINATIONS, type DestKey } from '../flight'

export function InfoCard({ focus }: { focus: DestKey }) {
  const info = DESTINATIONS[focus].info
  return (
    <div className="pointer-events-none absolute left-4 top-20 z-20 sm:left-6">
      <div className="pointer-events-auto max-w-[19rem] rounded-2xl border border-white/10 bg-space/70 p-5 backdrop-blur-md">
        <p className="font-display text-xl font-semibold tracking-tight">{info.name}</p>
        <p className="mt-2 text-[13px] leading-relaxed text-white/60">{info.fact}</p>
        <a href={info.href} className="mt-3 inline-block text-[13px] font-medium text-accent hover:underline">
          {info.link} →
        </a>
      </div>
    </div>
  )
}
