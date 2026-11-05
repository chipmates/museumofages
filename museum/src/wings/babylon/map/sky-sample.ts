/* THE SKY BY SAMPLES, for an offline still (`?sky=sampled`): while a still accumulates, the environment keeps only the
   ground's bounce, and the sky's light arrives as one shadowed directional light per sub-frame. Its directions are a
   Fibonacci set over the upper hemisphere (uniform in solid angle), its strength the sky's radiance there (air.ts,
   evaluated on the CPU) times 2 pi times the environment's strength, so the mean of the sub-frames is the sky's light
   with its true occlusion: a path trace of the sky's direct light, one bounce short. The sun's direction moves over its
   disc in the same sub-frames, so its shadows take their penumbra. Without the parameter nothing here runs. */

import { DirectionalLight, Mesh, MeshBasicNodeMaterial, BackSide, OrthographicCamera, PMREMGenerator, Scene, SphereGeometry, Vector3, type PerspectiveCamera, type WebGPURenderer } from 'three/webgpu'
import * as TSL from 'three/tsl'
import type { AirUniforms } from '../open/air'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { normalize, positionLocal, smoothstep: ssN, vec3 } = TSL as unknown as Record<string, N>

type RGB = [number, number, number]
const ss = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
const mix3 = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
const v3 = (u: N): RGB => { const v = u.value as Vector3; return [v.x, v.y, v.z] }

/** air.ts skyColour on the CPU, without the sun's disc (its solid angle is under a ten-thousandth of the sky's) */
export function skyRadiance(U: AirUniforms, d: Vector3): RGB {
  const sun = (U.uSun.value as Vector3).clone().normalize()
  const day = U.uDay.value as number
  const low = ss(-0.04, 0.35, sun.y)
  const flat = new Vector3(d.x, 0.0001, d.z).normalize(), sunFlat = new Vector3(sun.x, 0.0001, sun.z).normalize()
  const toward = ss(U.uReach.value as number, 1, flat.dot(sunFlat))
  const away = mix3([0.3, 0.3, 0.34], v3(U.uAway), low), near = mix3([0.82, 0.5, 0.3], v3(U.uNear), low)
  const cosS = Math.max(d.clone().normalize().dot(sun), 0)
  const g = Math.pow(cosS, 6) * 0.5 + Math.pow(cosS, 60) * 0.9
  const base = mix3(away, near, toward)
  const air: RGB = [(base[0] + g) * day, (base[1] + 0.7 * g) * day, (base[2] + 0.42 * g) * day]
  const z = mix3([0.05, 0.08, 0.16], v3(U.uZenith), low)
  const above = mix3(air, [z[0] * day, z[1] * day, z[2] * day], Math.pow(Math.min(1, Math.max(0, d.y)), 0.5))
  return mix3(air, above, ss(0, 0.14, d.y))
}

export interface SkySampler {
  /** wraps one still's accumulation: the ground-only environment on, the sky light in the scene; restore after */
  begin(): void
  /** sub-frame s of n: the sky light's direction and strength, the sun's place on its disc */
  each(s: number, n: number): void
  end(): void
  /** the last still's numbers for the sidecar */
  facts(): Record<string, unknown>
}

