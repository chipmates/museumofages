/* THE WALK'S LIGHT, one source for the arrival (open.ts) and the gate (gate.ts):
   the sun from map/sun.ts, the sky and the far air from air.ts, the environment
   (the sky above, the street's warm bounce below, the sunlit east walls near the
   gate), the sun's shadow fitted to what the frame sees, the occlusion's reach
   and the print by the camera's height. The flight's last frame and the walk's
   first frame are one camera on two pages, so their light is this one module,
   never two copies kept in step by hand. Every value is the gate's stated
   `light` (gate-plan.json) or the arrival's own, ours (G for the method). */

import {
  BackSide, Color, DepthTexture, DirectionalLight, GreaterEqualCompare, LessEqualCompare, Matrix4, Mesh, MeshBasicNodeMaterial, Object3D, OrthographicCamera,
  PMREMGenerator, Scene, ShadowBaseNode, ShadowNode, SphereGeometry, Vector3,
  type Matrix3, type PerspectiveCamera, type Texture, type WebGPURenderer,
} from 'three/webgpu'
import * as TSL from 'three/tsl'
import type { Print } from '../../animals/cave/site'
import { sunAt, sunVector } from '../map/sun'
import { makeAirUniforms, skyColour, type AirUniforms } from './air'
import { skySet, type SkySet } from './sky-set'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const { Fn, If, asin, atan, clamp, dot, float, max, min, mix, normalize, positionLocal, shadowPositionWorld, smoothstep, uniform, vec3, vec4 } = TSL as unknown as Record<string, N>
const D2R = Math.PI / 180

export interface WalkLightOptions {
  renderer: WebGPURenderer
  scene: Scene
  /** gate-plan.json `light`: the sun's strength, the bounce, the east walls' band, the environment, the exposure and print */
  light: J
  /** the gate frame to world rotation, and the world to gate frame as a uniform (the east walls' band is set in the gate's frame) */
  rot: Matrix3
  uW2G: N
  /** the gate materials' sun, in the gate's frame (gate-mat makeUniforms) */
  uSunG: N
  /** the gate frame's origin in the world: the band and the bounce belong to the last 400 m before it */
  gateAt: Vector3
  q: URLSearchParams
}

export type WalkLight = ReturnType<typeof walkLight>

/** the street's level band of the print and the environment: from 15 m over the German zero to 135 m the air from above wins */
export const aloft = (y: number): number => Math.min(1, Math.max(0, y - 15) / 120)

/* the sun's shadow maps carry depth only: three's ShadowNode also allocates a colour target the size of the map, read only
   for transmitted shadows, which the walk never turns on */
class DepthShadowNode extends (ShadowNode as unknown as new (light: N, shadow?: N) => N) {
  setupRenderTarget(shadow: N, builder: N): { shadowMap: N; depthTexture: N } {
    const depthTexture = new DepthTexture(shadow.mapSize.width, shadow.mapSize.height)
    depthTexture.name = 'ShadowDepthTexture'
    depthTexture.compareFunction = builder.renderer.reversedDepthBuffer ? GreaterEqualCompare : LessEqualCompare
    const shadowMap = builder.createRenderTarget(shadow.mapSize.width, shadow.mapSize.height, { count: 0 })
    shadowMap.depthTexture = depthTexture
    return { shadowMap, depthTexture }
  }
}

/* the sun's two maps: the far one fitted to all the frame sees, the near one to the frame's first metres; a point takes
   the near map wherever its light ray falls inside the near box (a ray's casters all lie in the box that holds it), the
   far map elsewhere, blended across the near box's border band */
