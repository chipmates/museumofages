/* THE SKY A POINT CAN SEE (`?sky=set`, the film's stills only): a fixed set of sky directions, each an orthographic
   depth map of the region the camera stands in, drawn by the engine at the first still and kept while the camera stays
   inside the region; one light node reads them per pixel and takes away the open sky's light a point cannot see, in the
   sky's own colours at the hour, plus a give-back for the light the hidden share would bounce back. The environment
   stays whole (its specular, its ground bounce); only its open-sky diffuse is corrected, so a face that sees the whole
   sky keeps exactly the environment's light. The live draw never calls `prepare`, so nothing here runs on a phone. */

import {
  AnalyticLightNode, DepthFormat, DepthTexture, LessEqualCompare, Light, LinearFilter, NodeMaterial, NoBlending, OrthographicCamera, RenderTarget, UnsignedShortType, Vector3, Vector4,
  type Object3D, type PerspectiveCamera, type Scene, type WebGPURenderer,
} from 'three/webgpu'
import * as TSL from 'three/tsl'
import type { AirUniforms } from './air'
import { skyRadiance } from '../map/sky-sample'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { Loop, cameraPosition, clamp, diffuseContribution, dot, float, int, luminance, max, mix, normalWorld, positionWorld, pow, reflect, roughness, step, texture, uniform, uniformArray, vec2, vec3, vec4 } = TSL as unknown as Record<string, N>

