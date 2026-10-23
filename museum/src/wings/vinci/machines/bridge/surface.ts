/** THE BRIDGE'S SURFACES. Chestnut coppice poles (the species is ours), some
 * in their bark and some peeled with a drawknife, each pole its own tone;
 * the end grain where an axe cut them; hemp lashings, laid three strand and
 * served with a tarred line where they bear on a pole; the bank's packed
 * earth and grass, and the stream. The library's photographs give the grain
 * and the earth; the bark, the facets, the lay and the serving are drawn
 * here, each faded as one pixel comes to hold more than a stroke of it.
 */
import { Color, MeshStandardNodeMaterial, type Material } from 'three/webgpu'
import { attribute, cameraPosition, cos, float, fwidth, mix, mx_noise_float, normalView, normalWorld, positionLocal, positionView, positionWorld, sin, smoothstep, step, uniform, uv, vec2, vec3 } from 'three/tsl'
import type { MaterialSet, Stack } from '../../../../stack'
import { loadMachineMaterial, materialDressed } from '../parts'
import { benchKeyDirection } from '../key'
import { BANK, ROPE_R } from './plan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const lin = (hex: string): N => { const c = new Color(hex); return vec3(c.r, c.g, c.b) }
const luma = (n: N): N => n.dot(vec3(0.2126, 0.7152, 0.0722))
// the node types narrow a mix of colours and weights to nothing; the graph is checked when it compiles
const mx: N = mix

/** a pattern's contrast, gone before one pixel holds a whole stripe of it */
function fade(phase: N, strength: number): N {
  return float(1).sub(fwidth(phase).mul(0.5)).clamp(0, 1).mul(strength)
}

/** a height on the surface tilts the shading normal (the surface-gradient bump, from the screen's own derivatives) */
function bumped(base: N, height: N, strength: number): N {
  const n = base.normalize()
  const dpx = positionView.dFdx(), dpy = positionView.dFdy()
  const r1 = dpy.cross(n), r2 = n.cross(dpx)
  const det = dpx.dot(r1)
  const grad = r1.mul(height.dFdx()).add(r2.mul(height.dFdy())).mul(det.sign())
  return n.mul(det.abs()).sub(grad.mul(strength)).normalize()
}

/** the bench's key finds a pole's edge at a distance */
function keyRim(strength: number): N {
  const key = benchKeyDirection()
  if (!key) return float(0)
  const toEye = cameraPosition.sub(positionWorld).normalize()
  const grazing = float(1).sub(normalWorld.dot(toEye).abs()).clamp(0, 1).pow(2.6)
  const lit = normalWorld.dot(vec3(key.x, key.y, key.z)).mul(0.5).add(0.5).pow(1.5)
  return grazing.mul(lit).mul(strength)
}

export interface BridgeSurfaces {
  pole: Material
  hemp: Material
  earth: Material
  water: Material
  /** the build clock the lashings wind by; below zero every lashing is off */
  lashClock: { value: number }
  /** the stream's own time */
  streamClock: { value: number }
  sets: Set<MaterialSet>
}

