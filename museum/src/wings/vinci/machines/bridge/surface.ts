/** THE BRIDGE'S SURFACES. Chestnut coppice poles (the species is ours), some
 * in their bark and some peeled with a drawknife, each pole its own tone;
 * the end grain where an axe cut them; hemp lashings, laid three strand and
 * served with a tarred line where they bear on a pole; the bank's packed
 * earth and grass, and the stream. The library's photographs give the grain
 * and the earth; the bark, the facets, the lay and the serving are drawn
 * here, each faded as one pixel comes to hold more than a stroke of it.
 */
import { Color, MeshPhysicalNodeMaterial, MeshStandardNodeMaterial, type Material } from 'three/webgpu'
import { atan, attribute, cameraPosition, cos, float, fwidth, mix, mx_noise_float, mx_worley_noise_vec2, normalGeometry, normalView, normalViewGeometry, normalWorld, positionLocal, positionView, positionWorld, screenUV, sin, smoothstep, step, uniform, uv, vec2, vec3 } from 'three/tsl'
import type { MaterialSet, Stack } from '../../../../stack'
import { loadMachineMaterial, materialDressed } from '../parts'
import { benchKeyDirection } from '../key'
import { BANK, ROPE_R, SEAT_HALF, SEAT_R, SEAT_XY, VALLEY } from './plan'

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

/** the same tilt from a height whose slope is known on the stem's own cylinder: its screen slope by the chain rule, one
 * per pixel, where the screen's 2x2 derivative of a fine height steps in blocks along a fissure */
function bumpedBy(base: N, dhdx: N, dhdy: N): N {
  const n = base.normalize()
  const dpx = positionView.dFdx(), dpy = positionView.dFdy()
  const r1 = dpy.cross(n), r2 = n.cross(dpx)
  const det = dpx.dot(r1)
  const grad = r1.mul(dhdx).add(r2.mul(dhdy)).mul(det.sign())
  return n.mul(det.abs()).sub(grad).normalize()
}

/** the air between the bridge and the wall: what lies well behind the bridge's middle, as the eye sees it, loses its
 * value and its colour toward the dusk, so the far bank falls off toward the wall */
