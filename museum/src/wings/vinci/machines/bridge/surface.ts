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
    const d = stack.detail(pole, { ...s, normalStrength: 0.4, grain: s.grain ? { ...s.grain, relief: 0.1, shade: 0.14, sheen: 0.04 } : null }, { uv: uv(), count: 3, maps: maps(s), fade: [6, 40] })
    const T: N = attribute('aTone', 'vec3'), seed: N = attribute('aSeed', 'float')
    const tone = T.x, peeled = T.y, end = T.z
    // the stem's UVs: along it (the photograph's grain) and round it; the cut ends carry their own face coordinates
    const v = uv().x, u = uv().y
    const o = seed.mul(37.1)
    // BARK: shallow fissures running along the stem and wandering, plates between, lenticels across
    // chestnut coppice bark at about twenty years: long shallow fissures along the stem, flat grey ridges between,
    // their tops rough; lenticels across where it is still smooth; a little lichen. Each line fades before a pixel
    // holds it, so the bark settles to its mean tone at a distance instead of shimmering.
    const warp = mx_noise_float(vec3(u.mul(4.1).add(o), v.mul(0.8), 3.7)).mul(0.55)
    const fPhase = u.mul(26).add(warp.mul(2)).add(o)
    const fis = mx_noise_float(vec3(fPhase, v.mul(2.4), o.mul(0.3)))
    const lineFade = float(1).sub(smoothstep(0.03, 0.12, fwidth(fPhase)))
    const crackRun = smoothstep(0.3, 0.62, mx_noise_float(vec3(u.mul(3.0).add(o), v.mul(0.9), 6.6)).mul(0.5).add(0.5))
    const fissure = float(1).sub(smoothstep(0.006, 0.035, fis.abs())).mul(crackRun).mul(lineFade)
    const shoulder = float(1).sub(smoothstep(0.03, 0.09, fis.abs())).mul(crackRun).mul(lineFade)
    const micro = mx_noise_float(vec3(u.mul(70).add(o), v.mul(26), 1.9))
    const microFade = float(1).sub(smoothstep(0.15, 0.5, fwidth(u.mul(70))))
    const lent = smoothstep(0.7, 0.84, mx_noise_float(vec3(u.mul(6).add(o), v.mul(60), 7.7))).mul(float(1).sub(crackRun.mul(0.7))).mul(float(1).sub(smoothstep(0.15, 0.5, fwidth(v.mul(60)))))
    const plate = mx_noise_float(vec3(u.mul(5).add(o), v.mul(1.3), 2.3)).mul(0.5).add(0.5)
    const mottle = mx_noise_float(vec3(u.mul(1.6).add(o), v.mul(0.45), 9.1)).mul(0.5).add(0.5)
    const lichen = smoothstep(0.64, 0.8, mx_noise_float(vec3(u.mul(3.5).add(o), v.mul(1.2), 4.9)).mul(0.5).add(0.5))
    // the photograph's own checks and grain along the stem give the bark its texture; greyed and darkened
    const rel = luma(d.albedo).div(Math.max(0.05, 0.2126 * s.albedo.r + 0.7152 * s.albedo.g + 0.0722 * s.albedo.b)).clamp(0.2, 2.2)
    const ridgeTop = mx(mx(lin('#554b41'), lin('#6c645a'), plate.mul(0.7)), lin('#5a4a3b'), mottle.mul(0.45)).mul(rel.pow(1.35))
    const barkCol = mx(mx(ridgeTop, lin('#7a786b'), lichen.mul(0.28)).mul(micro.mul(microFade).mul(0.18).add(1)), lin('#2a221b'), fissure.mul(0.75))
      .mul(float(1).sub(shoulder.mul(0.12))).mul(float(1).add(lent.mul(0.25)))
    const barkH = fissure.negate().mul(0.0025).sub(shoulder.mul(0.0008)).add(micro.mul(microFade).mul(0.00035)).add(lent.mul(0.0002))
    // PEELED: pale wood under the drawknife, its strokes as narrow facets along the stem, bark left in the hollows
    const fibres = luma(d.albedo)
    const facetPhase = u.div(0.026).add(mx_noise_float(vec3(v.mul(0.9), o, 1.1)).mul(1.4))
    const facet = facetPhase.fract().sub(0.5)
    const facetH = facet.mul(facet).negate().mul(0.006).mul(fade(facetPhase, 1))
    const remnant = smoothstep(0.55, 0.75, mx_noise_float(vec3(u.mul(9).add(o), v.mul(2.2), 5.1)).mul(0.5).add(0.5)).mul(0.8)
    const woodCol = mx(lin('#9c8466').mul(fibres.mul(0.45).add(0.66)), barkCol, remnant)
    const sideCol = mx(barkCol, woodCol, peeled).mul(tone)
    // END GRAIN: an axe's cut, the rings round the pith, the sapwood paler, the bark a dark rim
    const rr = vec2(u, v).length()
    const rings = sin(rr.add(mx_noise_float(vec3(u.mul(30), v.mul(30), o)).mul(0.0018)).div(0.0042).mul(Math.PI * 2)).mul(0.5).add(0.5)
    const ringFade = fade(rr.div(0.0042).mul(Math.PI * 2), 1)
    // chestnut: a brown heart, a narrow pale sapwood, the bark a dark rim; the rings show across both
    const heart = smoothstep(0.05, 0.058, rr)
    const cutStroke = mx_noise_float(vec3(u.mul(4), v.mul(70), o)).mul(0.5).add(0.5)
    const endCol = mx(lin('#a78560'), lin('#bc9f78'), heart).mul(float(1).sub(rings.mul(ringFade).mul(0.22))).mul(cutStroke.mul(0.12).add(0.9))
      .mul(float(1).sub(smoothstep(0.066, 0.072, rr).mul(0.6))).mul(smoothstep(0, 0.004, rr).mul(0.25).add(0.75))
    pole.colorNode = mx(sideCol, endCol, end).mul(d.occlusion).mul(keyRim(0.45).add(1))
    pole.roughnessNode = mx(mx(float(0.86).add(fissure.mul(0.1)), d.roughness.clamp(0.6, 0.8), peeled), float(0.82), end)
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
    const tufts = mx_noise_float(vec3(p.x.mul(6.5), p.z.mul(6.5), 4.4)).mul(0.22).add(mx_noise_float(vec3(p.x.mul(0.9), p.z.mul(0.9), 1.4)).mul(0.18)).add(0.5)
    const trodden = float(1).sub(smoothstep(1.2, 2.4, vec2(p.x.add(6.3), p.z.mul(0.6)).length()).mul(0.5).add(0.5)).clamp(0, 1)
    const grassy = smoothstep(0.82, 0.95, up).mul(lip).mul(smoothstep(0.2, 0.55, tufts).mul(0.75).add(0.2)).mul(float(1).sub(trodden.mul(0.6)))
    const wet = float(1).sub(smoothstep(BANK.water - 0.02, BANK.water + 0.18, p.y))
    const earthCol = lin('#6a5843').mul(luma(ground.albedo).mul(0.6).add(0.55)).mul(float(1).sub(wet.mul(0.42)))
    // the cut face: a section through the bank, darker with depth, its layers
    const cut = float(1).sub(smoothstep(0.2, 0.5, up))
    const strata = sin(p.y.mul(23).add(mx_noise_float(vec3(p.x.mul(0.8), p.y.mul(2), p.z.mul(0.8))).mul(1.3))).mul(0.5).add(0.5)
    const sectionCol = mx(lin('#4f4031'), lin('#6b5a44'), strata.mul(0.5)).mul(luma(ground.albedo).mul(0.5).add(0.6)).mul(smoothstep(BANK.bottom, 0, p.y).mul(0.35).add(0.65))
    const grassCol = mx(lin('#5d6141'), lin('#6f6a48'), tufts).mul(luma(grass.albedo).mul(0.6).add(0.5))
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
    const ripple = mx_noise_float(flow.mul(vec3(1.1, 0.7, 1)).mul(1.3)).mul(0.6).add(mx_noise_float(flow.mul(3.3).add(3.3)).mul(0.22))
    // the bank's toe runs under the surface: the shallows show its earth, the middle is deep and dark
    const shallow = smoothstep(3.2, 3.85, p.x.abs()).mul(smoothstep(-0.2, 0.2, p.y.sub(BANK.water - 0.1)))
    const cut = smoothstep(BANK.water - 0.03, BANK.water - 0.3, p.y)
    water.colorNode = mx(mx(lin('#2b2d22'), lin('#423e2d'), shallow), lin('#11140f'), cut)
    water.normalNode = bumped(normalView, ripple.mul(0.022), 1)
    water.roughnessNode = float(0.07)
    water.envMapIntensity = 0.42
  }
  return { pole, hemp, earth, water, lashClock: lashClock as unknown as { value: number }, streamClock: streamClock as unknown as { value: number }, sets }
}
