// Bundles the React + React Three Fiber client island into a single ES module
// that the Hono worker serves as a static asset (public/assets/scene.js).
//
// This is a SEPARATE build pipeline from the worker: wrangler bundles the
// hono/jsx SSR worker, esbuild bundles this React island. Keeping them apart
// means the two JSX runtimes never collide — no per-file pragma juggling in a
// shared build.
import * as esbuild from 'esbuild'

const watch = process.argv.includes('--watch')

/** @type {import('esbuild').BuildOptions} */
const options = {
  // scene.js = React/R3F island (3D backdrop); countdown.js = tiny vanilla ticker.
  entryPoints: {
    scene: 'src/client/main.tsx',
    countdown: 'src/client/countdown.ts',
    reveal: 'src/client/reveal.ts',
  },
  bundle: true,
  format: 'esm',
  outdir: 'public/assets',
  entryNames: '[name]',
  jsx: 'automatic',
  jsxImportSource: 'react',
  target: ['es2020'],
  minify: !watch,
  sourcemap: watch,
  legalComments: 'none',
  define: {
    'process.env.NODE_ENV': watch ? '"development"' : '"production"',
  },
  logLevel: 'info',
}

if (watch) {
  const ctx = await esbuild.context(options)
  await ctx.watch()
  console.log('[build-client] watching src/client → public/assets/scene.js')
} else {
  await esbuild.build(options)
  console.log('[build-client] wrote public/assets/scene.js')
}