function airBehind(col: N): N {
  const behind = positionWorld.sub(cameraPosition).length().sub(cameraPosition.sub(vec3(0, 1.35, 0)).length())
  return mx(col, vec3(luma(col)).mul(vec3(0.62, 0.68, 0.76)), smoothstep(1, 9, behind).mul(0.55))
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

  const lashClock = uniform(1e6)
  // ---------------------------------------------------------------- POLES
  const pole = new MeshStandardNodeMaterial({ metalness: 0, roughness: 0.85 })
  pole.name = `bridge-of-poles:pole:${set['oak-beams'].name}`
  {
    const s = set['oak-beams']
    const d = stack.detail(pole, { ...s, normalStrength: 0.4, grain: s.grain ? { ...s.grain, relief: 0.1, shade: 0.14, sheen: 0.04 } : null }, { uv: uv(), count: 3, maps: maps(s), fade: [6, 40] })
    const T: N = attribute('aTone', 'vec4'), seed: N = T.w
    const tone = T.x, peeled = T.y, end = T.z
    // the stem's UVs: along it (the photograph's grain) and round it; the cut ends carry their own face coordinates
    const v = uv().x, u = uv().y
    const o = seed.mul(37.1)
    // BARK: chestnut coppice at about twenty years: grey-brown plates between long fissures that wander, merge and part
    // along the stem, a few short cross-checks on the plates, the lenticels as small pale dashes across it, a fine
    // scaly skin; some lichen. Drawn on the stem's own cylinder, so no seam runs along it; each scale is gone before a
    // pixel holds less than a third of it.
    const C: N = attribute('aCyl', 'vec3')
    const px = C.dFdx().length().max(C.dFdy().length())
    const shows = (period: number): N => float(1).sub(smoothstep(period / 6, period / 2.5, px))
    const around: N = vec3(0, C.z.negate(), C.y).normalize()
    // the bark's fields at the pixel and 0.6 mm along the stem and round it: their slopes on the cylinder, and by the
    // chain rule their change across one pixel, exact per pixel where the screen's 2x2 derivatives step in blocks
    const EPS = 0.0006
    const twist = seed.mul(7).fract().mul(1.4).add(0.8).mul(seed.mul(2).sub(1).sign())
    // each pole's own bark: its plates' length (0.7 to 1.45 of the mean) and width round it (0.75 to 1.3), its fissures'
    // width, and where round the stem its pattern starts, so no two poles repeat one rhythm
    const along = seed.mul(13.7).fract().mul(0.75).add(0.7), round = seed.mul(5.3).add(0.37).fract().mul(0.55).add(0.75).mul(38)
    const wide = seed.mul(9.1).add(0.61).fract().mul(0.7).add(0.65), turn = seed.mul(23.9).fract().mul(Math.PI * 2)
    // and how deep its fissures run: a younger stem's shallow, an older one's deep
    const deep = seed.mul(17.3).add(0.21).fract().mul(0.6).add(0.6)
    const fieldsAt = (Q: N): Record<'net' | 'open' | 'line' | 'check' | 'patch' | 'skin' | 'lent', N> => ({
      // the plates: cells long along the stem (about 28 cm) and narrow round it (about 2.6 cm), their borders the fissures,
      // as far from a border as half the gap between the nearest two cells' distances (in metres round the stem)
      net: (() => {
        // the plates run in a slow spiral round the stem, as chestnut's do, each pole its own way, and wander off it;
        // the same slow field shifts the cells along the stem, so the lattice never reads as one diamond repeated
        const wander = mx_noise_float(vec3(Q.x.mul(1.5).add(o), Q.y.mul(3), Q.z.mul(3)).add(2.9))
        const a = Q.x.mul(twist).add(wander.mul(0.25)).add(turn)
        const ca = cos(a), sa = sin(a)
        const f = mx_worley_noise_vec2(vec3(Q.x.mul(along.mul(3.5)).add(o).add(wander.mul(0.8)), Q.y.mul(ca).sub(Q.z.mul(sa)).mul(round), Q.y.mul(sa).add(Q.z.mul(ca)).mul(round))).sqrt()
        return f.y.sub(f.x).mul(0.5).div(round)
      })(),
      open: smoothstep(-0.3, 0.4, mx_noise_float(vec3(Q.x.mul(3).add(o), Q.y.mul(10), Q.z.mul(10)).add(5.5))),
      line: mx_noise_float(vec3(Q.x.mul(5).add(o), Q.y.mul(45), Q.z.mul(45)).add(4.4)),
      check: mx_noise_float(vec3(Q.x.mul(along.mul(28)).add(o), Q.y.mul(7), Q.z.mul(7)).add(3.3)),
      patch: smoothstep(0.1, 0.5, mx_noise_float(vec3(Q.x.mul(9), Q.y.mul(20), Q.z.mul(20)).add(9.1))),
      skin: mx_noise_float(vec3(Q.x.mul(60), Q.y.mul(210), Q.z.mul(210))).mul(shows(0.006))
        .add(mx_noise_float(vec3(Q.x.mul(28), Q.y.mul(90), Q.z.mul(90)).add(1.7)).mul(shows(0.013)).mul(0.6)),
      lent: mx_noise_float(vec3(Q.x.mul(95), Q.y.mul(32), Q.z.mul(32)).add(6.6)),
    })
    const F0 = fieldsAt(C), FX = fieldsAt(C.add(vec3(EPS, 0, 0))), FT = fieldsAt(C.add(around.mul(EPS)))
    const dCx = C.dFdx(), dCy = C.dFdy()
    const slopeFrom = (v0: N, vx: N, vt: N): N => vec3(1, 0, 0).mul(vx.sub(v0)).add(around.mul(vt.sub(v0))).div(EPS)
    // each line drawn by its distance from the field's zero, the field over its own slope (held above a floor where the
    // field runs flat): a line keeps its width in millimetres, so a fissure never spreads into a blot
    const lineOf = (k: keyof typeof F0, floor: number): { slope: N; px: N } => {
      const g = slopeFrom(F0[k], FX[k], FT[k]), gl = g.length().max(1e-3)
      // a pixel's width along the field's slope, in metres
      return { slope: gl.max(floor), px: g.dot(dCx).abs().add(g.dot(dCy).abs()).div(gl) }
    }
    const NET = lineOf('net', 0.3), LINE = lineOf('line', 25), CHECK = lineOf('check', 15), LENT = lineOf('lent', 40)
    // a line w metres wide at a distance d from it, never drawn narrower than a pixel and a half; widened, it pales by
    // as much, so a fine line thins out and never steps. Its colour has a pixel's edge; its groove slopes across its
    // whole width, so the relief never turns on one pixel
    const band = (d: N, w: N, p: N): { ink: N; groove: N } => {
      const we = w.max(p.mul(1.5)), pale = w.div(we)
      const ink = float(1).sub(smoothstep(we.mul(0.5).sub(p.mul(0.5)), we.mul(0.5).add(p.mul(0.5)), d)).mul(pale)
      const groove = float(1).sub(smoothstep(float(0), we.add(p), d)).mul(pale)
      return { ink, groove }
    }
    // the valley along each fissure, as the hero tier cuts it into the stem (`build.ts`, `valleyOf`): here its slope
    // shades it at every tier
    const valleyOf = (f: typeof F0): N => float(-VALLEY.depth).mul(deep).mul(f.open.mul(0.55).add(0.45)).mul(cos(f.net.div(VALLEY.w).min(1).mul(Math.PI)).mul(0.5).add(0.5))
    const barkOf = (f: typeof F0): { h: N; fissure: N; shoulder: N; check: N; skin: N; lent: N; line: N } => {
      // each fissure opens and closes along its length, 1.2 to 4.7 mm wide on a mean pole
      const d = f.net, w = f.open.mul(0.0035).add(0.0012).mul(wide)
      const fis = band(d, w, NET.px), sh = band(d, w.mul(1.8), NET.px)
      const fissure = fis.ink, shoulder = sh.ink
      // the plates' own fine lines along the stem, a few millimetres apart, and short checks across them
      const ln = band(f.line.abs().div(LINE.slope), float(0.0007), LINE.px), plate = float(1).sub(fis.groove)
      const ck = band(f.check.abs().div(CHECK.slope), float(0.0009), CHECK.px)
      const line = ln.ink.mul(plate), check = ck.ink.mul(f.patch).mul(plate)
      const edge = LENT.px.mul(LENT.slope).max(0.08)
      const lent = smoothstep(float(0.7).sub(edge), float(0.7).add(edge), f.lent).mul(plate).mul(shows(0.008))
      const skin = f.skin
      const h = fis.groove.mul(deep.mul(-0.003)).sub(sh.groove.mul(deep.mul(0.0012))).sub(ln.groove.mul(plate).mul(0.0003)).sub(ck.groove.mul(f.patch).mul(plate).mul(0.0003))
        .add(skin.mul(0.00025)).add(lent.mul(0.0003)).add(valleyOf(f))
      return { h, fissure, shoulder, check, skin, lent, line }
    }
    const b = barkOf(F0)
    const barkSlope = slopeFrom(b.h, barkOf(FX).h, barkOf(FT).h)
    const slopeOf = (at: (Q: N) => N): N => slopeFrom(at(C), at(C.add(vec3(EPS, 0, 0))), at(C.add(around.mul(EPS))))
    const plate = mx_noise_float(vec3(C.x.mul(1.3).add(o), C.y.mul(7), C.z.mul(7)).add(4.2)).mul(0.5).add(0.5)
    const mottle = mx_noise_float(vec3(C.x.mul(1.6).add(o), C.y.mul(8), C.z.mul(8))).mul(0.5).add(0.5)
    const lichen = smoothstep(0.6, 0.8, mx_noise_float(vec3(C.x.mul(1.2).add(o), C.y.mul(14), C.z.mul(14)).add(2.7)).mul(0.5).add(0.5))
    const plateTop = mx(mx(lin('#544c43'), lin('#777066'), plate), lin('#5f5042'), mottle.mul(0.35))
    // the valleys hold less of the sky
    const hollow = valleyOf(F0).div(-VALLEY.depth * 1.2).clamp(0, 1)
    const barkCol = mx(mx(plateTop, lin('#7f7d6d'), lichen.mul(0.32)), lin('#2b231c'), b.fissure.mul(deep.mul(0.72).min(0.86))).mul(float(1).sub(hollow.mul(0.3)))
      .mul(float(1).sub(b.shoulder.mul(0.06))).mul(float(1).sub(b.line.mul(0.12))).mul(float(1).sub(b.check.mul(0.1))).mul(b.skin.mul(0.14).add(1)).mul(float(1).add(b.lent.mul(0.22)))
    // PEELED: pale wood under the drawknife, its strokes as facets along the stem, each of its own width and depth and
    // wandering round as the knife did; bark left in the hollows. A whole number of facets round, so the angle's own
    // turn leaves no seam.
    const fibres = luma(d.albedo)
    const FACETS = 9
    const facetAt = (Q: N): N => {
      const phase = atan(Q.z, Q.y).mul(FACETS / (Math.PI * 2))
        .add(mx_noise_float(vec3(Q.x.mul(2.4).add(o), Q.y.mul(4), Q.z.mul(4))).mul(0.7)).add(mx_noise_float(vec3(Q.x.mul(6.5), Q.y.mul(9), Q.z.mul(9)).add(2.2)).mul(0.25))
      // flat in the middle, a rounded ridge where two strokes meet
      const ridge = cos(phase.mul(Math.PI * 2)).mul(0.5).add(0.5).pow(3)
      const depth = mx_noise_float(vec3(Q.x.mul(1.7), Q.y.mul(5), Q.z.mul(5)).add(o).add(8.8)).mul(0.4).add(0.6)
      return ridge.mul(0.004).mul(depth).mul(shows(0.05))
    }
    const remnant = smoothstep(0.7, 0.86, mx_noise_float(vec3(C.x.mul(9).add(o), C.y.mul(15), C.z.mul(15)).add(5.1)).mul(0.5).add(0.5)).mul(0.4)
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
    const endCol = mx(lin('#74604d'), lin('#8c7a64'), heart).mul(float(1).sub(check.mul(0.55))).mul(float(1).sub(rings.mul(ringFade).mul(0.18))).mul(cutStroke.mul(0.12).add(0.9))
      .mul(float(1).sub(smoothstep(0.066, 0.072, rr).mul(0.6))).mul(smoothstep(0, 0.004, rr).mul(0.25).add(0.75))
    // the cut face in relief, in the shading: the latewood a hair proud of the earlywood, the checks open, each stroke's
    // scoop across the face it cut (its way down the face from the face's own tilt), the torn hinge between the faces rough
    const tilt = vec2(normalGeometry.y, normalGeometry.z), tl = tilt.length(), faced = smoothstep(0.05, 0.2, tl)
    const down = vec2(C.y, C.z).dot(tilt.div(tl.max(1e-4)))
    const scoop = down.div(0.016).add(mx_noise_float(vec3(C.y.mul(45), C.z.mul(45), o)).mul(0.3)).fract().mul(2).sub(1)
    const hEnd = float(1).sub(scoop.abs().pow(1.4)).mul(-0.0013).mul(faced).add(rings.mul(ringFade).mul(0.0003)).sub(check.mul(0.0012))
    // where another part bears on it and under its lashings, from the moment that part arrives
    const S: N = attribute('aShade', 'vec2')
    const contact = float(1).sub(S.x.mul(1.25).clamp(0, 0.82).mul(smoothstep(S.y, S.y.add(0.35), lashClock)))
    // the photograph's occlusion runs along its grain: the side of peeled wood only, never the cut face
    pole.colorNode = airBehind(mx(sideCol, endCol, end).mul(mx(float(1), d.occlusion, peeled.mul(float(1).sub(end)))).mul(contact).mul(keyRim(0.45).add(1)))
    pole.roughnessNode = mx(mx(float(0.84).add(b.fissure.mul(0.1)).add(b.skin.mul(0.04)), d.roughness.clamp(0.6, 0.8), peeled), float(0.82), end)
    // relief gone where the stem turns away from the eye: a bump at its edge reads as a dotted line
    const facing = smoothstep(0.08, 0.4, normalViewGeometry.dot(positionView.normalize().negate()))
    const slope = mx(barkSlope, slopeOf(facetAt), peeled).mul(float(1).sub(end)).mul(facing)
    // the photograph's grain belongs to the wood, never to the bark
    const grainN: N = pole.normalNode ?? normalViewGeometry
    pole.normalNode = mx(bumpedBy(mx(normalViewGeometry, grainN, peeled), slope.dot(dCx), slope.dot(dCy)), bumped(normalViewGeometry, hEnd, 1), end)
  }

  // ---------------------------------------------------------------- HEMP
  const hemp = new MeshStandardNodeMaterial({ metalness: 0, roughness: 0.8 })
  hemp.name = `bridge-of-poles:hemp:${set['rope'].name}`
  {
    const s = set['rope']
    const d = stack.detail(hemp, s, { uv: uv(), count: 3, maps: maps(s), fade: [6, 35] })
    const spine: N = attribute('aSpine', 'vec3'), ropeAt: N = attribute('aRope', 'vec3'), born: N = ropeAt.x, served: N = ropeAt.y
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
    const T: N = attribute('aTone', 'vec4')
    const laid = lin('#8c7d60').mul(luma(d.albedo).mul(0.55).add(0.55)).mul(layShade)
    const tarred = lin('#7a6a4f').mul(luma(d.albedo).mul(0.45).add(0.62)).mul(serveShade)
    // the rope's side that lies on a pole is in the pole's shade
    const onPole = float(1).sub(ropeAt.z)
    hemp.colorNode = mx(laid, tarred, served).mul(T.x).mul(d.occlusion).mul(onPole).mul(keyRim(0.5).add(1))
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
    // the bank darkens where the seat logs lie on it and round the stakes
    const seatGap = (x: number, y: number): N => vec2(p.x.sub(x), p.y.sub(y)).length().sub(SEAT_R)
    const onSeat = smoothstep(0.0, 0.16, seatGap(SEAT_XY[0][0], SEAT_XY[0][1]).min(seatGap(SEAT_XY[1][0], SEAT_XY[1][1]))).mul(0.5).add(0.5)
    const seatShade = mx(onSeat, float(1), smoothstep(SEAT_HALF - 0.05, SEAT_HALF + 0.12, p.z.abs()))
    earth.colorNode = airBehind(mx(mx(earthCol, grassCol, grassy), sectionCol, cut).mul(mx(float(1), ground.occlusion, 0.55)).mul(seatShade))
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
    // the bench's lamp is for the poles: on the stream it would stand as a hot spot
    water.userData['benchLamp'] = false
  }
  // the level face: the same water, and the bridge and its banks mirrored in it at grazing angles
  // the sky's own sheen is cut low: the planar pass carries the mirror and its Fresnel, never both
  const waterTop = new MeshPhysicalNodeMaterial({ metalness: 0, roughness: 0.07, specularIntensity: 0.15 })
  waterTop.name = 'bridge-of-poles:water-top:plain'
  waterTop.colorNode = water.colorNode
  waterTop.normalNode = water.normalNode
  waterTop.roughnessNode = water.roughnessNode
  waterTop.userData['benchLamp'] = false
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
