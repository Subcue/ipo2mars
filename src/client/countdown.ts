// Tiny standalone countdown — no framework. Finds [data-countdown="<ISO>"]
// blocks and updates their [data-unit="days|hours|mins|secs"] children once a
// second. Loaded on every page; a no-op where no countdown exists.

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function start() {
  const blocks = Array.from(document.querySelectorAll<HTMLElement>('[data-countdown]'))
  if (blocks.length === 0) return

  const render = () => {
    const now = Date.now()
    for (const el of blocks) {
      const target = new Date(el.dataset.countdown ?? '').getTime()
      if (Number.isNaN(target)) continue
      let remaining = Math.max(0, Math.floor((target - now) / 1000))
      const days = Math.floor(remaining / 86400)
      remaining -= days * 86400
      const hours = Math.floor(remaining / 3600)
      remaining -= hours * 3600
      const mins = Math.floor(remaining / 60)
      const secs = remaining - mins * 60

      const units: Record<string, number> = { days, hours, mins, secs }
      for (const [unit, val] of Object.entries(units)) {
        const node = el.querySelector(`[data-unit="${unit}"]`)
        if (node) node.textContent = unit === 'days' ? String(val) : pad(val)
      }
      if (target - now <= 0) el.setAttribute('data-live', 'true')
    }
  }

  render()
  setInterval(render, 1000)
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start)
} else {
  start()
}
