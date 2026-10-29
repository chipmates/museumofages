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
  Box3, CanvasTexture, CircleGeometry, Color, DataTexture, DirectionalLight, EquirectangularReflectionMapping, FloatType, LinearFilter, Mesh,
  MeshStandardNodeMaterial, PlaneGeometry, RedFormat, SRGBColorSpace, Vector3, type Camera, type InstancedMesh, type Node, type Object3D, type Scene,
  type Texture,
} from 'three/webgpu'
import * as TSL from 'three/tsl'
import type { Grade, KeyLight, Stack } from '../../stack'
import { IDENTITY } from '../../stack/grade'
import { kelvinToColour } from '../../stack/light'
import { wideShadowFilter } from '../vinci/machines/screw-shadow'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { cameraPosition, exp, float, fog, interleavedGradientNoise, lights, mix, output, positionWorld, rangeFogFactor, screenCoordinate, smoothstep,
  texture, uniform, vec2, vec3, vec4, viewportSize, viewportUV } = TSL as unknown as Record<string, N>

const DEG = Math.PI / 180

export const STAGE = Object.freeze({
  /** the sweep behind, in linear light before the print: its edge and the pool behind the machine */
  field: {
    edge: [.0040, .0042, .0046] as const,
    pool: [.052, .048, .044] as const,
    /** the pool's radius as a share of the picture's height, how far above the machine's centre it stands (the same
     * share), and how much darker the frame's top runs */
    radius: .8, lift: .1, top: .35,
    /** the pool is wider than it is tall, as a lamp's spill on a sweep spreads along the floor's line */
    wide: 1.3,
    /** a dither of this share of the value, so an 8-bit gradient of a few levels never bands */
    dither: .05,
    /** how much of its fall the pool keeps below its centre where the eye stands low enough to see the horizon under
     * it (0: all of it): a lamp's spill on a cove stays on the cove down to the floor, so a low eye finds the field no
     * darker just above the floor than beside the machine; an eye looking down sees no field there, and nothing moves */
    below: 1,
  },
  /** the floor: matte, a dark warm grey, its own value falling from the machine's foot by radii of the machine */
  floor: { albedo: [.05, .048, .045] as const, roughness: .93, pool: [.3, 1.8] as const, keep: .2,
    /** a bounce off the room toward the floor, as a share of the albedo: a soft key's shadow is grey, never a black slab */
    bounce: .6 },
  /** the shade under the machine where it stands: the cells a hand's width round every point near the floor */
  contact: { cells: 96, reach: .14, strength: .55, height: .1 },
  /** the air begins this many radii past the machine's centre and is the field's own colour this many further; the
   * floor also hands itself to the field toward the horizon, over this share of the angle from the horizon down to the
   * machine's foot (0: by distance alone), so a low eye finds no band where a far floor meets the field; past 1 the
   * hand-off runs on under the machine's foot, a fifth of the field there, so the ramp has no knee where the floor is lit */
  air: { near: 1.0, far: 2.8, horizon: 1.4,
    /** the hand-off spans at least this share of the picture's own height in angle: a low eye sees the floor behind
     * the machine in a few rows, and a hand-off of a few rows reads as a band */
    least: .3 },
  /** the key: turned from the eye's bearing (negative: the eye's left) and raised, warm, soft */
  key: { turn: -50, height: 52, kelvin: 4500, lux: 280, ambient: .55,
    /** the shadow's soft edge as a share of the machine's span, as a broad source high over it gives */
    soft: .01 },
  /** the fill: the sky's and the floor's share, and a weak lamp from the eye itself */
  fill: { sky: '#6d7682', ground: '#40362c', intensity: .36, environment: .2, front: .12, frontHeight: 14, frontKelvin: 5600 },
  /** the edge lights from behind, each at its bearing from the eye's: weaker than the key, cool, never on the floor;
   * a thin translucent cloth takes them at `cloth` of their strength (a scrim on the lamp), since from behind they light
   * it through as a lamp lights a shade */
  rim: { turns: [140, -140] as readonly number[], height: 14, kelvin: 6000, share: .4, cloth: .15 },
  /** the room metal and glass mirror: the fill's dark sky alone at 0; else a softbox overhead and two strips behind at
   * `stripTurn` either side of the eye's back, turning with the eye. Every other surface keeps the fill's dark sky (wood
   * under the strips slides grey), but the scale figure, which takes the room at `figure` of its strength so that in a
   * machine's shade it keeps its form and stays under the lit wood */
  room: { softbox: .04, strips: 1, stripTurn: 115, stripWide: 8, stripTop: 32, boxRadius: 34, intensity: 5, kelvin: 5000, figure: .7 },
  /** the vertical lens in degrees: a long lens on the desktop, the phone's upright frame narrower still across */
  lens: { desktop: 24, phone: 40 },
  /** the machine's swept outline's share of its fit box, across and upright, per device: the box keeps room for the
   * machine's own longest caption, and the phone's is near square, so an upright machine takes more of its height to
   * stand as large in the glass */
  share: { desktop: [.86, .86] as readonly [number, number], phone: [.86, .94] as readonly [number, number],
    /** on the desk a machine with no step stands in the whole picture: its height at most this share of it */
    most: .82 },
  /** the print: the museum's neutral curve, no split, a light vignette, a tooth that dithers */
  print: { exposure: 1.0, toe: .012, shoulder: .35, vignette: .1, grain: .005 },
})

