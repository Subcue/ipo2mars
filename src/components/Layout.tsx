import type { FC, PropsWithChildren } from 'hono/jsx'
import { SITE, NAV, GA_ID } from '../data/site'
import { buildGraph } from '../lib/seo'
import { Footer } from './Footer'
import { Logo } from './Logo'
import { GitHubMark } from './GitHubMark'

interface LayoutProps {
  path: string
  title: string
  description: string
  noindex?: boolean
  /** Load the full WebGL Earth/constellation backdrop (home only). Content
   *  pages get a lightweight CSS starfield instead — no 1.1MB bundle. */
  scene?: boolean
  /** Inject Google Analytics (production hostname only — see index.tsx). */
  analytics?: boolean
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({
  path,
  title,
  description,
  noindex,
  scene,
  analytics,
  children,
}) => {
  const canonical = `${SITE.url}${path === '/' ? '/' : path}`
  const graph = buildGraph({ path, title, description })

  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <title>{title}</title>
        <meta name="description" content={description} />
        {noindex ? <meta name="robots" content="noindex, nofollow" /> : null}
        <link rel="canonical" href={canonical} />
        <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
        <meta name="theme-color" content="#05060a" />
        <link rel="preload" href="/fonts/space-grotesk.woff2" as="font" type="font/woff2" crossorigin="" />
        <link rel="preload" href="/fonts/geist.woff2" as="font" type="font/woff2" crossorigin="" />
        <link rel="preload" href="/fonts/geist-mono.woff2" as="font" type="font/woff2" crossorigin="" />
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={SITE.name} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={`${SITE.url}/og.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="ipo2mars: a 3D map of SpaceX's future" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content={SITE.twitter} />
        <meta name="twitter:image" content={`${SITE.url}/og.png`} />
        <link rel="stylesheet" href="/styles.css" />
        {/* GA4 — bootstrap is self-hosted at /ga.js so the CSP stays free of
            'unsafe-inline'. Only rendered on the production hostname. */}
        {analytics ? (
          <>
            <script async src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} />
            <script defer src="/ga.js" />
          </>
        ) : null}
        {/* Inert structured data — exempt from the script-src CSP. */}
        {graph.map((node) => (
          <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(node) }} />
        ))}
      </head>
      <body class="bg-space font-sans text-white antialiased">
        {scene ? (
          // WebGL Earth/constellation backdrop — progressive enhancement; with
          // JS or WebGL off, the SSR content below still reads and ranks.
          <div id="scene" class="pointer-events-none fixed inset-0 z-0" aria-hidden="true" />
        ) : (
          <div class="starfield pointer-events-none fixed inset-0 z-0" aria-hidden="true" />
        )}

        <header class="fixed inset-x-0 top-0 z-30 border-b border-white/[0.06] bg-space/60 backdrop-blur-md">
          <nav class="mx-auto flex h-16 w-full max-w-site items-center justify-between px-6">
            <a href="/" class="flex items-center gap-2.5 text-white">
              <Logo class="h-5 w-auto" />
              <span class="font-display text-[15px] font-semibold uppercase tracking-[0.26em]">ipo2mars</span>
            </a>
            <div class="hidden items-center gap-8 text-[13.5px] font-medium text-white/60 sm:flex">
              {NAV.map((link) => (
                <a
                  href={link.href}
                  class={`transition-colors hover:text-white ${
                    path === link.href ? 'text-white' : ''
                  }`}
                >
                  {link.label}
                </a>
              ))}
            </div>
            <a
              href={SITE.repo}
              rel="noopener noreferrer"
              class="flex items-center gap-2 rounded-full border border-white/15 px-4 py-1.5 text-xs font-medium text-white/85 transition-colors hover:border-white/40 hover:text-white"
            >
              <GitHubMark class="h-3.5 w-3.5" />
              GitHub
            </a>
          </nav>
        </header>

        <main class="relative z-10">{children}</main>

        <Footer />

        {scene ? <script type="module" src="/assets/scene.js" /> : null}
        <script type="module" src="/assets/countdown.js" />
        <script type="module" src="/assets/reveal.js" />
      </body>
    </html>
  )
}