export function skySampler(o: { renderer: WebGPURenderer; scene: Scene; camera: PerspectiveCamera; air: AirUniforms; sun: DirectionalLight; uBounce: N; groundColour: RGB; restoreEnv: () => void; mapSize?: number }): SkySampler {
  const { scene, camera, air, sun } = o
  const light = new DirectionalLight(0xffffff, 0)
  light.castShadow = true
  const size = o.mapSize ?? 8192
  light.shadow.mapSize.set(size, size)
  light.visible = false
  scene.add(light, light.target)
  /* the ground-only environment: the walk's bounce below the horizon (light.ts), nothing above it */
  const envScene = new Scene()
  {
    const m = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false })
    const d = normalize(positionLocal)
    m.colorNode = vec3(...o.groundColour).mul(o.uBounce).mul(air.uDay).mul(ssN(-0.05, 0.02, d.y).oneMinus())
    envScene.add(new Mesh(new SphereGeometry(100, 64, 32), m))
  }
  const pmrem = new PMREMGenerator(o.renderer)
  let groundEnv: N = null
  let envI = 1
  const sunHome = new Vector3(), sunTarget = new Vector3()
  const lightCam = new OrthographicCamera()
  let lastFacts: Record<string, unknown> = {}

  /** the light's box round what the frame sees, from direction `dir` (light.ts fitShadow's method) */
  function fit(dir: Vector3): void {
    const h = Math.max(2, camera.position.y - 5)
    const reach = Math.min(4200, 260 + h * 9)
    camera.updateMatrixWorld(true)
    const inv = camera.projectionMatrixInverse, world = camera.matrixWorld, origin = camera.position.clone()
    const pts: Vector3[] = []
    for (const [x, y] of [[-1, -1], [1, -1], [1, 1], [-1, 1], [0, -1], [0, 1], [-1, 0], [1, 0], [0, 0]]) {
      const r = new Vector3(x!, y!, 0.5).applyMatrix4(inv).applyMatrix4(world).sub(origin).normalize()
      let t = r.y < -1e-3 ? (5 - origin.y) / r.y : reach
      const flat = Math.hypot(r.x, r.z) * t
      if (flat > reach) t *= reach / flat
      const p = origin.clone().addScaledVector(r, t)
      for (const y0 of [0, 40, 95]) pts.push(new Vector3(p.x, y0, p.z))
    }
    for (const y0 of [0, 40]) pts.push(new Vector3(origin.x, y0, origin.z))
    const c = pts.reduce((a, p) => a.add(p), new Vector3()).multiplyScalar(1 / pts.length)
    lightCam.position.copy(c).addScaledVector(dir, 6000)
    lightCam.lookAt(c)
    lightCam.updateMatrixWorld(true)
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
    for (const p of pts) {
      const v = p.clone().applyMatrix4(lightCam.matrixWorldInverse)
      x0 = Math.min(x0, v.x); x1 = Math.max(x1, v.x); y0 = Math.min(y0, v.y); y1 = Math.max(y1, v.y)
    }
    const mx = (x1 - x0) * 0.03 + 2, my = (y1 - y0) * 0.03 + 2
    light.position.copy(lightCam.position)
    light.target.position.copy(c)
    light.target.updateMatrixWorld()
    light.updateMatrixWorld()
    const sc = light.shadow.camera
    sc.left = x0 - mx; sc.right = x1 + mx; sc.bottom = y0 - my; sc.top = y1 + my
    sc.near = 1000; sc.far = 12000
    sc.updateProjectionMatrix()
    const texel = Math.max(sc.right - sc.left, sc.top - sc.bottom) / size
    light.shadow.normalBias = Math.max(0.03, texel * 0.9)
    light.shadow.bias = -Math.max(0.08, texel * 4) / (sc.far - sc.near)
  }

  const GOLD = Math.PI * (3 - Math.sqrt(5))
  const SUN_R = (0.2665 * Math.PI) / 180
  return {
    begin() {
      groundEnv?.dispose?.()
      groundEnv = pmrem.fromScene(envScene, 0.02, 1, 1000)
      envI = scene.environmentIntensity
      scene.environment = groundEnv.texture
      light.visible = true
      sunHome.copy(sun.position)
      sunTarget.copy(sun.target.position)
    },
    each(s: number, n: number) {
      // the sky: a Fibonacci point on the upper hemisphere, uniform in solid angle (cos of the zenith angle uniform)
      const cz = 1 - (s + 0.5) / n
      const sz = Math.sqrt(Math.max(0, 1 - cz * cz))
      const ph = s * GOLD
      const dir = new Vector3(sz * Math.cos(ph), cz, sz * Math.sin(ph))
      const L = skyRadiance(air, dir)
      // the environment's sky blends in over -0.05 to 0.02 of the horizon (light.ts); the samples take the same share
      const share = ss(-0.05, 0.02, dir.y) * 2 * Math.PI * envI
      light.color.setRGB(L[0], L[1], L[2])
      light.intensity = share
      fit(dir)
      // the sun on its disc: a Fibonacci point inside a circle of the disc's radius round its centre
      const toSun = sunHome.clone().sub(sunTarget).normalize()
      const a = new Vector3(0, 1, 0).cross(toSun).normalize(), b = toSun.clone().cross(a)
      const rr = SUN_R * Math.sqrt((s + 0.5) / n), pa = s * GOLD
      const j = toSun.clone().addScaledVector(a, rr * Math.cos(pa)).addScaledVector(b, rr * Math.sin(pa)).normalize()
      sun.position.copy(sunTarget).addScaledVector(j, sunHome.distanceTo(sunTarget))
      sun.updateMatrixWorld()
      if (s === 0) lastFacts = { skySamples: n, mapSize: size, envIntensity: envI }
    },
    end() {
      light.visible = false
      light.intensity = 0
      sun.position.copy(sunHome)
      sun.updateMatrixWorld()
      o.restoreEnv()
    },
    facts: () => ({ mode: 'sampled', ...lastFacts, method: 'environment: the ground bounce only; the sky: one shadowed directional light per sub-frame, Fibonacci over the hemisphere, radiance x 2 pi; the sun jittered over its disc' }),
  }
}