type Numbers = typeof STAGE
/** THE NUMBERS A LOOK ROUND TRIES, on the dev server only: `globalThis.__stageProbe` laid over `STAGE` part by part */
export function stageNumbers(): Numbers {
  const probe = import.meta.env.DEV ? (globalThis as { __stageProbe?: Record<string, unknown> }).__stageProbe : undefined
  if (!probe) return STAGE
  const out: Record<string, unknown> = { ...STAGE }
  for (const [part, value] of Object.entries(probe)) {
    const base = (STAGE as Record<string, unknown>)[part]
    out[part] = value && typeof value === 'object' && !Array.isArray(value) && base && typeof base === 'object' ? { ...base, ...value } : value
  }
  return out as Numbers
}

/** the print (`STAGE.print`), its occlusion scaled to the machine */
export function stageGrade(span: number): Grade {
  // the shoulder rolls the linen's top faces off before they clip under the key
  const { exposure, toe, shoulder, vignette, grain } = stageNumbers().print
  return { ...IDENTITY, name: 'machine-close-view', exposure, toe, shoulder, saturation: 1, vignette, grain,
    ao: { intensity: .9, distance: Math.max(.02, span * .03), thickness: 1 } }
}

export interface StageSetting {
  /** the field node: the scene's background and the air's colour */
  field: Node
  floor: Mesh
  key: KeyLight
  /** the eye's bearing (radians, the eye at sin/cos of it round the machine) turns the rig; the machine's centre on the
   * canvas (shares, top-left origin) and the picture's height as a share of the canvas's place the pool */
  follow(o: { yaw: number; centre?: { x: number; y: number }; picture?: number; eye?: Vector3; lens?: number; camera?: Camera }): void
  /** the air's ramp, in metres from the eye */
  air(near: number, far: number): void
  /** the contact shade from points of the machine's surfaces, in world metres */
  contact(points: readonly Vector3[]): void
  /** a machine that walks carries its shade: how far it stands from where the shade was painted, metres */
  carry(by: Vector3): void
  /** a machine that brings its own ground (the bridge's banks): the floor laid over it at `above` metres, clear within
   * `from` metres of the box and whole from `to`, so that ground ends in the setting's with no edge; a channel (its
   * half width across x, metres) keeps the floor off the water that runs out along it */
  merge(box: Box3, from: number, to: number, above: number, channel?: number): void
  /** a mirror-like surface the edge light must not reach: from behind the machine it stands as a hot spot in a mirror
   * the eye looks down on */
  offRim(material: MeshStandardNodeMaterial): void
  /** the machine's own surfaces under the setting's rules for them (a thin translucent cloth kept from the edge light) */
  machine(root: Object3D): void
  /** the scale figure, the setting's own: it takes the studio's lamps at `room.figure` of their strength */
  figure(root: Object3D): void
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
  const S = stageNumbers()

