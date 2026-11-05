/* THE YEAR'S FIRST CRESCENT on the map page (the walk's last stop): one disc on the sky dome, drawn after the sky and
   behind every body, at the place, size, phase and tilt JPL Horizons gives for the minute the page's sun stands at
   (sky.ts, sky-570.json). Its light is added to the sky's and dimmed by the page's own air along its ray (open/air.ts
   transmittance); the lit edge is integrated over each pixel, because it is narrower than a pixel on the phone. It
   stays out of the evidence view's classes: the sky and the crescent are not pieces. */

import { AdditiveBlending, BackSide, DoubleSide, Matrix4, Mesh, MeshBasicNodeMaterial, PlaneGeometry, PMREMGenerator, Scene, SphereGeometry, Vector3, type Camera, type Object3D, type WebGPURenderer } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { transmittance, type AirUniforms } from '../open/air'
import { sunAt } from '../map/sun'
import { makeDusk } from './dusk'
import { moonAtSun, moonFrame, type MoonNow, type SkyFile } from './sky'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const { cameraPosition, cos, float, max, mix, normalize, positionLocal, sin, smoothstep, sqrt, step, uniform, vec2, vec3 } = TSL as unknown as Record<string, N>

const D2R = Math.PI / 180
/** the quad's half size in disc radii: room for the pixel footprint round the limb */
const MARGIN = 1.2
/** the ray through the air toward the Moon, metres: far past the haze layer's scale height */
const RAY = 60000

export interface CrescentMount {
  mesh: Mesh
  /** a sky function with the twilight mixed in once the sun is under the horizon (dusk.ts), for the water */
  sky: (base: (d: N) => N) => (d: N) => N
  setHour: (hour: number) => void
  /** the camera's vertical field (degrees) and the frame's height in pixels, for the pixel footprint */
  setPixel: (vfovDeg: number, heightPx: number) => void
  /** the Moon the page draws now, or null when it is not drawn */
  now: () => (MoonNow & { dir: [number, number, number]; limb: [number, number, number]; fade: number }) | null
  /** where the camera puts the disc in a w x h frame: its centre and radius in pixels, the bright limb's screen direction */
  inFrame: (camera: Camera, w: number, h: number) => { ut: number; az: number; elR: number; diam: number; sto: number; fade: number; centre: [number, number]; radius: number; limb: [number, number] } | null
}

