// The sun's shadow maps once a still call (open/light.ts holdSunMaps, walkLight's `still`): a still's sub-frames differ
// by the camera's sub-pixel jitter alone, so its maps draw on sub-frame 0 and are held for the rest; each shadow's flags
// are what they were before the call, so the walk's live frames draw every frame. Driven through the kit's own
// accumulate (cave/render.ts) and three's own ShadowNode.updateBefore, with a counting renderer in place of the GPU.
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP } from '../pages.mjs'

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx) } catch (e) {
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.[a-z]+$/.test(spec)) return next(spec + '.ts', ctx)
    throw e
  }
}`), import.meta.url)

const W = join(APP, 'src/wings')
const L = await import(pathToFileURL(join(W, 'babylon/open/light.ts')).href)
const R = await import(pathToFileURL(join(W, 'animals/cave/render.ts')).href)
const { DirectionalLight, PerspectiveCamera, ShadowNode } = await import('three/webgpu')

/** the far and near maps as walkLight makes them (the near one a clone on its own holder), each draw counted */
function rig(w = 8, h = 6) {
  const sun = new DirectionalLight()
  sun.castShadow = true
  const holder = { shadow: sun.shadow.clone(), castShadow: true }
  const draws = { far: 0, near: 0 }
  const far = new ShadowNode(sun, sun.shadow), near = new ShadowNode(holder, holder.shadow)
  far.updateShadow = () => { draws.far++ }
  near.updateShadow = () => { draws.near++ }
  const camera = new PerspectiveCamera(50, w / h, 0.3, 60000)
  const renderer = {
    domElement: { width: w, height: h }, _precompilationState: null,
    getPixelRatio: () => 1, setPixelRatio() {}, setSize() {}, setRenderTarget() {},
    readRenderTargetPixelsAsync: async (_rt, _x, _y, ww, hh) => new Float32Array(ww * hh * 4),
  }
  // one post.render() is one render of the scene: a new frame id, and every shadow node's updateBefore, as the renderer runs it
  const frame = { renderer, camera, frameId: 0 }
  const post = { render() { frame.frameId++; far.updateBefore(frame); near.updateBefore(frame) } }
  const shadows = [sun.shadow, holder.shadow]
  const flags = () => shadows.map((s) => [s.autoUpdate, s.needsUpdate])
  const set = (f) => shadows.forEach((s, k) => { [s.autoUpdate, s.needsUpdate] = f[k] })
  const still = (n, each) => R.accumulate(renderer, camera, post, w, h, n, each)
  return { draws, shadows, flags, set, still }
}

test('without the hold a still call of n sub-frames redraws each sun map n times (the base\'s still calls)', async () => {
  const r = rig()
  await r.still(17)
  assert.deepEqual(r.draws, { far: 17, near: 17 })
})

test('held, a still call of n sub-frames draws each sun map once, on sub-frame 0, and runs the page\'s hook on each', async () => {
  for (const n of [1, 2, 17]) {
    const r = rig()
    const seen = []
    await L.holdSunMaps(r.shadows, (i) => { seen.push([i, r.draws.far, r.draws.near]) }, (each) => r.still(n, each))
    assert.deepEqual(r.draws, { far: 1, near: 1 }, `n ${n}`)
    assert.deepEqual(seen.map((x) => x[0]), [...Array(n).keys()])
    // the hook runs before its sub-frame renders: nothing is drawn before sub-frame 0
    assert.deepEqual(seen[0], [0, 0, 0])
  }
})

test('after a still call every sun shadow\'s autoUpdate and needsUpdate are what they were before it', async () => {
  const states = [[true, false], [true, true], [false, true], [false, false]]
  for (const a of states) for (const b of states) {
    const r = rig()
    r.set([a, b])
    await L.holdSunMaps(r.shadows, undefined, (each) => r.still(17, each))
    assert.deepEqual(r.flags(), [a, b], `before ${JSON.stringify([a, b])}`)
    // sub-frame 0 is the base's own: a map draws there when either flag was on, and never again in the call
    assert.deepEqual(r.draws, { far: a[0] || a[1] ? 1 : 0, near: b[0] || b[1] ? 1 : 0 })
  }
})

test('a still call that throws puts the flags back too, and the next live frame draws both maps', async () => {
  const r = rig()
  await assert.rejects(L.holdSunMaps(r.shadows, (i) => { if (i === 3) throw new Error('sub-frame 3') }, (each) => r.still(17, each)), /sub-frame 3/)
  assert.deepEqual(r.flags(), [[true, false], [true, false]])
  const before = { ...r.draws }
  await r.still(1)
  assert.deepEqual(r.draws, { far: before.far + 1, near: before.near + 1 })
})

test('the three still calls (map, gate, open) accumulate through the walk light\'s hold; the sampled sky alone does not', () => {
  const code = (f) => readFileSync(join(W, 'babylon', f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/\/\/.*$/, '')).join('\n')
  for (const f of ['map/map.ts', 'gate/gate.ts', 'open/open.ts']) {
    const src = code(f)
    const calls = src.match(/accumulate\(renderer/g) ?? []
    const held = src.match(/L\.still\([^\n]*=>\s*accumulate\(renderer/g) ?? []
    // the map's sampled sky jitters the sun over its disc every sub-frame: there the maps must draw on each one
    const sampled = f === 'map/map.ts' ? (src.match(/skyS\s*\?\s*await accumulate\(renderer/g) ?? []) : []
    assert.equal(held.length, 1, `${f}: one held still call`)
    assert.equal(calls.length, held.length + sampled.length, `${f}: ${calls.length} accumulate calls, ${held.length} held`)
  }
  const light = code('open/light.ts')
  assert.match(light, /still:[^\n]*\n\s*holdSunMaps\(\[sunLight\.shadow, holder\.shadow\]/, 'walkLight holds both of its maps')
})
