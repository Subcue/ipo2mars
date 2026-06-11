import type { FC, PropsWithChildren } from 'hono/jsx'
import { SITE, NAV } from '../data/site'
import { buildGraph } from '../lib/seo'
import { Footer } from './Footer'

interface LayoutProps {
  path: string
  title: string
  description: string
  noindex?: boolean
  /** Load the full WebGL Earth/constellation backdrop (home only). Content
   *  pages get a lightweight CSS starfield instead — no 1.1MB bundle. */
  scene?: boolean
}

export const Layout: FC<PropsWithChildren<LayoutProps>> = ({
  path,
  title,
  description,
  noindex,
  scene,
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
        <meta property="og:type" content="website" />
        <meta property="og:site_name" content={SITE.name} />
        <meta property="og:title" content={title} />
        <meta property="og:description" content={description} />
        <meta property="og:url" content={canonical} />
        <meta property="og:image" content={`${SITE.url}/og.png`} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content="ipo2mars — a 3D map of SpaceX's future" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:site" content={SITE.twitter} />
        <meta name="twitter:image" content={`${SITE.url}/og.png`} />
        <link rel="stylesheet" href="/styles.css" />
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

        <header class="fixed inset-x-0 top-0 z-30">
          <nav class="mx-auto flex w-full max-w-site items-center justify-between px-6 py-5">
            <a href="/" class="font-mono text-sm font-semibold uppercase tracking-[0.32em] text-white">
              ipo2mars
            </a>
            <div class="hidden items-center gap-7 text-sm text-white/65 sm:flex">
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
              class="rounded-full border border-haze/25 px-4 py-1.5 text-xs font-medium text-white/80 transition-colors hover:border-haze/50 hover:text-white"
            >
              ★ GitHub
            </a>
          </nav>
        </header>

        <main class="relative z-10">{children}</main>

        <Footer />

        {scene ? <script type="module" src="/assets/scene.js" /> : null}
        <script type="module" src="/assets/countdown.js" />
      </body>
    </html>
  )
}
