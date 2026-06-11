import type { FC } from 'hono/jsx'
import { SITE, DISCLAIMER, NAV } from '../data/site'

export const Footer: FC = () => (
  <footer class="relative z-10 mt-32 border-t border-haze/10 bg-space/80 backdrop-blur">
    <div class="mx-auto w-full max-w-site px-6 py-14">
      <div class="flex flex-col gap-10 md:flex-row md:justify-between">
        <div class="max-w-sm">
          <a href="/" class="font-mono text-sm uppercase tracking-[0.3em] text-white">
            ipo2mars
          </a>
          <p class="mt-3 text-sm leading-relaxed text-white/45">{SITE.tagline}</p>
          <p class="mt-4 text-xs leading-relaxed text-white/35">{DISCLAIMER}</p>
        </div>
        <div class="flex flex-wrap gap-x-16 gap-y-8">
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              Explore
            </p>
            <ul class="mt-4 space-y-2 text-sm">
              {NAV.map((link) => (
                <li>
                  <a href={link.href} class="text-white/70 transition-colors hover:text-white">
                    {link.label}
                  </a>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">
              Open source
            </p>
            <ul class="mt-4 space-y-2 text-sm">
              <li>
                <a
                  href={SITE.repo}
                  rel="noopener noreferrer"
                  class="text-white/70 transition-colors hover:text-white"
                >
                  GitHub repo
                </a>
              </li>
              <li>
                <a
                  href={`${SITE.repo}/blob/main/CONTRIBUTING.md`}
                  rel="noopener noreferrer"
                  class="text-white/70 transition-colors hover:text-white"
                >
                  Contribute
                </a>
              </li>
              <li>
                <a href="/llms.txt" class="text-white/70 transition-colors hover:text-white">
                  llms.txt
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
      <div class="mt-12 flex flex-col gap-2 border-t border-haze/10 pt-6 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
        <p>MIT (code) · CC BY 4.0 (content) · built in public</p>
        <p>Data: CelesTrak · NASA · public IPO reporting</p>
      </div>
    </div>
  </footer>
)
