/** @jsxImportSource react */
import { DESTINATIONS, type DestKey } from '../flight'
import { LiveStatus } from './LiveStatus'

export function InfoCard({ focus }: { focus: DestKey }) {
  const info = DESTINATIONS[focus].info
  return (
    <div className="pointer-events-none absolute left-3 top-[4.5rem] z-20 sm:left-6 sm:top-20">
      <div className="pointer-events-auto max-w-[16.5rem] rounded-2xl border border-white/10 bg-space/70 p-3.5 backdrop-blur-md sm:max-w-[19rem] sm:p-5">
        <p className="font-display text-base font-semibold tracking-tight sm:text-xl">{info.name}</p>
        <p className="mt-1.5 text-[12px] leading-relaxed text-white/60 sm:mt-2 sm:text-[13px]">{info.fact}</p>
        <a href={info.href} className="mt-2 inline-block text-[12px] font-medium text-accent hover:underline sm:mt-3 sm:text-[13px]">
          {info.link} →
        </a>
        <LiveStatus focus={focus} />
      </div>
    </div>
  )
}