  // ---- the field, in the canvas's own shares (top-left origin), so a pass drawn at another resolution keeps its place
  const poolCentre = uniform(vec2(.5, .45)), poolRadius = uniform(float(S.field.radius))
  /** the horizon's row on the canvas (a share of its height from the top); above the canvas where it is not known */
  const horizonRow = uniform(float(-1))
  const edge = vec3(...S.field.edge), pool = vec3(...S.field.pool)
  const aspect = viewportSize.x.div(viewportSize.y.max(1))
  const toward = viewportUV.sub(poolCentre).mul(vec2(aspect.div(S.field.wide), 1)).div(poolRadius)
  const hold = float(S.field.below).mul(smoothstep(poolCentre.y, poolCentre.y.add(.05), horizonRow))
  const offset = S.field.below > 0 ? vec2(toward.x, mix(toward.y, toward.y.min(0), hold)) : toward
  const glow = exp(offset.dot(offset).mul(-1.7))
  const top = mix(float(1 - S.field.top), float(1), smoothstep(0, .55, viewportUV.y))
  const dither = float(1).add(interleavedGradientNoise(screenCoordinate.xy).sub(.5).mul(S.field.dither))
  const field = mix(edge, pool, glow).mul(top).mul(dither)
  scene.background = new Color().setRGB(S.field.edge[0], S.field.edge[1], S.field.edge[2])
  scene.backgroundNode = field

