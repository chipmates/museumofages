/** THE BRIDGE'S SURFACES. Chestnut coppice poles (the species is ours), some
 * in their bark and some peeled with a drawknife, each pole its own tone;
 * the end grain where an axe cut them; hemp lashings, laid three strand and
 * served with a tarred line where they bear on a pole; the bank's packed
 * earth and grass, and the stream. The library's photographs give the grain
 * and the earth; the bark, the facets, the lay and the serving are drawn
 * here, each faded as one pixel comes to hold more than a stroke of it.
 */
import { Color, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, type Material } from 'three/webgpu'
import { atan, attribute, cameraPosition, cos, float, fwidth, mix, mx_noise_float, mx_worley_noise_vec2, normalView, normalViewGeometry, normalWorld, positionLocal, positionView, positionWorld, screenUV, sin, smoothstep, step, uniform, uv, vec2, vec3 } from 'three/tsl'
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
  waterTop: Material
  /** hand the level face its planar reflection */
  mirror: (reflection: unknown) => void
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
    // chestnut coppice bark at about twenty years: flat grey plates between a net of shallow cracks, the net long
    // along the stem; the plates rough and a little lighter at their middles; lenticels across; some lichen. Drawn on
    // the stem's own cylinder, so no seam runs along it, and faded before a pixel holds a crack.
    const C: N = attribute('aCyl', 'vec3')
    const q0 = vec3(C.x.mul(3.4).add(o), C.y.mul(21), C.z.mul(21))
    // the net wanders, and only part of it has opened: some plates are still one skin
    const q = q0.add(vec3(mx_noise_float(q0.mul(0.9)).mul(0.35), mx_noise_float(q0.mul(1.3).add(7.1)).mul(0.25), mx_noise_float(q0.mul(1.1).add(3.3)).mul(0.25)))
    const cells = mx_worley_noise_vec2(q)
    const edge = cells.y.sub(cells.x)
    const open = smoothstep(0.38, 0.62, mx_noise_float(q0.mul(vec3(0.6, 0.35, 0.35)).add(5.5)).mul(0.5).add(0.5))
    const width = mx_noise_float(q0.mul(1.7).add(9.9)).mul(0.04).add(0.07)
    // gone before a pixel spans a fifth of a plate across the stem, where a grazing view packs the net into a zipper
    const crackFade = float(1).sub(smoothstep(0.08, 0.3, fwidth(edge))).mul(float(1).sub(smoothstep(0.12, 0.3, fwidth(q0.y).add(fwidth(q0.z)))))
    const fissure = float(1).sub(smoothstep(width.mul(0.2), width, edge)).mul(open.mul(0.85).add(0.15)).mul(crackFade)
    const shoulder = float(1).sub(smoothstep(width, width.mul(4), edge)).mul(open).mul(crackFade)
    // a pixel's span round the stem: both of the cylinder's cross coordinates, or one of them misses the silhouette
    const roundFw = fwidth(C.y).add(fwidth(C.z))
    const microQ = vec3(C.x.mul(40), C.y.mul(190), C.z.mul(190))
    const micro = mx_noise_float(microQ)
    const microFade = float(1).sub(smoothstep(0.15, 0.6, roundFw.mul(190).add(fwidth(C.x.mul(40)))))
    const plate = mx_noise_float(q.mul(0.5).add(4.2)).mul(0.5).add(0.5)
    const lent = smoothstep(0.7, 0.84, mx_noise_float(vec3(C.x.mul(60), C.y.mul(40), C.z.mul(40)))).mul(float(1).sub(smoothstep(0.15, 0.5, fwidth(C.x.mul(60)).add(fwidth(C.y.mul(40))).add(fwidth(C.z.mul(40))))))
    const mottle = mx_noise_float(vec3(C.x.mul(1.6).add(o), C.y.mul(8), C.z.mul(8))).mul(0.5).add(0.5)
    const lichen = smoothstep(0.62, 0.8, mx_noise_float(vec3(C.x.mul(1.2).add(o), C.y.mul(14), C.z.mul(14)).add(2.7)).mul(0.5).add(0.5))
    const plateTop = mx(mx(lin('#4a433c'), lin('#66615a'), plate), lin('#54473a'), mottle.mul(0.35)).mul(float(1).sub(cells.x.mul(0.15)))
    const barkCol = mx(mx(plateTop, lin('#7d7b6c'), lichen.mul(0.3)).mul(micro.mul(microFade).mul(0.34).add(1)), lin('#251e18'), fissure.mul(0.78))
      .mul(float(1).sub(shoulder.mul(0.2))).mul(float(1).add(lent.mul(0.22)))
    // the plates' own scaly skin, finer than the net and long along the stem
    const scaleQ = vec3(C.x.mul(14), C.y.mul(75), C.z.mul(75))
    const scaly = mx_noise_float(scaleQ.add(o)).mul(float(1).sub(smoothstep(0.2, 0.7, fwidth(C.x.mul(14)).add(roundFw.mul(75)))))
    // the screen's derivatives step in 2x2 blocks: a crack under two pixels wide keeps its colour and drops its relief
    const crackBump = float(1).sub(smoothstep(width.mul(0.25), width, fwidth(edge)))
    const barkH = fissure.negate().mul(0.005).sub(shoulder.mul(0.0022)).mul(crackBump).add(micro.mul(microFade).mul(0.0009)).add(scaly.mul(0.0011)).add(plate.mul(0.0006)).add(lent.mul(0.0002))
    // PEELED: pale wood under the drawknife, its strokes as narrow facets along the stem, bark left in the hollows
    const fibres = luma(d.albedo)
    const facetPhase = u.div(0.026).add(mx_noise_float(vec3(v.mul(0.9), o, 1.1)).mul(1.4))
    const facet = facetPhase.fract().sub(0.5)
    const facetH = facet.mul(facet).negate().mul(0.006).mul(fade(facetPhase, 1))
    const remnant = smoothstep(0.55, 0.75, mx_noise_float(vec3(u.mul(9).add(o), v.mul(2.2), 5.1)).mul(0.5).add(0.5)).mul(0.8)
    const woodCol = mx(lin('#8b7860').mul(fibres.mul(0.45).add(0.66)), barkCol, remnant)
    const sideCol = mx(barkCol, woodCol, peeled).mul(tone)
    // END GRAIN: an axe's cut, the rings round the pith, the sapwood paler, the bark a dark rim
    const rr = vec2(u, v).length()
    const rings = sin(rr.add(mx_noise_float(vec3(u.mul(30), v.mul(30), o)).mul(0.0018)).div(0.0042).mul(Math.PI * 2)).mul(0.5).add(0.5)
    const ringFade = fade(rr.div(0.0042).mul(Math.PI * 2), 1)
    // chestnut: a brown heart, a narrow pale sapwood, the bark a dark rim; the rings show across both
    const heart = smoothstep(0.05, 0.058, rr)
    const cutStroke = mx_noise_float(vec3(u.mul(4), v.mul(70), o)).mul(0.5).add(0.5)
    // the checks a drying end opens, a few along the rays
    const ang = atan(v, u)
    const check = smoothstep(0.986, 0.998, cos(ang.mul(5).add(o).add(mx_noise_float(vec3(rr.mul(60), o, 2.2)).mul(0.5)))).mul(smoothstep(0.012, 0.03, rr)).mul(fade(ang.mul(5), 1))
    const endCol = mx(lin('#7f6c58'), lin('#9c8c76'), heart).mul(float(1).sub(check.mul(0.55))).mul(float(1).sub(rings.mul(ringFade).mul(0.3))).mul(cutStroke.mul(0.12).add(0.9))
      .mul(float(1).sub(smoothstep(0.066, 0.072, rr).mul(0.6))).mul(smoothstep(0, 0.004, rr).mul(0.25).add(0.75))
    pole.colorNode = mx(sideCol, endCol, end).mul(mx(float(1), d.occlusion, peeled.max(end).max(0.3))).mul(keyRim(0.45).add(1))
    pole.roughnessNode = mx(mx(float(0.84).add(fissure.mul(0.12)).add(micro.mul(microFade).mul(0.05)), d.roughness.clamp(0.6, 0.8), peeled), float(0.82), end)
    const h = mx(mx(barkH, facetH, peeled), float(0), end)
    // the photograph's grain belongs to the wood: on the bark only a trace of it is kept
    const grainN: N = pole.normalNode ?? normalViewGeometry
    pole.normalNode = bumped(mx(normalViewGeometry, grainN, peeled.max(end).max(0.25)), h, 1)
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
    const laid = lin('#8c7d60').mul(luma(d.albedo).mul(0.55).add(0.55)).mul(layShade)
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
    const ground = stack.detail(earth, { ...se, normalStrength: 0.35 }, { uv: uv(), count: 3, maps: maps(se), fade: [12, 90] })
    const grassMat = new MeshStandardNodeMaterial()
    const grass = stack.detail(grassMat, sg, { uv: uv().mul(1.3), count: 3, maps: maps(sg), fade: [12, 90] })
    const p: N = positionWorld
    const up = normalWorld.y.clamp(0, 1)
    // grass keeps to the level bank, thins toward the lip and the trodden ground by the pile, never on the cut face
    const lip = smoothstep(BANK.lip - 0.15, BANK.lip + 0.5, p.x.abs())
    const tufts = mx_noise_float(vec3(p.x.mul(6.5), p.z.mul(6.5), 4.4)).mul(0.22).add(mx_noise_float(vec3(p.x.mul(0.9), p.z.mul(0.9), 1.4)).mul(0.18)).add(0.5)
    const trodden = float(1).sub(smoothstep(1.2, 2.4, vec2(p.x.add(6.3), p.z.mul(0.6)).length()).mul(0.5).add(0.5)).clamp(0, 1)
    const grassy = smoothstep(0.82, 0.95, up).mul(lip).mul(smoothstep(0.2, 0.55, tufts).mul(0.35).add(0.55)).mul(float(1).sub(trodden.mul(0.6)))
    const wet = float(1).sub(smoothstep(BANK.water - 0.02, BANK.water + 0.18, p.y))
    const earthCol = lin('#6a5843').mul(luma(ground.albedo).mul(0.4).add(0.68)).mul(float(1).sub(wet.mul(0.42)))
    // the cut face: a section through the bank, darker with depth, its layers
    const cut = float(1).sub(smoothstep(0.2, 0.5, up))
    const strata = sin(p.y.mul(23).add(mx_noise_float(vec3(p.x.mul(0.8), p.y.mul(2), p.z.mul(0.8))).mul(1.3))).mul(0.5).add(0.5)
    const sectionCol = mx(lin('#4f4031'), lin('#6b5a44'), strata.mul(0.5)).mul(luma(ground.albedo).mul(0.5).add(0.6)).mul(smoothstep(BANK.bottom, 0, p.y).mul(0.35).add(0.65))
    const grassCol = mx(lin('#5d6141'), lin('#6c6847'), tufts).mul(luma(grass.albedo).mul(0.35).add(0.72))
    earth.colorNode = mx(mx(earthCol, grassCol, grassy), sectionCol, cut).mul(mx(float(1), ground.occlusion, 0.55))
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
  // the level face: the same water, and the bridge and its banks mirrored in it at grazing angles
  // the sky's own sheen is cut low: the planar pass carries the mirror and its Fresnel, never both
  const waterTop = new MeshPhysicalNodeMaterial({ metalness: 0, roughness: 0.07, specularIntensity: 0.15 })
  waterTop.name = 'bridge-of-poles:water-top:plain'
  waterTop.colorNode = water.colorNode
  waterTop.normalNode = water.normalNode
  waterTop.roughnessNode = water.roughnessNode
  const mirror = (reflection: N): void => {
    const view = cameraPosition.sub(positionWorld).normalize()
    const fresnel = float(1).sub(normalWorld.dot(view).abs()).pow(5).mul(0.978).add(0.022)
    // the ripples shift the mirrored picture a little, as a stream's surface does
    reflection.uvNode = screenUV.flipX().add(normalView.xy.sub(normalViewGeometry.xy).mul(0.08))
    waterTop.colorNode = (water.colorNode as N).mul(float(1).sub(fresnel))
    waterTop.emissiveNode = reflection.rgb.mul(fresnel.mul(0.8))
    waterTop.needsUpdate = true
  }
  return { pole, hemp, earth, water, waterTop, mirror, lashClock: lashClock as unknown as { value: number }, streamClock: streamClock as unknown as { value: number }, sets }
}
