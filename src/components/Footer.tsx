import type { FC } from 'hono/jsx'
import { SITE, DISCLAIMER, NAV } from '../data/site'
import { Logo } from './Logo'
import { GitHubMark } from './GitHubMark'

export const Footer: FC = () => (
  <footer class="relative z-10 border-t border-white/[0.07] bg-space">
    <div class="mx-auto w-full max-w-site px-6 py-16">
      <div class="flex flex-col gap-12 md:flex-row md:justify-between">
        <div class="max-w-sm">
          <a href="/" class="flex items-center gap-2.5 text-white">
            <Logo class="h-5 w-auto" />
            <span class="font-display text-[15px] font-semibold uppercase tracking-[0.26em]">ipo2mars</span>
          </a>
          <p class="mt-4 text-sm leading-relaxed text-white/50">{SITE.tagline}</p>
          <p class="mt-5 text-xs leading-relaxed text-white/35">{DISCLAIMER}</p>
        </div>
        <div class="flex flex-wrap gap-x-20 gap-y-10">
          <div>
            <p class="text-xs font-medium text-white/40">Explore</p>
            <ul class="mt-4 space-y-2.5 text-sm">
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
            <p class="text-xs font-medium text-white/40">Open source</p>
            <ul class="mt-4 space-y-2.5 text-sm">
              <li>
                <a
                  href={SITE.repo}
                  rel="noopener noreferrer"
                  class="flex items-center gap-2 text-white/70 transition-colors hover:text-white"
                >
                  <GitHubMark class="h-3.5 w-3.5" />
                  Repository
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
          <div>
            <p class="text-xs font-medium text-white/40">Data</p>
            <ul class="mt-4 space-y-2.5 text-sm text-white/70">
              <li>CelesTrak orbital feed</li>
              <li>NASA imagery</li>
              <li>Public IPO reporting</li>
            </ul>
          </div>
        </div>
      </div>
      <div class="mt-14 flex flex-col gap-2 border-t border-white/[0.07] pt-6 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
        <p>MIT licensed code. CC BY 4.0 content. Built in public.</p>
        <p>SpaceX, Starlink and xAI are trademarks of their respective owners.</p>
      </div>
    </div>
  </footer>
)
