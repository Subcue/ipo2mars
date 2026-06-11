// Scroll-reveal via IntersectionObserver (never scroll listeners). Progressive
// enhancement: [data-reveal] elements are only hidden AFTER the html root gets
// .reveal-ready, so no-JS visitors and crawlers always see everything.

function start() {
  const els = Array.from(document.querySelectorAll<HTMLElement>('[data-reveal]'))
  if (els.length === 0) return

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce || !('IntersectionObserver' in window)) return // leave fully visible

  document.documentElement.classList.add('reveal-ready')

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          ;(e.target as HTMLElement).classList.add('is-revealed')
          io.unobserve(e.target)
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
  )

  for (const el of els) {
    // Anything already in the viewport on load reveals immediately (no pop-in
    // for the first screen).
    const rect = el.getBoundingClientRect()
    if (rect.top < innerHeight && rect.bottom > 0) el.classList.add('is-revealed')
    io.observe(el)
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start)
} else {
  start()
}

// Module marker so each client entry has its own scope under tsc.
export {}