class SunShadowNode extends (ShadowBaseNode as unknown as new (light: N) => N) {
  far: N
  near: N
  nearM: N
  nearOn: N
  nearBand: number
  // fields set by hand, not as parameter properties: the kit's node tests load this file with type stripping only
  constructor(light: N, holder: N, uNearM: N, uNearOn: N, band: number) {
    super(light)
    this.nearM = uNearM
    this.nearOn = uNearOn
    this.nearBand = band
    this.far = new DepthShadowNode(light, light.shadow)
    this.near = new DepthShadowNode(holder, holder.shadow)
  }
  setup(): N {
    return Fn((b: N) => {
      this.setupShadowPosition(b)
      const c = this.nearM.mul(vec4(shadowPositionWorld, 1)).xyz
      const e = min(min(c.x, c.x.oneMinus()), min(c.y, c.y.oneMinus()))
      const w = smoothstep(0, this.nearBand, e).mul(this.nearOn).toVar()
      const ret = float(1).toVar()
      If(w.greaterThan(0.999), () => { ret.assign(this.near) })
        .ElseIf(w.greaterThan(0.001), () => { ret.assign(mix(this.far, this.near, w)) })
        .Else(() => { ret.assign(this.far) })
      return ret
    })()
  }
}

type Box = { x0: number; x1: number; y0: number; y1: number }
/** the box in the sun's frame round these points (the light camera put 6000 m up the sun from their centre), a share
    and a few metres of margin */
export function sunBox(lightCam: OrthographicCamera, pts: Vector3[], centre: Vector3, sun: Vector3, share: number, pad: number): Box {
  lightCam.position.copy(centre).addScaledVector(sun, 6000)
  lightCam.lookAt(centre)
  lightCam.updateMatrixWorld(true)
  const view = lightCam.matrixWorldInverse
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const p of pts) {
    const v = p.clone().applyMatrix4(view)
    x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y)
  }
  const mx = (x1 - x0) * share + pad, my = (y1 - y0) * share + pad
  return { x0: x0 - mx, x1: x1 + mx, y0: y0 - my, y1: y1 + my }
}
/** the near slice's view depth by the camera's height over the plain: the court round an eye at the street, the near
    quarters from the air; never past the far map's reach */
export const nearDepthOf = (h: number, reach: number, d0 = 24, k = 6): number => Math.min(reach, d0 + h * k)
/** the near slice's points: the eye and a 5x5 grid of view rays out to `depth` of view depth */
export function nearSlice(cam: PerspectiveCamera, depth: number): Vector3[] {
  const inv = cam.projectionMatrixInverse, world = cam.matrixWorld, origin = cam.position.clone()
  const tmp = new Vector3()
  const fwd = tmp.set(0, 0, -1).transformDirection(world).clone()
  // nothing stands above 100 m to take a shadow; the ground under an eye can lie under the plain's 5 m (the stair's foot)
  const ground = Math.min(5, origin.y - 2)
  const clampY = (y: number): number => Math.min(100, Math.max(ground, y))
  const pts: Vector3[] = [new Vector3(origin.x, clampY(origin.y), origin.z)]
  for (let i = 0; i <= 4; i++) for (let k = 0; k <= 4; k++) {
    const dir = tmp.set(i / 2 - 1, k / 2 - 1, 0.5).applyMatrix4(inv).applyMatrix4(world).sub(origin).normalize().clone()
    let t = depth / Math.max(1e-3, dir.dot(fwd))
    if (dir.y < -1e-4) t = Math.min(t, (ground - origin.y) / dir.y)
    if (dir.y > 1e-4 && origin.y < 100) t = Math.min(t, (100 - origin.y) / dir.y)
    const p = origin.clone().addScaledVector(dir, Math.max(0, t))
    p.y = clampY(p.y)
    pts.push(p)
  }
  return pts
}

