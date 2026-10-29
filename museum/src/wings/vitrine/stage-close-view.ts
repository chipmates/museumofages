/** THE CLOSE VIEW'S SETTING: one stage for every machine, the island a visitor
 * turns and the bench's fixed eyes alike.
 *
 * A dark seamless sweep: near black at the frame's top and corners, a soft
 * pool of dark warm grey behind the machine, no line, course or horizon. The
 * floor is the sweep's own: matte, brightest round the machine's foot, its far
 * part handed to the field by an air of the field's own colour, so the eye
 * finds no edge where the ground meets the air. A soft warm key high on the
 * eye's left, a weak fill from the eye and an edge light from behind, the
 * whole rig turning with the eye as an object on a studio turntable turns
 * under fixed lamps. A print of its own, so a machine looks the same from
 * whichever room it was opened. The numbers are in `STAGE`.
 */
import {
  Box3, CircleGeometry, Color, DataTexture, DirectionalLight, FloatType, LinearFilter, Mesh, MeshStandardNodeMaterial, PlaneGeometry, RedFormat,
  Vector3, type Camera, type InstancedMesh, type Node, type Object3D, type Scene,
} from 'three/webgpu'
import * as TSL from 'three/tsl'
import type { Grade, KeyLight, Stack } from '../../stack'
import { IDENTITY } from '../../stack/grade'
import { kelvinToColour } from '../../stack/light'
import { wideShadowFilter } from '../vinci/machines/screw-shadow'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { exp, float, fog, interleavedGradientNoise, lights, mix, positionWorld, rangeFogFactor, screenCoordinate, smoothstep, texture,
  uniform, vec2, vec3, viewportSize, viewportUV } = TSL as unknown as Record<string, N>

const DEG = Math.PI / 180

export const STAGE = Object.freeze({
  /** the sweep behind, in linear light before the print: its edge and the pool behind the machine */
  field: {
    edge: [.0040, .0042, .0046] as const,
    pool: [.052, .048, .044] as const,
    /** the pool's radius as a share of the picture's height, how far above the machine's centre it stands (the same
     * share), and how much darker the frame's top runs */
    radius: .8, lift: .1, top: .2,
    /** the pool is wider than it is tall, as a lamp's spill on a sweep spreads along the floor's line */
    wide: 1.6,
    /** a dither of this share of the value, so an 8-bit gradient of a few levels never bands */
    dither: .05,
  },
  /** the floor: matte, a dark warm grey, its own value falling from the machine's foot by radii of the machine */
  floor: { albedo: [.05, .048, .045] as const, roughness: .93, pool: [.4, 2.6] as const, keep: .2,
    /** a bounce off the room toward the floor, as a share of the albedo: a soft key's shadow is grey, never a black slab */
    bounce: .6 },
  /** the shade under the machine where it stands: the cells a hand's width round every point near the floor */
  contact: { cells: 96, reach: .14, strength: .55, height: .1 },
  /** the air begins this many radii past the machine's centre and is the field's own colour this many further */
  air: { near: 1.0, far: 2.8 },
  /** the key: turned from the eye's bearing (negative: the eye's left) and raised, warm, soft */
  key: { turn: -50, height: 52, kelvin: 4500, lux: 280, ambient: .55,
    /** the shadow's soft edge as a share of the machine's span, as a broad source high over it gives */
    soft: .01 },
  /** the fill: the sky's and the floor's share, and a weak lamp from the eye itself */
  fill: { sky: '#6d7682', ground: '#40362c', intensity: .36, environment: .2, front: .12, frontHeight: 14, frontKelvin: 5600 },
  /** the edge light from behind on the far side: weaker than the key, cool, never on the floor */
  rim: { turn: 155, height: 36, kelvin: 7200, share: .5 },
  /** the vertical lens in degrees: a long lens on the desktop, the phone's upright frame narrower still across */
  lens: { desktop: 24, phone: 40 },
  /** the machine's swept outline's share of the picture's limiting side */
  share: .8,
})

/** the print: the museum's neutral curve, no split, a light vignette, a tooth that dithers; its occlusion scaled to the machine */
export function stageGrade(span: number): Grade {
  // the shoulder rolls the linen's top faces off before they clip under the key
  return { ...IDENTITY, name: 'machine-close-view', exposure: 1.0, toe: .012, shoulder: .35, saturation: 1, vignette: .1, grain: .005,
    ao: { intensity: .9, distance: Math.max(.02, span * .03), thickness: 1 } }
}