type RGB = [number, number, number]
const GOLD = Math.PI * (3 - Math.sqrt(5))
const ss = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** the fixed directions: a Fibonacci set over the upper hemisphere, even in solid angle, the same every load (the
    sampled sky's own order, so its k-th sub-frame and the k-th map look the same way) */
export function skyDirections(n: number): Array<[number, number, number]> {
  const out: Array<[number, number, number]> = []
  for (let k = 0; k < n; k++) {
    const cz = 1 - (k + 0.5) / n
    const sz = Math.sqrt(Math.max(0, 1 - cz * cz))
    out.push([sz * Math.cos(k * GOLD), cz, sz * Math.sin(k * GOLD)])
  }
  return out
}

/** each direction's solid angle: the hemisphere's 2 pi shared evenly */
export const solidAngle = (n: number): number => (2 * Math.PI) / n

/** the multi-bounce fit for ambient occlusion (Jimenez et al. 2016): the visibility a surface of this albedo shows
    once the light the hidden share bounces back is counted */
export function multiBounce(v: number, albedo: number): number {
  const a = 2.0404 * albedo - 0.3324, b = -4.7951 * albedo + 0.6417, c = 2.7552 * albedo + 0.6903
  return Math.max(v, ((v * a + b) * v + c) * v)
}

export interface SkySetOptions {
  renderer: WebGPURenderer
  scene: Scene
  air: AirUniforms
  /** the walk's environment strength now (light.ts sets it by the camera's height) */
  envIntensity: () => number
  /** the shade lobe by bearing to the sun (gate-plan `light.shade`): the environment's sky carries it, so the field does */
  lobe: { toward: N; away: N }
  /** the warm light the court's walls bounce: the paving's colour, its hue only */
  buff: RGB
  /** the give-back's hue between the paving's (0) and the open sky's at the point (1) */
  giveHue?: number
  /** objects a still holds that must not take sky from the city (the figures: their contact stays the stack's) */
  hidden?: () => Object3D[]
  count?: number
  size?: number
  giveBack?: number
  albedo?: number
  /** the mirror's share of the correction (0 leaves the environment's specular whole) and its sharpest lobe */
  specular?: number
  specularPower?: number
  /** where the diffuse correction enters three's split: 0 the indirect diffuse as the environment's own (times the
      material's occlusion and three's 1 - E at the view), 1 the same divided by 1 - E, 2 the direct diffuse (as a
      light's: past the occlusion and the 1 - E) */
  fit?: number
  /** the film's refits cross-fade over 8 frames (false: drawn at once, as a still's) */
  fade?: boolean
  /** the receiver's offset along its normal and the depth bias, in texels of each map */
  normalBias?: number
  depthBias?: number
}

export type SkySet = ReturnType<typeof skySet>

/** 1 while a field lights the still, else 0: a material's hand sky terms step aside by it (mix(term, 1, uSkySet)),
    so the sky a point cannot see is taken away once */
export const uSkySet: N = uniform(0)

/* the light whose node adds the correction; it carries the field's nodes, so one class serves every page */
class SkySetLight extends Light {
  readonly isSkySetLight = true
  field: { light: (builder: N) => void } | null = null
}
class SkySetLightNode extends (AnalyticLightNode as unknown as new (light: N) => N) {
  static get type(): string { return 'SkySetLightNode' }
  setup(builder: N): void {
    ;(this as N).light.field?.light(builder)
  }
}
;(SkySetLight as unknown as { registerNode: (c: unknown) => void }).registerNode(SkySetLightNode)

export function skySet(o: SkySetOptions) {
  const { renderer, scene, air } = o
  const COUNT = o.count ?? 128
  const SIZE = o.size ?? 1024
  // sub-frame s reads the directions k with k mod STRIDE = s mod STRIDE, each weighted STRIDE times
  const STRIDE = COUNT % 4 === 0 ? 4 : 1
  // how far upstream an occluder is still held (m), and the region's heights
  const UPSTREAM = 3000
  const NB = o.normalBias ?? 0.25, ZB = o.depthBias ?? 0.25
  const DIRS = skyDirections(COUNT).map((d) => new Vector3(...d))

  const depth = new DepthTexture(SIZE, SIZE, UnsignedShortType, undefined, undefined, undefined, LinearFilter, LinearFilter, undefined, DepthFormat, COUNT)
  depth.compareFunction = LessEqualCompare
  depth.name = 'SkySetDepth'
  const target = new RenderTarget(SIZE, SIZE, { count: 0, depth: COUNT, depthTexture: depth, depthBuffer: true, useArrayDepthTexture: true } as N)

  /* per direction five vec4: the map's x and y rows (uv), its depth row, the direction with its normal offset, the
     weight (the sky's radiance there times its solid angle, the environment's strength, the horizon share and the lobe) */
  const table = Array.from({ length: COUNT * 5 }, () => new Vector4())
  const uTable = uniformArray(table, 'vec4')
  const uPhase = uniform(0, 'int'), uStride = uniform(STRIDE, 'int'), uCount = uniform(COUNT / STRIDE, 'int')
  const uOn = uniform(0), uGive = uniform(o.giveBack ?? 1), uSpec = uniform(o.specular ?? 1), uSpecPow = uniform(o.specularPower ?? 8)
  const ALBEDO = o.albedo ?? 0.45
  const FIT = o.fit ?? 0
  const buffL = 0.2126 * o.buff[0] + 0.7152 * o.buff[1] + 0.0722 * o.buff[2]
  const uBuff = uniform(new Vector3(o.buff[0] / buffL, o.buff[1] / buffL, o.buff[2] / buffL))
  const uHue = uniform(o.giveHue ?? 0)

  /* the correction for one material: the diffuse the hidden sky took (irradiance), and the same for the environment's
     mirror of the sky (radiance): a lobe round the reflected ray, its width by the surface's roughness and held to the
     directions' spacing, reads the same maps, so a grazing look at the court's floor toward a wall no longer mirrors
     the open sky the wall hides */
  function lightFor(builder: N): void {
    // a material that lights its own rooms names where the field applies (1 open, 0 its rooms); none: everywhere
    const open: N = builder.material?.skyOpenNode ?? float(1)
    // a material that knows its surroundings' bounce (white walls in sun) names the share of the hidden sky's light
    // they give back, in place of the multi-bounce fit where it gives more, and the share of the mirrored hidden sky
    const own: N = builder.material?.skyBounceNode ?? null
    const mirror: N = builder.material?.skyMirrorNode ?? float(0)
    const n = normalWorld
    const all = vec3(0).toVar('skyAll'), seen = vec3(0).toVar('skySeen'), hid = vec3(0).toVar('skyHid'), lobeSum = float(0).toVar('skyLobe')
    // the environment's own lookup (EnvironmentNode): the reflected ray bent toward the normal by roughness to the fourth
    const a2 = roughness.mul(roughness).mul(roughness).mul(roughness).max(1e-3)
    const rv = mix(reflect(positionWorld.sub(cameraPosition).normalize(), n), n, a2).normalize().toVar('skyR')
    const pw = clamp(float(2).div(a2).sub(2), 1, uSpecPow).toVar('skyPow')
    Loop({ start: int(0), end: uCount, type: 'int', condition: '<' }, ({ i }: { i: N }) => {
      const k = i.mul(uStride).add(uPhase)
      const b = k.mul(5)
      const r0 = uTable.element(b), r1 = uTable.element(b.add(1)), r2 = uTable.element(b.add(2)), dn = uTable.element(b.add(3)), w = uTable.element(b.add(4))
      // the receiver moved out along its normal by a share of the map's texel, so a face does not shade itself
      const p = positionWorld.add(n.mul(dn.w))
      const uv = vec2(dot(r0.xyz, p).add(r0.w), dot(r1.xyz, p).add(r1.w))
      const z = dot(r2.xyz, p).add(r2.w)
      const hit = texture(depth, uv).depth(k).compare(z)
      // outside the map's box nothing is known: the open sky
      const inside = step(0, uv.x).mul(step(uv.x, 1)).mul(step(0, uv.y)).mul(step(uv.y, 1)).mul(step(z, 1))
      const vis = mix(float(1), hit, inside)
      const wc = w.xyz.mul(max(dot(n, dn.xyz), 0))
      all.addAssign(wc)
      seen.addAssign(wc.mul(vis))
      const lob = pow(max(dot(rv, dn.xyz), 0), pw)
      lobeSum.addAssign(lob)
      hid.addAssign(w.xyz.mul(lob).mul(float(1).sub(vis)))
    })
    const lumAll = luminance(all)
    const v = luminance(seen).div(max(lumAll, 1e-6))
    const a = 2.0404 * ALBEDO - 0.3324, bb = -4.7951 * ALBEDO + 0.6417, c = 2.7552 * ALBEDO + 0.6903
    const v2 = max(v, v.mul(a).add(bb).mul(v).add(c).mul(v)).min(1)
    const multi = mix(vec3(uBuff), all.div(max(lumAll, 1e-6)), uHue).mul(v2.sub(v).mul(lumAll)).mul(uGive)
    const back = own ? max(multi, all.sub(seen).mul(own)) : multi
    const gate = uOn.mul(open)
    const corr = seen.sub(all).add(back).mul(float(uStride)).mul(gate)
    const lm = builder.context.lightingModel
    if (FIT === 2 && builder.context.reflectedLight) builder.context.reflectedLight.directDiffuse.addAssign(corr.mul(diffuseContribution).mul(1 / Math.PI))
    else if (FIT === 1 && lm?.singleScatteringDielectric) builder.context.irradiance.addAssign(corr.div(max(vec3(1).sub(lm.singleScatteringDielectric.add(lm.multiScatteringDielectric)), 0.05)))
    else builder.context.irradiance.addAssign(corr)
    // the lobe's mean of the hidden sky's radiance (each weight is a radiance times its solid angle)
    builder.context.radiance.addAssign(hid.div(max(lobeSum, 1e-6).mul(solidAngle(COUNT))).mul(uSpec).mul(gate).mul(float(1).sub(mirror)).negate())
  }

  const light = new SkySetLight(0xffffff, 1)
  light.field = { light: lightFor }
  light.name = 'sky-set'

  const depthMat = new NodeMaterial()
  depthMat.colorNode = vec4(0, 0, 0, 1)
  ;(depthMat as N).isShadowPassMaterial = true
  depthMat.blending = NoBlending
  depthMat.fog = false
  depthMat.name = 'SkySetDepthMaterial'
  const onlyCasters = (object: N, sc: N, cam: N, geometry: N, material: N, group: N, lightsNode: N, clipping: N, passId: N): void => {
    if (object.castShadow === true) renderer.renderObject(object, sc, cam, geometry, material, group, lightsNode, clipping, passId)
  }

  const lightCam = new OrthographicCamera()
  /* the region the maps cover (world x and z, padded, with the pad and the box's top) and the counts for the sidecar */
  type Region = { x0: number; x1: number; z0: number; z1: number; px: number; pz: number; top: number }
  let region: Region | null = null
  let fits = 0, fitMs = 0, lastFitMs = 0, added = false, on = true
  let hidden = o.hidden ?? ((): Object3D[] => [])
  const texels: number[] = new Array(COUNT).fill(0)
  /* the film: a refit draws the new region's maps an eighth of the directions a frame (k mod 8), the others keep the
     old region's, so the shade moves over 8 frames instead of in one */
  const GROUPS = 8
  const ALL = Array.from({ length: COUNT }, (_, k) => k)
  let film = false, force = false, pending: Region | null = null, group = 0, crossFades = 0
  const lastAt = new Vector3(Infinity, 0, 0)

  /** the ground the frame sees, out to fitShadow's reach (light.ts), as points at three heights */
  function seenPoints(cam: PerspectiveCamera): Vector3[] {
    const h = Math.max(2, cam.position.y - 5)
    const reach = Math.min(4200, 260 + h * 9)
    cam.updateMatrixWorld(true)
    const inv = cam.projectionMatrixInverse, world = cam.matrixWorld, origin = cam.position.clone()
    const pts: Vector3[] = []
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]]) {
      const r = new Vector3(x!, y!, 0.5).applyMatrix4(inv).applyMatrix4(world).sub(origin).normalize()
      let t = r.y < -1e-3 ? (5 - origin.y) / r.y : reach
      const flat = Math.hypot(r.x, r.z) * t
      if (flat > reach) t *= reach / flat
      pts.push(origin.clone().addScaledVector(r, t))
    }
    pts.push(origin.clone())
    return pts
  }

  /** every point the frame sees (the camera's own place among them) inside the region, less a share of its pad: the
      camera stands at the region's near edge by construction, so a test on its inner part would refit at every framing */
  function covered(cam: PerspectiveCamera, inset = 0): boolean {
    if (!region) return false
    const { x0, x1, z0, z1 } = region, ix = region.px * inset, iz = region.pz * inset
    return seenPoints(cam).every((q) => q.x >= x0 + ix && q.x <= x1 - ix && q.z >= z0 + iz && q.z <= z1 - iz)
  }

  /** the region for this frame: its seen points, padded so the other framing and a small move keep the same maps */
  function regionFor(cam: PerspectiveCamera): Region {
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity
    for (const p of seenPoints(cam)) { x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z) }
    const px = Math.max(30, (x1 - x0) * 0.15), pz = Math.max(30, (z1 - z0) * 0.15)
    return { x0: x0 - px, x1: x1 + px, z0: z0 - pz, z1: z1 + pz, px, pz, top: Math.max(100, cam.position.y + 5) }
  }

  function fit(cam: PerspectiveCamera): void {
    region = regionFor(cam)
    draw(region, ALL)
    fits++
  }

  /** the maps of the directions ks for a region, and their rows in the table */
  function draw(r: Region, ks: number[]): void {
    const t0 = performance.now()
    const top = r.top
    const corners: Vector3[] = []
    for (const x of [r.x0, r.x1]) for (const z of [r.z0, r.z1]) for (const y of [0, top]) corners.push(new Vector3(x, y, z))
    const centre = new Vector3((r.x0 + r.x1) / 2, top / 2, (r.z0 + r.z1) / 2)

    const hide = hidden().filter((x) => x.visible)
    for (const x of hide) x.visible = false
    const was = { target: renderer.getRenderTarget(), override: scene.overrideMaterial, fn: (renderer as N).getRenderObjectFunction(), auto: renderer.autoClear }
    scene.overrideMaterial = depthMat
    ;(renderer as N).setRenderObjectFunction(onlyCasters)
    renderer.autoClear = true
    lightCam.coordinateSystem = (renderer as N).coordinateSystem
    for (const k of ks) {
      const d = DIRS[k]!
      lightCam.position.copy(centre).addScaledVector(d, 6000)
      lightCam.lookAt(centre)
      lightCam.updateMatrixWorld(true)
      const view = lightCam.matrixWorldInverse
      let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity, zn = Infinity, zf = -Infinity
      for (const c of corners) {
        const v = c.clone().applyMatrix4(view)
        a0 = Math.min(a0, v.x); a1 = Math.max(a1, v.x); b0 = Math.min(b0, v.y); b1 = Math.max(b1, v.y)
        zn = Math.min(zn, -v.z); zf = Math.max(zf, -v.z)
      }
      lightCam.left = a0; lightCam.right = a1; lightCam.bottom = b0; lightCam.top = b1
      lightCam.near = Math.max(1, zn - UPSTREAM); lightCam.far = zf + 5
      lightCam.updateProjectionMatrix()
      const texel = Math.max(a1 - a0, b1 - b0) / SIZE
      texels[k] = texel
      renderer.setRenderTarget(target, k)
      renderer.render(scene, lightCam)
      // world to the map: x and y to uv (y down in the texture), z to the stored depth less a bias of a texel or so
      const m = lightCam.projectionMatrix.clone().multiply(view).elements
      const row = (r: number): [number, number, number, number] => [m[r]!, m[4 + r]!, m[8 + r]!, m[12 + r]!]
      const [x, y, z] = [row(0), row(1), row(2)]
      const bias = Math.max(0.02, texel * ZB) / (lightCam.far - lightCam.near)
      table[k * 5]!.set(x[0] * 0.5, x[1] * 0.5, x[2] * 0.5, x[3] * 0.5 + 0.5)
      table[k * 5 + 1]!.set(-y[0] * 0.5, -y[1] * 0.5, -y[2] * 0.5, -y[3] * 0.5 + 0.5)
      table[k * 5 + 2]!.set(z[0], z[1], z[2], z[3] - bias)
      table[k * 5 + 3]!.set(d.x, d.y, d.z, Math.max(0.02, texel * NB))
    }
    renderer.setRenderTarget(was.target)
    ;(renderer as N).setRenderObjectFunction(was.fn)
    scene.overrideMaterial = was.override
    renderer.autoClear = was.auto
    for (const x of hide) x.visible = true
    lastFitMs = Math.round(performance.now() - t0)
    fitMs += lastFitMs
  }

  /** the film's refit in progress drawn to its end at once (a still never takes two regions' maps) */
  function finish(): void {
    if (!pending) return
    draw(pending, ALL.filter((k) => k % GROUPS >= group))
    region = pending
    pending = null
    fits++
  }

  /** the weights from the sky now: its radiance per direction (air.ts on the CPU), the share the environment gives the
      sky at the horizon, the shade lobe, the solid angle and the environment's strength */
  function weigh(): void {
    const sun = (air.uSun.value as Vector3).clone().normalize()
    const sunFlat = new Vector3(sun.x, 0.0001, sun.z).normalize()
    const toward = Number(o.lobe.toward.value), away = Number(o.lobe.away.value)
    const norm = 1 + (toward - away) / Math.PI
    const k0 = solidAngle(COUNT) * o.envIntensity()
    for (let k = 0; k < COUNT; k++) {
      const d = DIRS[k]!
      const L = skyRadiance(air, d)
      const c = new Vector3(d.x, 0.0001, d.z).normalize().dot(sunFlat)
      const lobe = (1 + toward * Math.max(c, 0) - away * Math.max(-c, 0)) / norm
      const s = ss(-0.05, 0.02, d.y) * lobe * k0
      table[k * 5 + 4]!.set(L[0] * s, L[1] * s, L[2] * s, 0)
    }
  }

  return {
    light,
    /** before a still: the maps for the camera's region (drawn once while the camera stays in it) and the weights */
    prepare(cam: PerspectiveCamera): void {
      // under another source's environment (the twilight) the field is off: no maps are drawn for it
      // a cut on the film (the camera further from its last frame than the region's pad) is a still's fit
      const jump = region !== null && cam.position.distanceTo(lastAt) > Math.max(region.px, region.pz)
      lastAt.copy(cam.position)
      if (on && (!film || !region || jump)) {
        if (jump) pending = null
        finish()
        if (!covered(cam)) fit(cam)
      } else if (on) {
        // once the frame's seen ground nears the region's edge (half its pad), the next region rolls in
        if (!pending && (force || !covered(cam, 0.5))) {
          pending = regionFor(cam)
          group = 0
          force = false
        }
        if (pending && !covered(cam)) {
          // the frame left the old maps before the new ones were all drawn: the rest at once, never open sky
          finish()
          if (!covered(cam)) fit(cam)
        } else if (pending) {
          draw(pending, ALL.filter((k) => k % GROUPS === group))
          if (++group === GROUPS) {
            region = pending
            pending = null
            fits++
            crossFades++
          }
        }
      }
      if (!added) {
        scene.add(light)
        added = true
      }
      weigh()
      uOn.value = on ? 1 : 0
      uSkySet.value = uOn.value
      ;(uTable as N).needsUpdate = true
    },
    /** the page's objects kept out of the maps */
    setHidden(f: () => Object3D[]): void {
      hidden = f
    },
    /** sub-frame s: which quarter of the directions it reads */
    each(s: number): void {
      uPhase.value = s % STRIDE
    },
    /** the geometry changed (the tower switch, the garden): the next still draws the maps again */
    invalidate(): void {
      region = null
      pending = null
    },
    /** the film's frames (map.ts clip): a refit cross-fades over 8 frames; off again, a refit in progress is finished */
    setFilm(v: boolean): void {
      if (!v) finish()
      film = v && o.fade !== false
    },
    /** the film's next frame starts a refit wherever the camera stands (the refit clip's check) */
    refit(): void {
      force = true
    },
    /** off while the environment comes from another source (the twilight's) */
    setOn(v: boolean): void {
      on = v
      uOn.value = v ? 1 : 0
      if (added) uSkySet.value = uOn.value
    },
    facts: () => ({
      mode: 'set', directions: COUNT, mapSize: SIZE, perSubFrame: COUNT / STRIDE, giveBack: uGive.value, giveHue: uHue.value, albedo: ALBEDO, fit: FIT, on, normalBias: NB, depthBias: ZB, specular: uSpec.value, specularPower: uSpecPow.value,
      region: region && { x: [+region.x0.toFixed(1), +region.x1.toFixed(1)], z: [+region.z0.toFixed(1), +region.z1.toFixed(1)] },
      texel: fits ? { min: +Math.min(...texels).toFixed(3), max: +Math.max(...texels).toFixed(3) } : null,
      fits, crossFades, film, rolling: pending ? group : null, fitMs, lastFitMs, memoryMiB: +((SIZE * SIZE * COUNT * 2) / 2 ** 20).toFixed(1),
    }),
  }
}