export function walkLight(o: WalkLightOptions) {
  const { renderer, scene, light: LIGHT, q } = o

  /* the air and the sky: one set of uniforms */
  const AIR: AirUniforms = makeAirUniforms({ sigma: Number(q.get('sigma') ?? 0.00018), scale: Number(q.get('scale') ?? 300), floor: 3 })
  AIR.uOn.value = Number(q.get('air') ?? 1)
  const vec = (k: string, d: number[]): [number, number, number] => (q.get(k) ?? d.join(',')).split(',').map(Number) as [number, number, number]
  /* the sky over the street and from the air: from the air the far air's warm side reaches round the whole horizon (the
     evening haze over the plain); in a street the sky is what lights the shade and what the glazes mirror, so its warm side
     keeps to the sun's half and its zenith is a clearer blue. One function on both pages, set by the camera's height. */
  const SKY = {
    // the gate pilot's sky kept its glazes blue in shade (its zenith); the dusty horizon away from the sun a pale grey-blue
    street: { reach: Number(q.get('reachStreet') ?? 0), zenith: vec('zenithStreet', [0.16, 0.3, 0.6]), away: vec('awayStreet', [0.62, 0.62, 0.66]) },
    aloft: { reach: Number(q.get('reach') ?? -1.0), zenith: vec('zenith', [0.11, 0.23, 0.52]), away: vec('away', [0.52, 0.48, 0.45]) },
  }
  let skyNow = -1
  function setSky(a: number): boolean {
    if (Math.abs(a - skyNow) < 0.01) return false
    skyNow = a
    const S = SKY.street, A = SKY.aloft
    AIR.uReach.value = S.reach + (A.reach - S.reach) * a
    ;(AIR.uZenith.value as Vector3).set(...(S.zenith.map((v, i) => v + (A.zenith[i]! - v) * a) as [number, number, number]))
    ;(AIR.uAway.value as Vector3).set(...(S.away.map((v, i) => v + (A.away[i]! - v) * a) as [number, number, number]))
    return true
  }
  setSky(1)
  const sky = (d: N): N => skyColour(AIR, d)
  const dome = (() => {
    const m = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false })
    m.colorNode = sky(normalize(positionLocal))
    m.fog = false
    const mesh = new Mesh(new SphereGeometry(1, 96, 48), m)
    mesh.scale.setScalar(20000)
    mesh.frustumCulled = false
    mesh.name = 'sky'
    return mesh
  })()
  scene.add(dome)

  /* the sun: the gate's stated strength, its colour warming as it sinks; the shadow fitted per frame */
  const SUN = { i: Number(q.get('sun') ?? LIGHT.sun.intensity) }
  const sunLight = new DirectionalLight(new Color(1.0, 0.86, 0.7), SUN.i)
  sunLight.castShadow = true
  sunLight.shadow.mapSize.set(8192, 8192)
  sunLight.shadow.bias = -0.0002
  sunLight.shadow.normalBias = 0.03
  scene.add(sunLight, sunLight.target)
  /* the near map (`?near=0` the far map alone): its own light holder and shadow, fitted in fitShadow below */
  const NEAR = { on: q.get('near') !== '0', size: Number(q.get('nearMap') ?? 8192), band: 0.06, bias: Number(q.get('nearB') ?? 0), normal: Number(q.get('nearN') ?? 0.5), floor: Number(q.get('nearF') ?? 0.001) }
  const holder = new Object3D() as Object3D & { target: Object3D; shadow: N; castShadow: boolean }
  holder.target = new Object3D()
  holder.castShadow = true
  holder.shadow = sunLight.shadow.clone()
  holder.shadow.mapSize.set(NEAR.size, NEAR.size)
  const uNearM = uniform(new Matrix4()), uNearOn = uniform(NEAR.on ? 1 : 0)
  ;(sunLight.shadow as unknown as { shadowNode: N }).shadowNode = new SunShadowNode(sunLight, holder, uNearM, uNearOn, NEAR.band)

  /* the environment: the sky above, the plain's or the street's warm bounce below, near the gate the sunlit east walls' band */
  const uBounce = uniform(Number(q.get('bounce') ?? LIGHT.bounce.paving.value))
  const WALLS = LIGHT.bounce.eastWalls
  const wallsOn = Number(q.get('walls') ?? 1)
  const uWalls = uniform(new Color(0, 0, 0))
  const uWallsNear = uniform(0)
  /* the shade's light (gate-plan `light.shade`; its values keep the walk as it was): a lobe by bearing to the sun on the
     sky as light, so faces turned apart in shade can take different light, and a gain on the ground's bounce */
  const SH = LIGHT.shade ?? {}
  const uToward = uniform(Number(q.get('envToward') ?? SH.toward ?? 0))
  const uAwayK = uniform(Number(q.get('envAway') ?? SH.away ?? 0))
  const uGround = uniform(Number(q.get('ground') ?? SH.ground ?? 1))
  const envScene = new Scene()
  {
    const m = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false })
    const d = normalize(positionLocal)
    const ground = vec3(...(LIGHT.bounce.paving.colour as [number, number, number])).mul(uBounce).mul(AIR.uDay).mul(uGround)
    const c = dot(normalize(vec3(d.x, 0.0001, d.z)), normalize(vec3(AIR.uSun.x, 0.0001, AIR.uSun.z)))
    // divided by its mean round the horizon (max(c, 0) averages 1/pi there), so the lobe moves light, it does not add or take it
    const lobe = float(1).add(uToward.mul(max(c, 0))).sub(uAwayK.mul(max(c.negate(), 0))).div(float(1).add(uToward.sub(uAwayK).div(Math.PI)))
    const dg = o.uW2G.mul(vec4(d, 0)).xyz
    const az = atan(dg.x.negate(), dg.z).mul(180 / Math.PI)
    const el = asin(clamp(dg.y, -1, 1)).mul(180 / Math.PI)
    const [a0, a1] = WALLS.azimuth as [number, number], [e0, e1] = WALLS.elevation as [number, number]
    const band = smoothstep(a0 - 6, a0, az).mul(smoothstep(a1 + 6, a1, az)).mul(smoothstep(e0 - 3, e0, el)).mul(smoothstep(e1 + 3, e1, el)).mul(uWallsNear)
    m.colorNode = mix(ground, sky(d).mul(lobe), smoothstep(-0.05, 0.02, d.y)).mul(band.oneMinus()).add(vec3(uWalls).mul(band))
    envScene.add(new Mesh(new SphereGeometry(100, 64, 32), m))
  }
  const pmrem = new PMREMGenerator(renderer)
  let envTarget: N = null
  /* this module is the page's one writer of the environment: a page may hand it a source for the hours its own sky
     does not hold (the map's twilight); while the source gives a texture for the hour, the faces take that one and
     this sky is not baked, so no later trigger in the frame can put it back */
  let envSource: ((hour: number) => Texture | null) | null = null
  let envBy: 'walk' | 'source' = 'walk'
  let envBakes = 0
  /* `?sky=set` (the default; `?sky=env` keeps the environment alone): the sky each point sees takes the place of the open sky in the environment's diffuse (sky-set.ts); made
     here, drawn at a page's first still, off while another source gives the environment */
  // WebGPU only (a depth-only target over a depth array): elsewhere the page keeps the environment as it is
  const field: SkySet | null = (q.get('sky') ?? 'set') === 'set' && (renderer as unknown as { backend?: { isWebGPUBackend?: boolean } }).backend?.isWebGPUBackend === true
    ? skySet({
      renderer, scene, air: AIR, envIntensity: () => scene.environmentIntensity, lobe: { toward: uToward, away: uAwayK },
      buff: LIGHT.bounce.paving.colour as [number, number, number], count: Number(q.get('skyN') ?? 128), size: Number(q.get('skyMap') ?? 1024),
      giveBack: Number(q.get('skyGive') ?? 1), giveHue: Number(q.get('skyHue') ?? 1), fit: Number(q.get('skyFit') ?? 0), fade: q.get('skyFade') !== '0', normalBias: Number(q.get('skyNb') ?? 0.25), depthBias: Number(q.get('skyZb') ?? 0.25), specular: Number(q.get('skySpec') ?? 1),
    })
    : null
  function bakeEnv(): void {
    const given = envSource?.(hourNow) ?? null
    field?.setOn(!given)
    if (given) {
      scene.environment = given
      envBy = 'source'
      return
    }
    envTarget?.dispose?.()
    envTarget = pmrem.fromScene(envScene, 0.02, 1, 1000)
    scene.environment = envTarget.texture
    envBy = 'walk'
    envBakes++
  }
  /* the environment's strength: the gate's stated value at the street; over the open plain from the air a weaker fill, so the
     shade under the low sun keeps its depth */
  const ENV = { street: Number(q.get('env') ?? LIGHT.env), aloft: Number(q.get('envAloft') ?? 0.42) }
  scene.environmentIntensity = ENV.street

  /* the clock: one sun for every page, map/sun.ts in the world (x east, y up, z south), the gate's materials in its frame */
  const rotT = o.rot.clone().transpose()
  let hourNow = -1
  function setHour(hour: number, force = false): void {
    if (!force && Math.abs(hour - hourNow) < 1e-4) return
    hourNow = hour
    const sW = new Vector3(...sunVector(hour))
    const sGv = sW.clone().applyMatrix3(rotT)
    ;(o.uSunG.value as Vector3).set(sGv.x, sGv.y, sGv.z)
    ;(AIR.uSun.value as Vector3).copy(sW)
    const el = Math.asin(sW.y) / D2R
    const k = Math.min(1, Math.max(0, (el + 0.5) / 6))
    sunLight.intensity = SUN.i * k
    sunLight.color.setRGB(1.0, 0.72 + 0.14 * Math.min(1, el / 20), 0.5 + 0.2 * Math.min(1, el / 20))
    // a west-facing wall's radiance in the sun: albedo times the light on it over pi, in the wall's own buff
    const onWest = Math.max(0, sGv.x) * sunLight.intensity * WALLS.albedo * wallsOn / Math.PI
    ;(uWalls.value as Color).setRGB(sunLight.color.r * WALLS.colour[0] * onWest, sunLight.color.g * WALLS.colour[1] * onWest, sunLight.color.b * WALLS.colour[2] * onWest)
    AIR.uDay.value = Math.min(1, Math.max(0.18, (el + 6) / 14))
    bakeEnv()
  }
  /** the east walls' band and the paving's bounce belong to the forecourt: they fade in over the last 400 m to the gate */
  let wallsNow = -1
  function setNear(distance: number): void {
    const w = Math.min(1, Math.max(0, (400 - distance) / 250))
    if (Math.abs(w - wallsNow) < 0.02) return
    wallsNow = w
    uWallsNear.value = w
    uBounce.value = 0.18 + (Number(q.get('bounce') ?? LIGHT.bounce.paving.value) - 0.18) * w
    bakeEnv()
  }

  /* the shadow: an orthographic box in the sun's frame round the ground the frame sees, out to a reach that grows with height */
  const lightCam = new OrthographicCamera()
  const tmp = new Vector3()
  const boxOf = (pts: Vector3[], centre: Vector3, sun: Vector3, share: number, pad: number): Box => sunBox(lightCam, pts, centre, sun, share, pad)
  /** the near slice's view depth by the camera's height: the court round an eye at the street, the near quarters from the air */
  const nearDepth = (h: number, reach: number): number => nearDepthOf(h, reach, Number(q.get('nearD') ?? 24), Number(q.get('nearK') ?? 6))
  const nearFacts = { depth: 0, w: 0, h: 0, texel: 0 }
  function fitNear(cam: PerspectiveCamera, sun: Vector3, h: number, reach: number): void {
    const depth = nearDepth(h, reach)
    const pts = nearSlice(cam, depth)
    const centre = pts.reduce((a, p) => a.add(p), new Vector3()).multiplyScalar(1 / pts.length)
    const b = boxOf(pts, centre, sun, 0.02, 0.5)
    holder.position.copy(lightCam.position)
    holder.target.position.copy(centre)
    holder.updateMatrixWorld(true)
    holder.target.updateMatrixWorld(true)
    const sh = holder.shadow, sc = sh.camera as OrthographicCamera
    sc.left = b.x0; sc.right = b.x1; sc.bottom = b.y0; sc.top = b.y1
    sc.near = 1000
    sc.far = 12000
    sc.updateProjectionMatrix()
    sh.updateMatrices(holder)
    ;(uNearM.value as Matrix4).copy(sh.matrix)
    const texel = Math.max(b.x1 - b.x0, b.y1 - b.y0) / NEAR.size
    // the normal bias follows the near texel (the lips' shades are a centimetre or two tall); the depth bias is the 1 mm floor
    // alone: the map holds the faces turned from the sun, and any texel share lets the sun onto the ground at such a face's foot
    sh.normalBias = Math.max(0.002, texel * NEAR.normal)
    sh.bias = -Math.max(NEAR.floor, texel * NEAR.bias) / (sc.far - sc.near)
    Object.assign(nearFacts, { depth: +depth.toFixed(1), w: +(b.x1 - b.x0).toFixed(1), h: +(b.y1 - b.y0).toFixed(1), texel: +texel.toFixed(4) })
  }
  function fitShadow(cam: PerspectiveCamera): number {
    const sun = (AIR.uSun.value as Vector3).clone().normalize()
    const h = Math.max(2, cam.position.y - 5)
    const reach = Math.min(4200, 260 + h * 9)
    cam.updateMatrixWorld(true)
    const inv = cam.projectionMatrixInverse, world = cam.matrixWorld
    const pts: Vector3[] = []
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]]
    const origin = cam.position.clone()
    for (const [x, y] of corners) {
      const dir = tmp.set(x!, y!, 0.5).applyMatrix4(inv).applyMatrix4(world).sub(origin).normalize().clone()
      // the ray to the plain (or to the reach, for a ray above the horizon)
      let t = dir.y < -1e-3 ? (5 - origin.y) / dir.y : reach
      const flat = Math.hypot(dir.x, dir.z) * t
      if (flat > reach) t *= reach / flat
      const p = origin.clone().addScaledVector(dir, t)
      for (const y0 of [0, 40, 95]) pts.push(new Vector3(p.x, y0, p.z))
    }
    for (const y0 of [0, 40]) pts.push(new Vector3(origin.x, y0, origin.z))
    const centre = pts.reduce((a, p) => a.add(p), new Vector3()).multiplyScalar(1 / pts.length)
    const { x0, x1, y0, y1 } = boxOf(pts, centre, sun, 0.03, 2)
    sunLight.position.copy(lightCam.position)
    sunLight.target.position.copy(centre)
    sunLight.target.updateMatrixWorld()
    sunLight.updateMatrixWorld()
    const sc = sunLight.shadow.camera
    sc.left = x0
    sc.right = x1
    sc.bottom = y0
    sc.top = y1
    sc.near = 1000
    sc.far = 12000
    sc.updateProjectionMatrix()
    const texel = Math.max(sc.right - sc.left, sc.top - sc.bottom) / 8192
    sunLight.shadow.normalBias = Math.max(0.03, texel * 0.9)
    // the depth bias is a share of the box's 11 km depth: a fixed -0.0002 let the sun 2.2 m past every caster (sunlit
    // strips at the lion walls' feet in their shade); held to a few texels in metres instead
    sunLight.shadow.bias = -Math.max(0.08, texel * 4) / (sc.far - sc.near)
    if (NEAR.on) fitNear(cam, sun, h, reach)
    return texel
  }

  /* the contact occlusion's fade (its reach set by the page's pipeline), by the camera's height */
  const AO = { reach: Number(q.get('aoR') ?? SH.aoRadius ?? 1.2), near: Number(q.get('aoNear') ?? SH.aoNear ?? 250), far: Number(q.get('aoFar') ?? SH.aoFar ?? 900) }
  const uAoNear = uniform(AO.near), uAoFar = uniform(AO.far), uAoOn = uniform(Number(q.get('ao') ?? SH.ao ?? 0.75))
  /** everything that follows the camera: the environment's strength, the occlusion's fade, the band, the shadow; the shadow's texel back */
  function frame(cam: PerspectiveCamera): { texel: number; aoRadius: number } {
    const y = cam.position.y
    const over = Math.max(1.5, y - 5)
    if (setSky(aloft(y))) bakeEnv()
    scene.environmentIntensity = ENV.street + (ENV.aloft - ENV.street) * Math.min(1, Math.max(0, y - 15) / 120)
    uAoNear.value = AO.near + over * 1.2
    uAoFar.value = AO.far + over * 3.5
    setNear(cam.position.distanceTo(o.gateAt))
    return { texel: fitShadow(cam), aoRadius: Math.min(Math.max(6, AO.reach), AO.reach + Math.max(0, y - 15) * 0.012) }
  }

  /* the print: the gate's own at the street; over the city a little lower, less saturated and with a deeper toe */
  const P0 = LIGHT.print
  const three = (k: string, d: number[]): [number, number, number] => (q.get(k) ?? d.join(',')).split(',').map(Number) as [number, number, number]
  const PRINT: Print = {
    exposure: Number(q.get('exp') ?? LIGHT.exposure), toe: Number(q.get('toe') ?? P0.toe), shoulder: 1, lift: [0, 0, 0], gamma: [1, 1, 1], gain: three('gain', P0.gain),
    warm: [1.02, 1, 0.97], cool: [0.97, 1, 1.03], split: 0.3, saturation: Number(q.get('sat') ?? P0.saturation), vignette: Number(P0.vignette ?? 0.12), grain: 0.003,
    glow: { threshold: 1.2, strength: Number(q.get('glow') ?? P0.glow), radii: [0.012, 0.06] },
  }
  const STOPS = { base: Number(q.get('stops') ?? 0), aloft: -0.35 }
  const SAT = { street: PRINT.saturation, aloft: Number(q.get('satAloft') ?? 1.0) }
  const TOE = { street: PRINT.toe, aloft: Number(q.get('toeAloft') ?? 0.035) }
  /** the exposure's stops over the gate's own by the camera's height: the air from above is brighter than the street */
  const stopsAt = (y: number): number => STOPS.base + STOPS.aloft * aloft(y)
  /** the print for a camera at height y with these stops in all */
  function printFor(y: number, stops: number): Print {
    const a = aloft(y)
    return { ...PRINT, exposure: PRINT.exposure * Math.pow(2, stops), saturation: SAT.street + (SAT.aloft - SAT.street) * a, toe: TOE.street + (TOE.aloft - TOE.street) * a }
  }

  return {
    AIR, sky, dome, sunLight, SUN, ENV, PRINT, SAT, TOE, STOPS, uBounce, uWalls, uWallsNear, uAoNear, uAoFar, uAoOn, uToward, uAwayK, uGround, field,
    setHour, setNear, fitShadow, frame, stopsAt, printFor, bakeEnv,
    /** the near map's slice depth, its box in metres and its texel, as last fitted */
    nearShadow: () => ({ on: NEAR.on, size: NEAR.size, ...nearFacts }),
    /** the environment's source for the hours this sky does not hold: a texture for the hour, or null for this sky */
    setEnvSource: (f: ((hour: number) => Texture | null) | null): void => { envSource = f },
    /** an offline still's own environment for its accumulation (the sampled sky's ground-only one); bakeEnv puts the walk's back */
    holdEnv: (t: Texture): void => { scene.environment = t },
    /** which environment the scene holds now, and how many times this sky was baked */
    env: () => ({ by: envBy, bakes: envBakes }),
    /** the sun at an hour, as the facts and sidecars state it */
    sunAt: (hour: number) => sunAt(hour),
    hour: () => hourNow,
  }
}
