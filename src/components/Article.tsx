import type { FC, PropsWithChildren } from 'hono/jsx'

// Shared content-page shell: eyebrow + headline + lede over the starfield, then
// a column of frosted blocks. Keeps the SEO pages consistent and quick to write.
export const Article: FC<
  PropsWithChildren<{ eyebrow: string; title: string; lede: string }>
> = ({ eyebrow, title, lede, children }) => (
  <article class="mx-auto w-full max-w-3xl px-6 pb-28 pt-32">
    <header>
      <p class="font-mono text-[11px] uppercase tracking-[0.4em] text-haze/70">{eyebrow}</p>
      <h1 class="mt-5 text-balance text-4xl font-semibold tracking-tightest text-glow sm:text-5xl">
        {title}
      </h1>
      <p class="mt-6 text-lg leading-relaxed text-white/70">{lede}</p>
    </header>
    <div class="mt-12 space-y-5">{children}</div>
  </article>
)

export const Block: FC<PropsWithChildren<{ heading: string }>> = ({ heading, children }) => (
  <section class="panel rounded-3xl p-8">
    <h2 class="text-xl font-semibold tracking-tight">{heading}</h2>
    <div class="mt-3 space-y-4 leading-relaxed text-white/70">{children}</div>
  </section>
)

export const Note: FC<PropsWithChildren> = ({ children }) => (
  <p class="rounded-2xl border border-haze/10 bg-white/[0.02] p-5 text-sm leading-relaxed text-white/45">
    {children}
  </p>
)

export const NextLinks: FC<{ links: { href: string; label: string }[] }> = ({ links }) => (
  <div class="flex flex-wrap gap-3 pt-2 text-sm">
    {links.map((l) => (
      <a
        href={l.href}
        class="rounded-full border border-haze/20 px-4 py-2 text-white/80 transition-colors hover:border-haze/45 hover:text-white"
      >
        {l.label}
      </a>
    ))}
  </div>
)