  // ---- the light, in the eye's bearing
  // the probe's own sun disc would stand at a fixed bearing while the rig turns: it carries none
  const sky = { zenith: S.fill.sky, horizon: '#2a2b2d', ground: S.fill.ground, stars: 0, key: { azimuth: 0, elevation: S.key.height, colour: '#ffffff', size: 1, intensity: 0 } }
  const studio = S.room.softbox > 0 || S.room.strips > 0 ? bakeRoom(S.room, sky, S.fill.environment / S.room.intensity) : null
  const key = stack.light({ azimuth: 0, elevation: S.key.height, kelvin: S.key.kelvin, lux: S.key.lux, ambient: S.key.ambient,
    reach: Math.max(24, span * 6), cascades: options.cascades ?? [span * 1.25, span * 3.4], sky })
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
  const rims = S.rim.turns.map((_, i) => lamp(S.rim.kelvin, S.key.lux / 100 * S.rim.share, `stage/rim-${i}`))
  // the scrimmed edge lights a translucent cloth takes instead: lamps outside the scene, so no other surface sees them
  const scrimmed = S.rim.cloth < 1 ? S.rim.turns.map((_, i) => {
    const l = new DirectionalLight(kelvinToColour(S.rim.kelvin).getHex(), S.key.lux / 100 * S.rim.share * S.rim.cloth)
    l.name = `stage/rim-cloth-${i}`
    l.castShadow = false
    return l
  }) : []
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
  const walkedBy = uniform(vec2(0, 0))
  const floorMaterial = new MeshStandardNodeMaterial({ roughness: S.floor.roughness, metalness: 0 })
  floorMaterial.name = 'stage/floor'
  // the floor seen at a grazing angle hands its colour to the field's at the same pixel
  const horizonSine = uniform(float(.05))
  const below = positionWorld.sub(cameraPosition).normalize().y.negate()
  const horizonOut = vec4(mix(output.rgb, field, float(1).sub(smoothstep(0, horizonSine, below))), output.a)
  let albedo: N, shade: N
  {
    const along = positionWorld.xz.sub(vec2(centre.x, centre.z)).length()
    const fall = mix(float(1), float(S.floor.keep), smoothstep(radius * S.floor.pool[0], radius * S.floor.pool[1], along))
    const cell = vec2(positionWorld.x.sub(walkedBy.x).sub(x0).div(wide), positionWorld.z.sub(walkedBy.y).sub(z0).div(wide))
    const inside = smoothstep(0, .02, cell.x).mul(smoothstep(1, .98, cell.x)).mul(smoothstep(0, .02, cell.y)).mul(smoothstep(1, .98, cell.y))
    shade = float(1).sub(texture(contactTexture, cell).r.mul(inside).mul(S.contact.strength))
    albedo = vec3(...S.floor.albedo).mul(fall).mul(shade)
    floorMaterial.colorNode = albedo
    floorMaterial.emissiveNode = albedo.mul(S.floor.bounce)
    floorMaterial.aoNode = shade
    // the edge light from behind would lay a second sheen on the floor toward the eye: the floor takes the key and the fills
    floorMaterial.lightsNode = lights([key.light, key.fill, front])
    if (S.air.horizon > 0) floorMaterial.outputNode = horizonOut
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
  function merge(area: Box3, from: number, to: number, above: number, channel = 0): void {
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
    const opacity = smoothstep(from, to, outside)
    material.opacityNode = channel > 0 ? opacity.mul(smoothstep(channel * .92, channel * 1.08, positionWorld.x.sub(c.x).abs())) : opacity
    if (S.air.horizon > 0) material.outputNode = horizonOut
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
    keep(material)
    material.lightsNode = floorMaterial.lightsNode
    material.needsUpdate = true
  }
  function machine(root: Object3D): void {
    const cloth = S.rim.cloth < 1 ? lights([key.light, key.fill, front, ...scrimmed]) : null
    root.traverse(node => {
      const materials = (node as Mesh).isMesh ? [(node as Mesh).material].flat() : []
      for (const material of materials) {
        const m = material as MeshStandardNodeMaterial & { thicknessColorNode?: unknown; transmission?: number }
        if (cloth && m.thicknessColorNode) {
          keep(m)
          m.lightsNode = cloth
          m.needsUpdate = true
        } else if (studio && (m.metalness >= .3 || (m.transparent && 'transmission' in m) || (m.transmission ?? 0) > 0)) mirror(m)
      }
    })
  }
  /** iron, bronze and glass read on a dark field only by the lamps they mirror */
  function mirror(material: MeshStandardNodeMaterial, share = 1): void {
    if (!studio) return
    keep(material)
    material.envMap = studio
    material.envMapIntensity = S.room.intensity * share
    if (!Number.isNaN(lastYawSet)) material.envMapRotation.set(0, lastYawSet, 0)
    mirrors.add(material)
    material.needsUpdate = true
  }
  function keep(material: MeshStandardNodeMaterial): void {
    if (!kept.has(material)) kept.set(material, { lightsNode: material.lightsNode, envMap: material.envMap, envMapIntensity: material.envMapIntensity, envMapRotation: material.envMapRotation.clone() })
  }
  function figure(root: Object3D): void {
    root.traverse(node => {
      if ((node as Mesh).isMesh) for (const material of [(node as Mesh).material].flat()) mirror(material as MeshStandardNodeMaterial, S.room.figure)
    })
  }

  let lastYaw = NaN, lastYawSet = NaN
  const mirrors = new Set<MeshStandardNodeMaterial>()
  const kept = new Map<MeshStandardNodeMaterial, Partial<MeshStandardNodeMaterial>>()
  function follow(o: { yaw: number; centre?: { x: number; y: number }; picture?: number; eye?: Vector3; lens?: number; camera?: Camera }): void {
    if (o.camera) {
      const ahead = o.camera.getWorldDirection(new Vector3()).setY(0)
      horizonRow.value = ahead.lengthSq() > 1e-8 ? onCanvas(ahead.normalize().multiplyScalar(1e4).add(o.camera.position), o.camera).y : -1
    }
    if (o.eye && S.air.horizon > 0) {
      const down = Math.atan2(Math.max(.01, o.eye.y - floorY), Math.hypot(o.eye.x - centre.x, o.eye.z - centre.z))
      horizonSine.value = Math.max(1e-4, Math.sin(Math.max(down * S.air.horizon, (o.lens ?? 0) * S.air.least)))
    }
    if (o.yaw !== lastYaw) {
      lastYaw = o.yaw
      for (const l of cascadesOf) place(l, o.yaw + S.key.turn * DEG, S.key.height * DEG)
      key.direction.copy(cascadesOf[0]!.position).sub(centre).normalize()
      place(front, o.yaw, S.fill.frontHeight * DEG)
      rims.forEach((rim, i) => place(rim, o.yaw + S.rim.turns[i]! * DEG, S.rim.height * DEG))
      scrimmed.forEach((rim, i) => place(rim, o.yaw + S.rim.turns[i]! * DEG, S.rim.height * DEG))
      // the studio's lamps stand round the eye as the rig does
      for (const material of mirrors) material.envMapRotation.set(0, o.yaw, 0)
      lastYawSet = o.yaw
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
    // a machine lent from a room goes back with its own surfaces
    for (const [material, { envMapRotation, ...was }] of kept) {
      Object.assign(material, was)
      if (envMapRotation) material.envMapRotation.copy(envMapRotation)
      material.needsUpdate = true
    }
    kept.clear()
    studio?.dispose()
    for (const l of [front, ...rims, ...scrimmed]) { l.removeFromParent(); l.target.removeFromParent(); l.dispose() }
    dropVeil()
    floor.removeFromParent()
    floor.geometry.dispose()
    floorMaterial.dispose()
    contactTexture.dispose()
  }
  function carry(by: Vector3): void {
    walkedBy.value.set(by.x, by.z)
  }
  return { field, floor, key, follow, air, contact, carry, merge, offRim, machine, figure, dispose }
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

/** THE STUDIO AS METAL AND GLASS SEE IT: the fill's dark sky with a softbox overhead and two upright strips behind the
 * machine, either side of the eye's back (the eye at bearing 0; the scene turns the room with the eye). Iron and glass
 * mirror what stands round them, so on a dark field they read only by the lamps they reflect. */
function bakeRoom(room: { softbox: number; strips: number; stripTurn: number; stripWide: number; stripTop: number; boxRadius: number; kelvin: number },
  sky: { zenith: string; horizon: string; ground: string }, keep: number): Texture {
  const W = 512, H = 256
  const canvas = document.createElement('canvas')
  canvas.width = W; canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('2d context unavailable')
  const band = ctx.createLinearGradient(0, 0, 0, H)
  band.addColorStop(0, sky.zenith); band.addColorStop(.42, sky.zenith); band.addColorStop(.5, sky.horizon)
  band.addColorStop(.56, sky.ground); band.addColorStop(1, sky.ground)
  ctx.fillStyle = band
  ctx.fillRect(0, 0, W, H)
  // the sky keeps its own radiance under the room's stronger probe: darkened by the ratio, near enough in sRGB
  ctx.fillStyle = `rgba(0,0,0,${1 - Math.pow(Math.min(1, keep), 1 / 2.2)})`
  ctx.fillRect(0, 0, W, H)
  ctx.globalCompositeOperation = 'lighter'
  // the softbox: a soft disc round the zenith, the top rows of the map
  const box = Math.min(1, room.softbox)
  if (box > 0) {
    const rows = H * room.boxRadius / 180
    const g = ctx.createLinearGradient(0, 0, 0, rows)
    g.addColorStop(0, `rgba(255,244,228,${box})`); g.addColorStop(.6, `rgba(255,244,228,${box * .8})`); g.addColorStop(1, 'rgba(255,244,228,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, rows)
  }
  // the strips: upright, from a little under the horizon to well over it, soft at their sides
  const strip = Math.min(1, room.strips)
  const tint = kelvinToColour(room.kelvin), tone = [tint.r, tint.g, tint.b].map(v => Math.round(255 * Math.pow(v / Math.max(tint.r, tint.g, tint.b), 1 / 2.2))).join(',')
  if (strip > 0) {
    // three's equirect: a bearing b (the eye at 0, (sin b, cos b) on the floor) stands at u = 0.75 - b / 360
    for (const b of [180 - room.stripTurn, 180 + room.stripTurn]) {
      const u = ((.75 - b / 360) % 1 + 1) % 1, cx = u * W, half = W * room.stripWide / 360 / 2
      const top = H * (.5 - room.stripTop / 180), bottom = H * (.5 + 8 / 180)
      for (const x of [cx, cx - W, cx + W]) {
        const g = ctx.createLinearGradient(x - half * 1.6, 0, x + half * 1.6, 0)
        g.addColorStop(0, `rgba(${tone},0)`); g.addColorStop(.3, `rgba(${tone},${strip})`)
        g.addColorStop(.7, `rgba(${tone},${strip})`); g.addColorStop(1, `rgba(${tone},0)`)
        ctx.fillStyle = g
        ctx.fillRect(x - half * 1.6, top, half * 3.2, bottom - top)
      }
    }
  }
  const tex = new CanvasTexture(canvas)
  tex.mapping = EquirectangularReflectionMapping
  tex.colorSpace = SRGBColorSpace
  tex.needsUpdate = true
  return tex
}
