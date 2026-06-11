import { Hono } from 'hono'
import type { Child } from 'hono/jsx'
import { trimTrailingSlash } from 'hono/trailing-slash'
import { Layout } from './components/Layout'
import { Home } from './pages/Home'
import { SpacexIpo } from './pages/SpacexIpo'
import { Starlink } from './pages/Starlink'
import { SpacexAi } from './pages/SpacexAi'
import { Mars } from './pages/Mars'
import { SITE } from './data/site'
import { api } from './routes/api'
import { refreshStarlinkTle } from './lib/tle'
import type { Env } from './types'

const app = new Hono<{ Bindings: Env }>()

app.use(trimTrailingSlash())

app.route('/api', api)

// Security headers. Looser than the corp site's `default-src 'none'` because
// this site ships a WebGL client island — but still locked down: scripts and
// data fetches are same-origin only.
app.use('*', async (c, next) => {
  await next()
  c.header('X-Content-Type-Options', 'nosniff')
  c.header('X-Frame-Options', 'DENY')
  c.header('Referrer-Policy', 'strict-origin-when-cross-origin')
  c.header('Strict-Transport-Security', 'max-age=31536000')
  c.header('Permissions-Policy', 'camera=(), microphone=(), geolocation=()')
  c.header(
    'Content-Security-Policy',
    [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "connect-src 'self'",
      "worker-src 'self' blob:",
      "font-src 'self' data:",
      "base-uri 'none'",
      "form-action 'none'",
      "frame-ancestors 'none'",
    ].join('; '),
  )
})

interface PageDef {
  path: string
  title: string
  description: string
  body: () => Child
  scene?: boolean
}

const ComingSoon = ({ title, blurb }: { title: string; blurb: string }) => (
  <section class="flex min-h-[100svh] flex-col items-center justify-center px-6 text-center">
    <h1 class="max-w-3xl text-4xl font-semibold tracking-tightest text-glow sm:text-6xl">{title}</h1>
    <p class="mt-6 max-w-xl leading-relaxed text-white/60">{blurb}</p>
    <a href="/" class="mt-10 text-sm font-medium text-accent hover:underline">
      ← Back to the launchpad
    </a>
  </section>
)

const PAGES: PageDef[] = [
  {
    path: '/',
    title: 'ipo2mars — SpaceX from IPO to Mars, in 3D',
    description: SITE.description,
    body: () => <Home />,
    scene: true,
  },
  {
    path: '/spacex-ipo',
    title: 'SpaceX IPO (SPCX) — a $1.77T listing, visualized · ipo2mars',
    description:
      'An unofficial visualization of the SpaceX IPO: SPCX on the Nasdaq, a $1.77 trillion valuation, $75B raised, and the largest public offering in history. Not investment advice.',
    body: () => <SpacexIpo />,
  },
  {
    path: '/starlink',
    title: 'Starlink constellation — live 3D map · ipo2mars',
    description:
      'A real-time 3D Starlink constellation rendered from public CelesTrak orbital data — thousands of satellites serving nine million subscribers.',
    body: () => <Starlink />,
  },
  {
    path: '/spacex-ai',
    title: 'Space × AI — SpaceX, xAI, and compute in orbit · ipo2mars',
    description:
      'How SpaceX’s xAI merger and the idea of orbital data centers fit into the story — what is real today, and what is still a future scenario.',
    body: () => <SpacexAi />,
  },
  {
    path: '/mars',
    title: 'Mars settlement — Starship to a self-sustaining city · ipo2mars',
    description:
      'Earth-to-Mars transfer windows, Starship cadence, and the arc toward a self-sustaining city of a million people. The IPO is just the launchpad.',
    body: () => <Mars />,
  },
]

for (const page of PAGES) {
  app.get(page.path, (c) => {
    c.header('Cache-Control', 'public, max-age=300')
    return c.html(
      <Layout path={page.path} title={page.title} description={page.description} scene={page.scene}>
        {page.body()}
      </Layout>,
    )
  })
}

app.get('/robots.txt', (c) => {
  c.header('Cache-Control', 'public, max-age=3600')
  return c.text(
    `User-agent: *\nAllow: /\n\nUser-agent: GPTBot\nUser-agent: OAI-SearchBot\nUser-agent: ChatGPT-User\nUser-agent: ClaudeBot\nUser-agent: PerplexityBot\nUser-agent: Google-Extended\nUser-agent: CCBot\nAllow: /\n\nSitemap: ${SITE.url}/sitemap.xml\n`,
  )
})

app.get('/sitemap.xml', (c) => {
  const urls = PAGES.map(
    (p) => `  <url>\n    <loc>${SITE.url}${p.path === '/' ? '/' : p.path}</loc>\n  </url>`,
  ).join('\n')
  c.header('Content-Type', 'application/xml; charset=utf-8')
  c.header('Cache-Control', 'public, max-age=3600')
  return c.body(
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`,
  )
})

// Entity fact sheet for AI engines.
app.get('/llms.txt', (c) => {
  c.header('Cache-Control', 'public, max-age=3600')
  const pages = PAGES.filter((p) => p.path !== '/')
    .map((p) => `- [${p.title.split(' · ')[0]}](${SITE.url}${p.path}): ${p.description}`)
    .join('\n')
  return c.text(
    `# ${SITE.name}\n\n> ${SITE.description}\n\nThis is an UNOFFICIAL, open-source fan project. It is not affiliated with, endorsed by, or sponsored by SpaceX, Starlink, xAI, Tesla, or Elon Musk. Nothing here is investment advice. All figures cite public reporting.\n\nLicense: MIT (code), CC BY 4.0 (content)\nSource: ${SITE.repo}\n\n## Pages\n\n${pages}\n`,
  )
})

app.notFound((c) =>
  c.html(
    <Layout path={new URL(c.req.url).pathname} title="Lost in orbit — ipo2mars" description="Page not found." noindex>
      <ComingSoon title="Lost in orbit" blurb="That page drifted out of range." />
    </Layout>,
    404,
  ),
)

app.onError((err, c) => {
  console.error('unhandled error', err)
  return c.text('Internal Server Error', 500)
})

export default {
  fetch: app.fetch,
  // Keep the Starlink TLE cache warm so no visitor eats a cold CelesTrak fetch.
  scheduled: (_controller, env, ctx) => {
    ctx.waitUntil(refreshStarlinkTle(env.KV_CACHE).catch((e) => console.error('tle warm failed', e)))
  },
} satisfies ExportedHandler<Env>