export async function bridgeSurfaces(stack: Stack): Promise<BridgeSurfaces> {
  const names = ['oak-beams', 'rope', 'earth-packed', 'grass-short'] as const
  const loaded = await Promise.all(names.map(n => loadMachineMaterial(stack, n)))
  const set = Object.fromEntries(names.map((n, i) => [n, loaded[i]!])) as Record<(typeof names)[number], MaterialSet>
  const sets = new Set<MaterialSet>(loaded)
  const maps = (s: MaterialSet): number => (materialDressed(s) ? 1 : 0)

  // ---------------------------------------------------------------- POLES
  const pole = new MeshStandardNodeMaterial({ metalness: 0, roughness: 0.85 })
  pole.name = `bridge-of-poles:pole:${set['oak-beams'].name}`
  {
    const s = set['oak-beams']
    const d = stack.detail(pole, { ...s, normalStrength: 0.22, grain: s.grain ? { ...s.grain, relief: 0.1, shade: 0.14, sheen: 0.04 } : null }, { uv: uv(), count: 3, maps: maps(s), fade: [6, 40] })
    const T: N = attribute('aTone', 'vec3'), seed: N = attribute('aSeed', 'float')
    const tone = T.x, peeled = T.y, end = T.z
    const u = uv().x, v = uv().y
    const o = seed.mul(37.1)
    // BARK: shallow fissures running along the stem and wandering, plates between, lenticels across
    const fis = mx_noise_float(vec3(u.mul(16).add(o), v.mul(1.4), o.mul(0.3)))
    const ridge = float(1).sub(fis.abs().mul(3.2)).clamp(0, 1).pow(2)
    const fissure = ridge.mul(fade(u.mul(16), 1))
    const plate = mx_noise_float(vec3(u.mul(5).add(o), v.mul(0.7), 2.3)).mul(0.5).add(0.5)
    const lent = smoothstep(0.62, 0.8, mx_noise_float(vec3(u.mul(4).add(o), v.mul(48), 7.7))).mul(fade(v.mul(48), 1))
    const barkCol = mx(mx(lin('#5b4c3e'), lin('#757063'), plate.mul(0.75)), lin('#2f251d'), fissure.mul(0.75)).mul(float(1).add(lent.mul(0.35)))
    const barkH = fissure.negate().mul(0.004).add(plate.mul(0.0012))
    // PEELED: pale wood under the drawknife, its strokes as narrow facets along the stem, bark left in the hollows
    const fibres = luma(d.albedo)
    const facetPhase = u.div(0.026).add(mx_noise_float(vec3(v.mul(0.9), o, 1.1)).mul(1.4))
    const facet = facetPhase.fract().sub(0.5)
    const facetH = facet.mul(facet).negate().mul(0.006).mul(fade(facetPhase, 1))
    const remnant = smoothstep(0.55, 0.75, mx_noise_float(vec3(u.mul(9).add(o), v.mul(2.2), 5.1)).mul(0.5).add(0.5)).mul(0.8)
    const woodCol = mx(lin('#b7996c').mul(fibres.mul(0.5).add(0.62)), barkCol, remnant)
    const sideCol = mx(barkCol, woodCol, peeled).mul(tone)
    // END GRAIN: an axe's cut, the rings round the pith, the sapwood paler, the bark a dark rim
    const rr = vec2(u, v).length()
    const rings = sin(rr.add(mx_noise_float(vec3(u.mul(30), v.mul(30), o)).mul(0.0018)).div(0.0042).mul(Math.PI * 2)).mul(0.5).add(0.5)
    const ringFade = fade(rr.div(0.0042).mul(Math.PI * 2), 1)
    const heart = smoothstep(0.045, 0.055, rr)
    const cutStroke = mx_noise_float(vec3(u.mul(4), v.mul(70), o)).mul(0.5).add(0.5)
    const endCol = mx(lin('#8a6a46'), lin('#c2a57a'), heart).mul(float(1).sub(rings.mul(ringFade).mul(0.16))).mul(cutStroke.mul(0.14).add(0.9))
      .mul(float(1).sub(smoothstep(0.06, 0.07, rr).mul(0.55)))
    pole.colorNode = mx(sideCol, endCol, end).mul(d.occlusion).mul(keyRim(0.45).add(1))
    pole.roughnessNode = mx(mx(float(0.9), d.roughness.clamp(0.6, 0.8), peeled), float(0.82), end)
    const h = mx(mx(barkH, facetH, peeled), float(0), end)
    pole.normalNode = bumped(pole.normalNode ?? normalView, h, 1)
  }

  // ---------------------------------------------------------------- HEMP
  const lashClock = uniform(1e6)
  const hemp = new MeshStandardNodeMaterial({ metalness: 0, roughness: 0.8 })
  hemp.name = `bridge-of-poles:hemp:${set['rope'].name}`
  {
    const s = set['rope']
    const d = stack.detail(hemp, s, { uv: uv(), count: 3, maps: maps(s), fade: [6, 35] })
    const spine: N = attribute('aSpine', 'vec3'), born: N = attribute('aBorn', 'float'), served: N = attribute('aServe', 'float')
    // a rope not yet wound lies on its own centre: nothing to see, nothing to cast
    hemp.positionNode = mx(spine, positionLocal, step(born, lashClock))
    const u = uv().x, v = uv().y
    // laid: three strands round the rope at a slant, a whole number round
    const STRAND = (Math.PI * 2 * ROPE_R) / 3
    const layPhase = u.div(STRAND).add(v.div(0.024)).mul(Math.PI * 2)
    const layGroove = cos(layPhase).mul(0.5).add(0.5).pow(0.7)
    const layShade = float(1).sub(fade(layPhase, 0.34).mul(float(1).sub(layGroove)))
    // served: a thin tarred line wound close round the rope where it bears
    const servePhase = v.div(0.0032).mul(Math.PI * 2)
    const serveShade = float(1).sub(fade(servePhase, 0.22).mul(cos(servePhase).mul(-0.5).add(0.5)))
    const T: N = attribute('aTone', 'vec3')
    const laid = lin('#9a8661').mul(luma(d.albedo).mul(0.55).add(0.55)).mul(layShade)
    const tarred = lin('#4c4030').mul(luma(d.albedo).mul(0.3).add(0.8)).mul(serveShade)
    hemp.colorNode = mx(laid, tarred, served).mul(T.x).mul(d.occlusion).mul(keyRim(0.5).add(1))
    hemp.roughnessNode = mx(d.roughness.max(0.66), float(0.55), served)
    const hLay = cos(layPhase).mul(fade(layPhase, 0.0009)), hServe = cos(servePhase).mul(fade(servePhase, 0.0004))
    hemp.normalNode = bumped(hemp.normalNode ?? normalView, mx(hLay, hServe, served), 1)
  }

  // ---------------------------------------------------------------- THE BANK
  const earth = new MeshStandardNodeMaterial({ metalness: 0, roughness: 0.95 })
  earth.name = `bridge-of-poles:earth:${set['earth-packed'].name}`
  {
    const se = set['earth-packed'], sg = set['grass-short']
    const ground = stack.detail(earth, se, { uv: uv(), count: 3, maps: maps(se), fade: [12, 90] })
    const grassMat = new MeshStandardNodeMaterial()
    const grass = stack.detail(grassMat, sg, { uv: uv().mul(1.3), count: 3, maps: maps(sg), fade: [12, 90] })
    const p: N = positionWorld
    const up = normalWorld.y.clamp(0, 1)
    // grass keeps to the level bank, thins toward the lip and the trodden ground by the pile, never on the cut face
    const lip = smoothstep(BANK.lip - 0.15, BANK.lip + 0.5, p.x.abs())
    const tufts = mx_noise_float(vec3(p.x.mul(1.7), p.z.mul(1.7), 4.4)).mul(0.5).add(0.5)
    const trodden = float(1).sub(smoothstep(1.2, 2.4, vec2(p.x.add(6.3), p.z.mul(0.6)).length()).mul(0.5).add(0.5)).clamp(0, 1)
    const grassy = smoothstep(0.82, 0.95, up).mul(lip).mul(smoothstep(0.25, 0.6, tufts)).mul(float(1).sub(trodden.mul(0.7)))
    const wet = float(1).sub(smoothstep(BANK.water - 0.02, BANK.water + 0.18, p.y))
    const earthCol = lin('#6a5843').mul(luma(ground.albedo).mul(0.6).add(0.55)).mul(float(1).sub(wet.mul(0.42)))
    // the cut face: a section through the bank, darker with depth, its layers
    const cut = float(1).sub(smoothstep(0.2, 0.5, up))
    const strata = sin(p.y.mul(23).add(mx_noise_float(vec3(p.x.mul(0.8), p.y.mul(2), p.z.mul(0.8))).mul(1.3))).mul(0.5).add(0.5)
    const sectionCol = mx(lin('#4f4031'), lin('#6b5a44'), strata.mul(0.5)).mul(luma(ground.albedo).mul(0.5).add(0.6)).mul(smoothstep(BANK.bottom, 0, p.y).mul(0.35).add(0.65))
    const grassCol = lin('#5f6440').mul(luma(grass.albedo).mul(0.7).add(0.45))
    earth.colorNode = mx(mx(earthCol, grassCol, grassy), sectionCol, cut).mul(ground.occlusion)
    earth.roughnessNode = mx(ground.roughness.max(0.85), float(0.55), wet.mul(0.6))
    grassMat.dispose()
  }

  // ---------------------------------------------------------------- THE STREAM
  const streamClock = uniform(0)
  const water = new MeshStandardNodeMaterial({ metalness: 0, roughness: 0.1 })
  water.name = 'bridge-of-poles:water:plain'
  {
    const p: N = positionWorld
    // a slow stream along Z, its ripples broad enough never to shimmer at the bench's distances
    const flow = vec3(p.x.mul(0.9), p.z.mul(0.5).sub(streamClock.mul(0.12)), streamClock.mul(0.05))
    const ripple = mx_noise_float(flow.mul(1.6)).mul(0.6).add(mx_noise_float(flow.mul(4.1).add(3.3)).mul(0.25))
    const depth = smoothstep(BANK.water - 0.05, BANK.bed, p.y)
    water.colorNode = mx(lin('#2a2b22'), lin('#141814'), depth.max(0.6))
    water.normalNode = bumped(normalView, ripple.mul(0.012), 1)
    water.roughnessNode = float(0.12)
  }
  return { pole, hemp, earth, water, lashClock: lashClock as unknown as { value: number }, streamClock: streamClock as unknown as { value: number }, sets }
}
