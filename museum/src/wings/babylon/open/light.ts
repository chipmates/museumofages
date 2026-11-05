/* THE WALK'S LIGHT, one source for the arrival (open.ts) and the gate (gate.ts):
   the sun from map/sun.ts, the sky and the far air from air.ts, the environment
   (the sky above, the street's warm bounce below, the sunlit east walls near the
   gate), the sun's shadow fitted to what the frame sees, the occlusion's reach
   and the print by the camera's height. The flight's last frame and the walk's
   first frame are one camera on two pages, so their light is this one module,
   never two copies kept in step by hand. Every value is the gate's stated
   `light` (gate-plan.json) or the arrival's own, ours (G for the method). */

import {
  BackSide, Color, DirectionalLight, Mesh, MeshBasicNodeMaterial, OrthographicCamera, PMREMGenerator, Scene, SphereGeometry, Vector3,
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
const { asin, atan, clamp, dot, float, max, mix, normalize, positionLocal, smoothstep, uniform, vec3, vec4 } = TSL as unknown as Record<string, N>
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
  /* `?sky=set`: the sky each point sees takes the place of the open sky in the environment's diffuse (sky-set.ts); made
     here, drawn at a page's first still, off while another source gives the environment */
  const field: SkySet | null = q.get('sky') === 'set'
    ? skySet({
      renderer, scene, air: AIR, envIntensity: () => scene.environmentIntensity, lobe: { toward: uToward, away: uAwayK },
      buff: LIGHT.bounce.paving.colour as [number, number, number], count: Number(q.get('skyN') ?? 128), size: Number(q.get('skyMap') ?? 1024),
      giveBack: Number(q.get('skyGive') ?? 1), normalBias: Number(q.get('skyNb') ?? 0.25), depthBias: Number(q.get('skyZb') ?? 0.25), specular: Number(q.get('skySpec') ?? 1),
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
    lightCam.position.copy(centre).addScaledVector(sun, 6000)
    lightCam.lookAt(centre)
    lightCam.updateMatrixWorld(true)
    const view = lightCam.matrixWorldInverse
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const p of pts) {
      const v = p.clone().applyMatrix4(view)
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y)
    }
    const mx = (x1 - x0) * 0.03 + 2, my = (y1 - y0) * 0.03 + 2
    sunLight.position.copy(lightCam.position)
    sunLight.target.position.copy(centre)
    sunLight.target.updateMatrixWorld()
    sunLight.updateMatrixWorld()
    const sc = sunLight.shadow.camera
    sc.left = x0 - mx
    sc.right = x1 + mx
    sc.bottom = y0 - my
    sc.top = y1 + my
    sc.near = 1000
    sc.far = 12000
    sc.updateProjectionMatrix()
    const texel = Math.max(sc.right - sc.left, sc.top - sc.bottom) / 8192
    sunLight.shadow.normalBias = Math.max(0.03, texel * 0.9)
    // the depth bias is a share of the box's 11 km depth: a fixed -0.0002 let the sun 2.2 m past every caster (sunlit
    // strips at the lion walls' feet in their shade); held to a few texels in metres instead
    sunLight.shadow.bias = -Math.max(0.08, texel * 4) / (sc.far - sc.near)
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
    /** the environment's source for the hours this sky does not hold: a texture for the hour, or null for this sky */
    setEnvSource: (f: ((hour: number) => Texture | null) | null): void => { envSource = f },
    /** which environment the scene holds now, and how many times this sky was baked */
    env: () => ({ by: envBy, bakes: envBakes }),
    /** the sun at an hour, as the facts and sidecars state it */
    sunAt: (hour: number) => sunAt(hour),
    hour: () => hourNow,
  }
}
