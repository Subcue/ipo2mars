// Records the 40s atlas demo video by driving the REAL app in headed Chrome
// (your GPU: proper metal reflections, smooth fps) along the launch
// storyboard, then converts to an X-ready 1080p MP4.
//
// One-time deps (both removable afterwards):
//   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm i -D playwright ffmpeg-static
// Run (dev server must be up):
//   node tools/video/record-atlas.mjs [baseUrl] [outDir]
// Defaults: http://127.0.0.1:8787 and ~/Desktop.
//
// A Chrome window will open for ~70s. Do not interact with it.

import { chromium } from 'playwright'
import ffmpegPath from 'ffmpeg-static'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, renameSync } from 'node:fs'
import { tmpdir, homedir } from 'node:os'
import { join } from 'node:path'

const BASE = process.argv[2] ?? 'http://127.0.0.1:8787'
const OUT_DIR = process.argv[3] ?? join(homedir(), 'Desktop')
const W = 1920
const H = 1080

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

const videoDir = mkdtempSync(join(tmpdir(), 'atlas-rec-'))
const browser = await chromium.launch({
  channel: 'chrome',
  headless: false, // real GPU
  args: [`--window-size=${W},${H + 120}`],
})
const ctx = await browser.newContext({
  viewport: { width: W, height: H },
  recordVideo: { dir: videoDir, size: { width: W, height: H } },
})
const page = await ctx.newPage()

console.log('[record] loading atlas (textures + TLE warmup)...')
await page.goto(`${BASE}/atlas`, { waitUntil: 'networkidle', timeout: 60000 })
const sceneStart = Date.now() // ~= the scene clock's zero (canvas mounts on load)
await sleep(6000)

const fly = async (label, holdMs) => {
  console.log(`[record] -> ${label}`)
  await page.click(`text=${label}`)
  await sleep(holdMs)
}

// Shot 1: overview establishes the stage (camera idles, ship crawls).
await sleep(3000)

// Shot 2-4: the grand tour.
await fly('MARS', 6500)
await fly('MOON', 6000)
await fly('SHIP', 7000)

// Shot 5: Earth, timed so we catch liftoff -> staging -> booster landing.
// The launch loop is 26s: liftoff at t=3, booster down at t=18.5 (scene time).
console.log('[record] -> EARTH (waiting for a launch window)')
await page.click('text=EARTH')
const sceneT = () => ((Date.now() - sceneStart) / 1000) % 26
while (!(sceneT() > 0.8 && sceneT() < 2.2)) await sleep(150) // arrive just before liftoff
await sleep(17500) // full cycle: ascent, separation, flame landing

// Shot 6: the Mars settlement simulator (same tab keeps one video file).
console.log('[record] -> simulator')
await page.goto(`${BASE}/mars#simulator`, { waitUntil: 'networkidle', timeout: 30000 })
await page.locator('#simulator').scrollIntoViewIfNeeded()
await sleep(1500)
// Crank the fleet on camera.
for (const [name, value] of [['f', '60'], ['g', '80']]) {
  await page.evaluate(([n, v]) => {
    const el = document.querySelector(`input[name="${n}"]`)
    el.value = v
    el.dispatchEvent(new Event('input', { bubbles: true }))
  }, [name, value])
  await sleep(1300)
}
await sleep(3000)

await ctx.close() // flushes the webm
await browser.close()

// Locate the produced webm (single file in videoDir).
const { readdirSync } = await import('node:fs')
const webm = join(videoDir, readdirSync(videoDir).find((f) => f.endsWith('.webm')))
console.log('[record] raw capture:', webm)

const out = join(OUT_DIR, 'ipo2mars-atlas-demo.mp4')
console.log('[record] encoding MP4 (H.264, 30fps)...')
execFileSync(ffmpegPath, [
  '-y',
  '-i', webm,
  '-vf', `scale=${W}:${H}:flags=lanczos,fps=30`,
  '-c:v', 'libx264',
  '-preset', 'slow',
  '-crf', '18',
  '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart',
  '-an',
  out,
], { stdio: 'inherit' })

renameSync(webm, join(OUT_DIR, 'ipo2mars-atlas-demo-raw.webm'))
console.log(`[record] done:\n  ${out}\n  (raw webm kept beside it)`)
