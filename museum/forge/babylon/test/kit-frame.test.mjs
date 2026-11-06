// Every sub-frame of a still draws its own scene (cave/render.ts accumulate): three draws its frame nodes (the scene
// pass, the occlusion, its denoise) once per node frame, and only the renderer's animation tick advances that frame, so
// a still's sub-frames drawn inside one tick would repeat one jittered image. Driven through the kit's own accumulate
// and three's own NodeFrame gating (real Node, ShadowNode and NodeFrame), with a counting renderer in place of the GPU
// and no animation tick inside the call (the tightest case of the page).
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
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
const { DirectionalLight, Node, NodeFrame, NodeUpdateType, PassNode, PerspectiveCamera, Scene, ShadowNode } = await import('three/webgpu')

/** a frame node as three runs it: drawn in updateBefore, once per node frame */
function frameNode(count) {
  const n = new Node()
  n.updateBeforeType = NodeUpdateType.FRAME
  n.updateBefore = () => { count.n++ }
  return n
}

/** the kit's pipeline: post.render() is one render whose scene pass (and the occlusion beside it) are frame nodes; the
    scene pass's own render of the scene updates both sun maps (render nodes, three's ShadowNode) */
function rig(w = 8, h = 6) {
  const nodeFrame = new NodeFrame()
  const renderer = {
    isRenderer: true, _nodes: { nodeFrame }, _precompilationState: null,
    domElement: { width: w, height: h }, getPixelRatio: () => 1, setPixelRatio() {}, setSize() {}, setRenderTarget() {},
    readRenderTargetPixelsAsync: async (_rt, _x, _y, ww, hh) => new Float32Array(ww * hh * 4),
  }
  nodeFrame.renderer = renderer
  const camera = new PerspectiveCamera(50, w / h, 0.3, 60000)
  const sun = new DirectionalLight()
  sun.castShadow = true
  const holder = { shadow: sun.shadow.clone(), castShadow: true }
  const draws = { scene: 0, ao: 0, far: 0, near: 0 }
  const far = new ShadowNode(sun, sun.shadow), near = new ShadowNode(holder, holder.shadow)
  far.updateShadow = () => { draws.far++ }
  near.updateShadow = () => { draws.near++ }
  const sceneCount = { n: 0 }, aoCount = { n: 0 }
  const scenePass = frameNode(sceneCount), ao = frameNode(aoCount)
  scenePass.updateBefore = () => {
    sceneCount.n++
    nodeFrame.renderId++
    nodeFrame.camera = camera
    nodeFrame.updateBeforeNode(far)
    nodeFrame.updateBeforeNode(near)
  }
  const post = {
    render() {
      nodeFrame.renderId++
      nodeFrame.updateBeforeNode(scenePass)
      nodeFrame.updateBeforeNode(ao)
      draws.scene = sceneCount.n
      draws.ao = aoCount.n
    },
  }
  const still = (n, each) => R.accumulate(renderer, camera, post, w, h, n, each)
  const held = (n, each) => L.holdSunMaps([sun.shadow, holder.shadow], each, (e) => R.accumulate(renderer, camera, post, w, h, n, e))
  // the renderer's own tick between calls, as the page's rAF gives it
  const tick = () => nodeFrame.update()
  return { draws, nodeFrame, renderer, camera, post, still, held, tick }
}

test('three still gates the kit\'s pass and its occlusion by the node frame (the gate this fix answers)', () => {
  assert.equal(new PassNode(PassNode.COLOR, new Scene(), new PerspectiveCamera()).updateBeforeType, NodeUpdateType.FRAME)
  const nf = new NodeFrame()
  const c = { n: 0 }
  const node = frameNode(c)
  nf.update()
  nf.updateBeforeNode(node)
  nf.updateBeforeNode(node)
  assert.equal(c.n, 1, 'a frame node draws once per node frame')
  nf.update()
  nf.updateBeforeNode(node)
  assert.equal(c.n, 2, 'NodeFrame.update() is what lets it draw again')
})

test('a still call of n sub-frames draws n scene passes and n occlusion passes, with no tick inside the call', async () => {
  for (const n of [1, 2, 17]) {
    const r = rig()
    r.tick()
    await r.still(n)
    assert.equal(r.draws.scene, n, `scene passes of a ${n}-sub-frame call`)
    assert.equal(r.draws.ao, n, `occlusion passes of a ${n}-sub-frame call`)
    // two calls in a row inside one tick: the second draws all of its own as well
    await r.still(n)
    assert.equal(r.draws.scene, 2 * n)
  }
})

test('held (walkLight\'s still): n scene passes and each sun map once a call, on sub-frame 0', async () => {
  for (const n of [1, 2, 17]) {
    const r = rig()
    r.tick()
    const seen = []
    await r.held(n, (i) => seen.push([i, r.draws.scene]))
    assert.equal(r.draws.scene, n)
    assert.deepEqual([r.draws.far, r.draws.near], [1, 1], `sun maps of a held ${n}-sub-frame call`)
    // the page's hook runs on every sub-frame, before that sub-frame's render
    assert.deepEqual(seen, Array.from({ length: n }, (_, i) => [i, i]))
    // the next held call redraws both maps on its own sub-frame 0
    await r.held(n)
    assert.deepEqual([r.draws.far, r.draws.near], [2, 2])
  }
})

test('the node frame moves once a sub-frame, and three\'s time runs forward with the clock', async () => {
  const r = rig()
  r.tick()
  const id0 = r.nodeFrame.frameId, t0 = r.nodeFrame.time
  await r.still(17)
  assert.equal(r.nodeFrame.frameId, id0 + 17)
  assert.ok(r.nodeFrame.time >= t0)
})

test('a stand-in renderer is left alone; a renderer without its node frame fails loudly', async () => {
  const r = rig()
  const bare = { ...r.renderer }
  delete bare.isRenderer
  delete bare._nodes
  await R.accumulate(bare, r.camera, { render() {} }, 8, 6, 3)
  const broken = { ...r.renderer, _nodes: null }
  await assert.rejects(R.accumulate(broken, r.camera, { render() {} }, 8, 6, 3), /nodeFrame/)
})
