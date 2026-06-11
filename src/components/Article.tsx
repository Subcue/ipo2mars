import type { FC, PropsWithChildren } from 'hono/jsx'

// Shared content-page shell. Quiet and editorial: hairline-separated sections
// on the dark ground instead of stacked glass cards.
export const Article: FC<
  PropsWithChildren<{ eyebrow: string; title: string; lede: string }>
> = ({ eyebrow, title, lede, children }) => (
  <article class="mx-auto w-full max-w-3xl px-6 pb-28 pt-36">
    <header data-reveal>
      <p class="font-mono text-[11px] uppercase tracking-[0.24em] text-haze/70">{eyebrow}</p>
      <h1 class="mt-5 text-balance font-display text-4xl font-semibold leading-[1.05] tracking-tightest sm:text-5xl">
        {title}
      </h1>
      <p class="mt-6 text-lg leading-relaxed text-white/65">{lede}</p>
    </header>
    <div class="mt-16 space-y-14">{children}</div>
  </article>
)

export const Block: FC<PropsWithChildren<{ heading: string }>> = ({ heading, children }) => (
  <section class="border-t border-white/10 pt-10" data-reveal>
    <h2 class="font-display text-2xl font-semibold tracking-tight">{heading}</h2>
    <div class="mt-4 space-y-4 leading-relaxed text-white/65">{children}</div>
  </section>
)

export const Note: FC<PropsWithChildren> = ({ children }) => (
  <p class="rounded-2xl border border-white/10 bg-white/[0.02] p-5 text-sm leading-relaxed text-white/45">
    {children}
  </p>
)

export const NextLinks: FC<{ links: { href: string; label: string }[] }> = ({ links }) => (
  <div class="flex flex-wrap gap-3 pt-2 text-sm">
    {links.map((l) => (
      <a
        href={l.href}
        class="rounded-full border border-white/15 px-4 py-2 text-white/80 transition-colors hover:border-white/40 hover:text-white"
      >
        {l.label}
      </a>
    ))}
  </div>
)

// Hairline stat strip used by content pages (replaces boxed stat cards).
export const StatStrip: FC<{ stats: { value: string; label: string }[] }> = ({ stats }) => (
  <div
    class={`grid grid-cols-2 border-y border-white/10 ${
      stats.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-4'
    } sm:divide-x sm:divide-white/10`}
    data-reveal
  >
    {stats.map((s) => (
      <div class="px-2 py-6 sm:px-6 sm:first:pl-0">
        <p class="font-display text-2xl font-semibold tracking-tight">{s.value}</p>
        <p class="mt-1.5 text-xs leading-relaxed text-white/50">{s.label}</p>
      </div>
    ))}
  </div>
)
