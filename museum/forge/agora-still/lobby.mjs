// The live lobby as a visitor's browser draws it, the picture only (the canvas
// and the vignette over it, no type): the dull reference of the front's still,
// and the proof that the still's option leaves the live lobby pixel for pixel.
//
//   node forge/agora-still/lobby.mjs <port> <outDir> before   the reference frames
//   node forge/agora-still/lobby.mjs <port> <outDir> zero     the pixel-zero set
//   node forge/agora-still/lobby.mjs compare <dirA> <dirB>    exact pixel compare
//
// The zero set holds the grain still and waits out every ease, so two runs of
// one tree draw the same pixels; the reference keeps the grain a visitor sees.
import { chromium } from 'playwright'
import { spawn } from 'node:child_process'
import { mkdirSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { writeFileSync } from 'node:fs'
import { APP_ROOT, assertBackend, assertServer, browserArgs, waitForServer } from '../rig.mjs'
import { measureBefore } from './stars.mjs'

const PICTURE_ONLY = `body > *:not(#stage):not(#vignette) { opacity: 0 !important; }`

const SETS = {
  // the visitor's own tier and ratio: hero on this desk, standard on a phone
  before: [
    { tag: 'wide', width: 1440, height: 810, scale: 2, states: ['wheel', 'agora'], settle: 4000, grain: true },
    { tag: 'tall', width: 390, height: 844, scale: 3, states: ['wheel', 'agora'], settle: 4000, grain: true },
  ],
  zero: [
    { tag: 'desktop', width: 1512, height: 950, scale: 1, states: ['agora', 'wheel', 'wheel-3'], settle: 7000, grain: false },
    { tag: 'mobile', width: 390, height: 844, scale: 2, states: ['agora', 'wheel'], settle: 7000, grain: false },
  ],
}

async function compare(a, b) {
  let worst = 0
  for (const f of readdirSync(a).filter((n) => n.endsWith('.png')).sort()) {
    const [x, y] = await Promise.all([join(a, f), join(b, f)].map((p) => sharp(p).raw().toBuffer({ resolveWithObject: true })))
    if (x.info.width !== y.info.width || x.info.height !== y.info.height) {
      console.log(`${f}: size differs`)
      worst = Infinity
      continue
    }
    let differ = 0
    let max = 0
    for (let i = 0; i < x.data.length; i++) {
      const d = Math.abs(x.data[i] - y.data[i])
      if (d) differ++
      if (d > max) max = d
    }
    worst = Math.max(worst, differ)
    console.log(`${f}: ${differ} of ${x.data.length} channel values differ, max ${max}`)
  }
  console.log(worst === 0 ? 'PIXEL ZERO' : 'PIXELS DIFFER')
  process.exitCode = worst === 0 ? 0 : 1
}

if (process.argv[2] === 'compare') {
  await compare(resolve(process.argv[3]), resolve(process.argv[4]))
} else {
  const port = Number(process.argv[2])
  const out = resolve(process.argv[3])
  const set = SETS[process.argv[4]]
  if (!port || !set) throw new Error('usage: lobby.mjs <port> <outDir> before|zero')
  mkdirSync(out, { recursive: true })
  const BASE = `http://localhost:${port}`
  const server = spawn('pnpm', ['exec', 'vite', '--port', String(port), '--strictPort'], { cwd: APP_ROOT, stdio: 'ignore' })
  const problems = []
  try {
    await waitForServer(BASE)
    const said = await assertServer(BASE)
    console.log(`server ${said.head.slice(0, 8)}`)
    const browser = await chromium.launch({ args: browserArgs() })
    for (const vp of set) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.scale })
      page.on('pageerror', (e) => problems.push(`[${vp.tag}] pageerror: ${e.message}`))
      page.on('console', (m) => {
        if (m.type() === 'error') problems.push(`[${vp.tag}] console: ${m.text()}`)
        if (m.text().startsWith('backend=')) console.log(`[${vp.tag}] ${m.text()}`)
      })
      // a save in another hand reloads the page through vite's client and the jump is lost
      await page.route('**/@vite/client', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'export {}' }))
      await page.goto(`${BASE}/`)
      await page.waitForFunction(() => Boolean(window.__forge))
      await page.waitForTimeout(1800)
      await assertBackend(page, 'webgpu')
      await page.addStyleTag({ content: PICTURE_ONLY })
      for (const name of vp.states) {
        const [phase, chapter] = name.split('-')
        await page.evaluate(([p, c, g]) => {
          window.__forge.freeze(12.4)
          if (!g) window.__forge.grain(false)
          window.__forge.jump(p, p === 'wheel' ? { chapter: Number(c ?? 0) } : {})
        }, [phase, chapter, vp.grain])
        const until = Date.now() + 20000
        while (Date.now() < until) {
          const left = await page.evaluate(() => (document.body.dataset.forge === 'pending' ? 1 : 0) + (window.__forge?.state?.().texturesPending ?? 0))
          if (!left) break
          await page.waitForTimeout(150)
        }
        await page.waitForTimeout(vp.settle)
        const file = join(out, `${vp.tag}-${name}.png`)
        await page.screenshot({ path: file })
        const tier = await page.evaluate(() => document.body.dataset.tier)
        console.log(`${file} tier=${tier}`)
      }
      await page.close()
      // the before's star points: the live wheel rebuilt by the still page in lobby mode
      if (process.argv[4] === 'before' && vp.states.includes('wheel')) {
        const lp = await browser.newPage({ viewport: { width: vp.width, height: vp.height }, deviceScaleFactor: vp.scale })
        lp.on('pageerror', (e) => problems.push(`[${vp.tag} lobby] pageerror: ${e.message}`))
        await lp.route('**/@vite/client', (r) => r.fulfill({ status: 200, contentType: 'application/javascript', body: 'export {}' }))
        await lp.goto(`${BASE}/forge/agora-still/still.html?frame=${vp.tag}&mode=lobby`)
        await lp.waitForFunction(() => document.body.dataset.still === 'ready', null, { timeout: 180000 })
        const m = await measureBefore({ page: lp, file: join(out, `${vp.tag}-wheel.png`), shape: vp.tag, css: [vp.width, vp.height], proofFile: join(out, `stars-proof-before-${vp.tag}.png`) })
        writeFileSync(join(out, `stars-before-${vp.tag}.json`), JSON.stringify(m, null, 1))
        console.log(`[${vp.tag}] before: ${m.starsInFrame} of ${m.of} figure stars in frame, proof ${JSON.stringify(m.checks.projectedOnPixels)}, names seated ${m.checks.namesSeated}`)
        await lp.close()
      }
    }
    await browser.close()
  } finally {
    server.kill()
  }
  if (problems.length) {
    console.log('PROBLEMS:')
    for (const p of [...new Set(problems)]) console.log(' ·', p)
    process.exitCode = 1
  } else console.log('clean: no console errors')
}