export interface StageSetting {
  /** the field node: the scene's background and the air's colour */
  field: Node
  floor: Mesh
  key: KeyLight
  /** the eye's bearing (radians, the eye at sin/cos of it round the machine) turns the rig; the machine's centre on the
   * canvas (shares, top-left origin) and the picture's height as a share of the canvas's place the pool */
  follow(o: { yaw: number; centre?: { x: number; y: number }; picture?: number }): void
  /** the air's ramp, in metres from the eye */
  air(near: number, far: number): void
  /** the contact shade from points of the machine's surfaces, in world metres */
  contact(points: readonly Vector3[]): void
  /** a machine that brings its own ground (the bridge's banks): the floor laid over it at `above` metres, clear within
   * `from` metres of the box and whole from `to`, so that ground ends in the setting's with no edge */
  merge(box: Box3, from: number, to: number, above: number): void
  /** a mirror-like surface the edge light must not reach: from behind the machine it stands as a hot spot in a mirror
   * the eye looks down on */
  offRim(material: MeshStandardNodeMaterial): void
  dispose(): void
}

export function createStageSetting(options: {
  stack: Stack
  scene: Scene
  /** the machine's largest extent and the radius of its bounding sphere, metres */
  span: number
  radius: number
  /** where the floor's pool is centred and its height */
  centre: Vector3
  floorY: number
  /** the box the contact cells cover */
  footprint: Box3
  /** shadow cascades, near and far half-widths in metres */
  cascades?: [number, number]
}): StageSetting {
  const { stack, scene, span, radius, centre, floorY } = options
  const S = STAGE

  // ---- the field, in the canvas's own shares (top-left origin), so a pass drawn at another resolution keeps its place
  const poolCentre = uniform(vec2(.5, .45)), poolRadius = uniform(float(S.field.radius))
  const edge = vec3(...S.field.edge), pool = vec3(...S.field.pool)
  const aspect = viewportSize.x.div(viewportSize.y.max(1))
  const offset = viewportUV.sub(poolCentre).mul(vec2(aspect.div(S.field.wide), 1)).div(poolRadius)
  const glow = exp(offset.dot(offset).mul(-1.7))
  const top = mix(float(1 - S.field.top), float(1), smoothstep(0, .55, viewportUV.y))
  const dither = float(1).add(interleavedGradientNoise(screenCoordinate.xy).sub(.5).mul(S.field.dither))
  const field = mix(edge, pool, glow).mul(top).mul(dither)
  scene.background = new Color().setRGB(S.field.edge[0], S.field.edge[1], S.field.edge[2])
  scene.backgroundNode = field

  // ---- the light, in the eye's bearing
  // the probe's own sun disc would stand at a fixed bearing while the rig turns: it carries none
  const key = stack.light({ azimuth: 0, elevation: S.key.height, kelvin: S.key.kelvin, lux: S.key.lux, ambient: S.key.ambient,
    reach: Math.max(24, span * 6), cascades: options.cascades ?? [span * 1.25, span * 3.4],
    sky: { zenith: S.fill.sky, horizon: '#2a2b2d', ground: S.fill.ground, stars: 0, key: { azimuth: 0, elevation: S.key.height, colour: '#ffffff', size: 1, intensity: 0 } } })
  key.fill.color.set(S.fill.sky)
  key.fill.groundColor.set(S.fill.ground)
  key.fill.intensity = S.fill.intensity
  scene.environmentIntensity = S.fill.environment
  // THE KEY'S SOFT EDGE: the five-texel tent's width is set by the near cascade's texel, so the cascade is sized for it
  {
    const map = key.light.shadow.mapSize.x, half = Math.max(span * 1.25, span * S.key.soft * map / 8)
    const cam = key.light.shadow.camera
    cam.left = -half; cam.right = half; cam.top = half; cam.bottom = -half
    cam.updateProjectionMatrix()
    key.light.shadow.normalBias = 2 * half / map
  }
  key.light.shadow.bias = -span * .00001
  // a soft key's edge: the five-texel tent in place of the stock three
  ;(key.light.shadow as unknown as { filterNode: unknown }).filterNode = wideShadowFilter
  // every directional lamp the key put in the scene (its cascades) turns with it
  const cascadesOf: DirectionalLight[] = []
  scene.traverse(node => { if ((node as DirectionalLight).isDirectionalLight) cascadesOf.push(node as DirectionalLight) })
  const lamp = (kelvin: number, intensity: number, name: string): DirectionalLight => {
    const l = new DirectionalLight(kelvinToColour(kelvin).getHex(), intensity)
    l.name = name
    l.castShadow = false
    scene.add(l, l.target)
    return l
  }
  const front = lamp(S.fill.frontKelvin, S.key.lux / 100 * S.fill.front, 'stage/front')
  const rim = lamp(S.rim.kelvin, S.key.lux / 100 * S.rim.share, 'stage/rim')
  const distance = Math.max(24, span * 6) * .8
  const place = (light: DirectionalLight, bearing: number, height: number): void => {
    const cos = Math.cos(height)
    light.position.set(Math.sin(bearing) * cos, Math.sin(height), Math.cos(bearing) * cos).multiplyScalar(distance).add(centre)
    light.target.position.copy(centre)
    light.updateMatrixWorld()
    light.target.updateMatrixWorld()
  }

  // ---- the floor
  const cells = S.contact.cells
  const contactData = new Float32Array(cells * cells).fill(0)
  const contactTexture = new DataTexture(contactData, cells, cells, RedFormat, FloatType)
  contactTexture.magFilter = LinearFilter
  contactTexture.minFilter = LinearFilter
  contactTexture.needsUpdate = true
  const box = options.footprint
  const grow = radius * S.contact.reach * 2
  const x0 = box.min.x - grow, z0 = box.min.z - grow
  const wide = Math.max(box.max.x - box.min.x, box.max.z - box.min.z) + grow * 2
  const floorMaterial = new MeshStandardNodeMaterial({ roughness: S.floor.roughness, metalness: 0 })
  floorMaterial.name = 'stage/floor'
  let albedo: N, shade: N
  {
    const along = positionWorld.xz.sub(vec2(centre.x, centre.z)).length()
    const fall = mix(float(1), float(S.floor.keep), smoothstep(radius * S.floor.pool[0], radius * S.floor.pool[1], along))
    const cell = vec2(positionWorld.x.sub(x0).div(wide), positionWorld.z.sub(z0).div(wide))
    const inside = smoothstep(0, .02, cell.x).mul(smoothstep(1, .98, cell.x)).mul(smoothstep(0, .02, cell.y)).mul(smoothstep(1, .98, cell.y))
    shade = float(1).sub(texture(contactTexture, cell).r.mul(inside).mul(S.contact.strength))
    albedo = vec3(...S.floor.albedo).mul(fall).mul(shade)
    floorMaterial.colorNode = albedo
    floorMaterial.emissiveNode = albedo.mul(S.floor.bounce)
    floorMaterial.aoNode = shade
    // the edge light from behind would lay a second sheen on the floor toward the eye: the floor takes the key and the fills
    floorMaterial.lightsNode = lights([key.light, key.fill, front])
    // THE FLOOR KEEPS OUT OF THE DEPTH THE OCCLUSION READS: a plane seen at a grazing angle toward the horizon reads to
    // the screen's occlusion as a crease and darkens in a band; the shade where the machine stands is painted instead
    floorMaterial.depthWrite = false
  }
  const floor = new Mesh(new CircleGeometry(Math.max(span * 40, 200), 64), floorMaterial)
  floor.rotation.x = -Math.PI / 2
  floor.position.y = floorY
  floor.receiveShadow = true
  floor.renderOrder = -1
  floor.name = 'stage/floor'
  floor.userData['assetClass'] = 'GENERATED'
  scene.add(floor)

  // ---- the air
  const airNear = uniform(float(span * 2)), airFar = uniform(float(span * 6))
  scene.fogNode = fog(field, rangeFogFactor(airNear, airFar))

  function contact(points: readonly Vector3[]): void {
    contactData.fill(0)
    const reach = Math.max(1, Math.round(S.contact.reach * radius / wide * cells))
    const height = Math.max(.02, radius * S.contact.height)
    for (const p of points) {
      const h = p.y - floorY
      if (h > height) continue
      const weight = 1 - Math.max(0, h) / height
      const i = Math.floor((p.x - x0) / wide * cells), j = Math.floor((p.z - z0) / wide * cells)
      if (i < 0 || j < 0 || i >= cells || j >= cells) continue
      contactData[j * cells + i] = Math.max(contactData[j * cells + i]!, weight)
    }
    // two box blurs make a soft tent a hand's width round each contact
    const scratch = new Float32Array(contactData.length)
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
        let sum = 0, n = 0
        for (let k = -reach; k <= reach; k++) { const x = i + k; if (x >= 0 && x < cells) { sum += contactData[j * cells + x]!; n++ } }
        scratch[j * cells + i] = sum / n
      }
      for (let j = 0; j < cells; j++) for (let i = 0; i < cells; i++) {
        let sum = 0, n = 0
        for (let k = -reach; k <= reach; k++) { const y = j + k; if (y >= 0 && y < cells) { sum += scratch[y * cells + i]!; n++ } }
        contactData[j * cells + i] = Math.min(1, sum / n * 2.2)
      }
    }
    contactTexture.needsUpdate = true
  }

  let veil: Mesh | null = null
  function merge(area: Box3, from: number, to: number, above: number): void {
    dropVeil()
    const c = area.getCenter(new Vector3()), half = area.getSize(new Vector3()).multiplyScalar(.5)
    const material = new MeshStandardNodeMaterial({ roughness: S.floor.roughness, metalness: 0 })
    material.name = 'stage/floor-over'
    material.colorNode = albedo
    material.emissiveNode = albedo.mul(S.floor.bounce)
    material.aoNode = shade
    material.lightsNode = floorMaterial.lightsNode
    // how far a point lies outside the box, along the floor
    const outside = positionWorld.xz.sub(vec2(c.x, c.z)).abs().sub(vec2(half.x, half.z)).max(0).length()
    material.opacityNode = smoothstep(from, to, outside)
    material.transparent = true
    material.depthWrite = false
    const reach = Math.max(half.x, half.z) + to + span * 6
    veil = new Mesh(new PlaneGeometry(2 * reach, 2 * reach), material)
    veil.rotation.x = -Math.PI / 2
    veil.position.set(c.x, above, c.z)
    veil.receiveShadow = true
    veil.name = 'stage/floor-over'
    veil.userData['assetClass'] = 'GENERATED'
    scene.add(veil)
  }
  function dropVeil(): void {
    if (!veil) return
    veil.removeFromParent()
    veil.geometry.dispose()
    ;(veil.material as MeshStandardNodeMaterial).dispose()
    veil = null
  }

  function offRim(material: MeshStandardNodeMaterial): void {
    material.lightsNode = floorMaterial.lightsNode
    material.needsUpdate = true
  }

  let lastYaw = NaN
  function follow(o: { yaw: number; centre?: { x: number; y: number }; picture?: number }): void {
    if (o.yaw !== lastYaw) {
      lastYaw = o.yaw
      for (const l of cascadesOf) place(l, o.yaw + S.key.turn * DEG, S.key.height * DEG)
      key.direction.copy(cascadesOf[0]!.position).sub(centre).normalize()
      place(front, o.yaw, S.fill.frontHeight * DEG)
      place(rim, o.yaw + S.rim.turn * DEG, S.rim.height * DEG)
    }
    if (o.picture) poolRadius.value = o.picture * S.field.radius
    if (o.centre) poolCentre.value.set(o.centre.x, o.centre.y - (o.picture ?? 1) * S.field.lift)
  }
  function air(near: number, far: number): void {
    airNear.value = near
    airFar.value = Math.max(near + .01, far)
  }
  function dispose(): void {
    key.dispose()
    for (const l of [front, rim]) { l.removeFromParent(); l.target.removeFromParent(); l.dispose() }
    dropVeil()
    floor.removeFromParent()
    floor.geometry.dispose()
    floorMaterial.dispose()
    contactTexture.dispose()
  }
  return { field, floor, key, follow, air, contact, merge, offRim, dispose }
}