export async function mountCrescent(A: AirUniforms, dome: Object3D, renderer: WebGPURenderer, scene: Scene): Promise<CrescentMount> {
  const [sky, plan]: [SkyFile, J] = await Promise.all([
    fetch(new URL('./sky-570.json', import.meta.url)).then((r) => r.json()),
    fetch(new URL('./crescent-plan.json', import.meta.url)).then((r) => r.json()),
  ])
  const uSto = uniform(150 * D2R)
  const uPix = uniform(0.05)
  const uFade = uniform(0)
  const uSinEl = uniform(0.2)
  const uRad = uniform(new Vector3(...(plan.radiance.value as [number, number, number])))
  const uEarth = uniform(Number(plan.earthshine.value))
  const S: number = Math.max(1, Math.round(Number(plan.samples.value)))

  /* the disc in its own frame: x toward the bright limb, y across, 1 the Moon's radius */
  const P = positionLocal.xy
  const sI = sin(uSto), cI = cos(uSto)
  let lit: N = float(0), lighted: N = float(0), inside: N = float(0)
  for (let i = 0; i < S; i++) {
    for (let j = 0; j < S; j++) {
      const q = P.add(vec2((i + 0.5) / S - 0.5, (j + 0.5) / S - 0.5).mul(uPix))
      const r2 = q.dot(q)
      const on = step(r2, float(1))
      const w = sqrt(max(float(1).sub(r2), 0))
      const mu0 = q.x.mul(sI).add(w.mul(cI))
      const day = step(float(0), mu0).mul(on)
      // Lommel-Seeliger: mu0 / (mu0 + mu), falling to the terminator
      lit = lit.add(max(mu0, 0).div(max(mu0.add(w), 1e-4)).mul(day))
      lighted = lighted.add(day)
      inside = inside.add(on)
    }
  }
  const n = float(S * S)
  const face = lit.div(n).add(inside.sub(lighted).div(n).mul(uEarth))
  // the air between the eye and the Moon, the page's own layer: the ray climbs out of it at the Moon's altitude
  const y0 = cameraPosition.y
  const T = mix(vec3(1), transmittance(A, float(RAY), y0, y0.add(uSinEl.mul(RAY))), A.uOn)
  const mat = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, depthTest: true, side: DoubleSide, blending: AdditiveBlending })
  mat.colorNode = vec3(uRad).mul(T).mul(face).mul(uFade)
  mat.fog = false
  const mesh = new Mesh(new PlaneGeometry(2 * MARGIN, 2 * MARGIN), mat)
  mesh.name = 'sky-crescent'
  mesh.frustumCulled = false
  mesh.castShadow = false
  mesh.receiveShadow = false
  mesh.renderOrder = 10
  mesh.visible = false
  dome.add(mesh)
  // the dome's own sky takes the twilight once the sun is under the horizon
  const dusk = makeDusk(A, plan)
  const domeMat = (dome as Mesh).material as MeshBasicNodeMaterial
  domeMat.colorNode = mix(domeMat.colorNode, dusk.colour(normalize(positionLocal)), dusk.uDusk)
  domeMat.needsUpdate = true
  /* and the light the faces take from it: under the horizon the environment is baked from the twilight sky over a
     ground lit by it (the walk's own environment, open/light.ts, holds a sky with the sun up) */
  const envScene = new Scene()
  {
    const m = new MeshBasicNodeMaterial({ side: BackSide, depthWrite: false })
    const d = normalize(positionLocal)
    // the ground under it lit by the whole sky, not by the glow's side: the blue between the zenith and the far horizon
    const ground = dusk.colour(vec3(0, 1, 0)).add(dusk.colour(normalize(vec3(0, 0.3, 1)))).mul(Number(plan.dusk.ground) / 2)
    m.colorNode = mix(ground, dusk.colour(d), smoothstep(-0.05, 0.02, d.y))
    envScene.add(new Mesh(new SphereGeometry(100, 64, 32), m))
  }
  const pmrem = new PMREMGenerator(renderer)
  let envTarget: N = null
  let envHour = -1

  const dist: number = Number(plan.distance.value)
  const [f0, f1] = plan.fade.value as [number, number]
  let pixDeg = 0.02
  let moon: MoonNow | null = null
  let frame: ReturnType<typeof moonFrame> | null = null
  let fade = 0
  const basis = new Matrix4()

  const footprint = (): void => {
    if (moon) uPix.value = pixDeg / (moon.diam / 2)
  }
  const setHour = (hour: number): void => {
    const sunEl = sunAt(hour).elevation
    dusk.setSun(sunEl)
    // the walk's light re-bakes its environment on every new hour: the twilight's replaces it once the sun is down
    if ((dusk.uDusk.value as number) > 0 && Math.abs(hour - envHour) > 1e-4) {
      envHour = hour
      envTarget?.dispose?.()
      envTarget = pmrem.fromScene(envScene, 0.02, 1, 1000)
      scene.environment = envTarget.texture
    } else if ((dusk.uDusk.value as number) === 0) envHour = -1
    moon = moonAtSun(sky, sunEl)
    // never before sunset; in as the sun sinks under the horizon
    fade = moon ? Math.min(1, Math.max(0, (f0 - moon.sunEl) / (f0 - f1))) : 0
    mesh.visible = !!moon && fade > 0 && moon.elR > -1
    if (!moon || !mesh.visible) return
    frame = moonFrame(sky, moon)
    const z = new Vector3(...frame.dir).negate(), x = new Vector3(...frame.limb), y = new Vector3(...frame.side)
    basis.makeBasis(x, y, z)
    mesh.quaternion.setFromRotationMatrix(basis)
    mesh.position.set(frame.dir[0] * dist, frame.dir[1] * dist, frame.dir[2] * dist)
    mesh.scale.setScalar(Math.tan((moon.diam / 2) * D2R) * dist)
    mesh.updateMatrixWorld(true)
    uSto.value = moon.sto * D2R
    uSinEl.value = Math.max(0.02, Math.sin(moon.elR * D2R))
    uFade.value = fade
    footprint()
  }
  const setPixel = (vfovDeg: number, heightPx: number): void => {
    pixDeg = vfovDeg / Math.max(1, heightPx)
    footprint()
  }
  const now = () => (moon && frame && mesh.visible ? { ...moon, dir: frame.dir, limb: frame.limb, fade } : null)
  const px = (camera: Camera, d: Vector3, w: number, h: number): [number, number] => {
    const v = camera.position.clone().addScaledVector(d, 1000).project(camera)
    return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h]
  }
  const inFrame = (camera: Camera, w: number, h: number) => {
    if (!moon || !frame || !mesh.visible) return null
    const d = new Vector3(...frame.dir)
    const r = Math.tan((moon.diam / 2) * D2R)
    const c = px(camera, d, w, h), e = px(camera, d.clone().addScaledVector(new Vector3(...frame.limb), r), w, h)
    const l: [number, number] = [e[0] - c[0], e[1] - c[1]]
    const rad = Math.hypot(...l)
    const r3 = (x: number): number => +x.toFixed(3)
    return { ut: r3(moon.ut), az: r3(moon.az), elR: r3(moon.elR), diam: +moon.diam.toFixed(5), sto: r3(moon.sto), fade: r3(fade), centre: [r3(c[0]), r3(c[1])] as [number, number], radius: r3(rad), limb: [r3(l[0] / rad), r3(l[1] / rad)] as [number, number] }
  }
  return { mesh, sky: dusk.wrap, setHour, setPixel, now, inFrame }
}