/** the points of a body's surfaces, a few hundred a mesh, in world metres: what the contact shade is painted from */
export function surfacePoints(root: Object3D, perMesh = 600): Vector3[] {
  const points: Vector3[] = [], at = new Vector3()
  root.updateMatrixWorld(true)
  root.traverseVisible(child => {
    const mesh = child as Mesh
    // a machine's own ground is where it stands, not what stands
    if (!mesh.isMesh || child.userData['vitrineOverlay'] || child.userData['vitrineTarget'] || child.userData['stageGround']) return
    if ((mesh as InstancedMesh).isInstancedMesh) {
      const b = new Box3().setFromObject(mesh, true)
      for (const x of [b.min.x, b.max.x]) for (const z of [b.min.z, b.max.z]) points.push(new Vector3(x, b.min.y, z))
      return
    }
    const position = mesh.geometry?.getAttribute('position')
    if (!position) return
    const stride = Math.max(1, Math.ceil(position.count / perMesh))
    for (let k = 0; k < position.count; k += stride) points.push(at.fromBufferAttribute(position, k).applyMatrix4(mesh.matrixWorld).clone())
  })
  return points
}

/** where a world point lands on the canvas, as shares of it from the top left */
export function onCanvas(point: Vector3, camera: Camera): { x: number; y: number } {
  const p = point.clone().project(camera)
  return { x: p.x * .5 + .5, y: .5 - p.y * .5 }
}
