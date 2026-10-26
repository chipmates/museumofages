/* THE ROOM FIGURES: the one measure of each room, standing where that room's
   held stop shows it whole, a pace in from the frame's edge, off the work, in
   the room's own light, with a contact shadow at its feet. A marker, not a
   person (`src/measure`).

   Each framing is its own composition (the upright one is recomposed for the
   phone), so a room may stand its figure in a different place per framing, or
   in none where that framing's held still cannot show a whole body beside the
   work. The places are proved against every entry of the film by the round's
   visibility tool: a figure of the clip shape shows only in its held still and
   the clips touching that stop; one of the fade shape is drawn for its held
   still alone.

   `?figures=off` leaves every room figure out: the switch's second version. */

import { CircleGeometry, CustomBlending, Group, Mesh, MeshBasicNodeMaterial, OneFactor, OneMinusSrcAlphaFactor, SrcAlphaFactor, ZeroFactor, type Material } from 'three/webgpu'
import { abs, float, length, max, min, positionGeometry, smoothstep, vec2, vec3 } from 'three/tsl'
import { loadMeasureGeometry, measure, measureMaterial } from '../../measure'
import { assetAddress } from '../../stack/materials'

/** the baked measure in the store; the digest is the bytes' own */
export const MEASURE_RECORD = { wing: 'shared', path: 'measure/measure-170.glb', sha256: '761f25e1309c8ffebf3cb0c0f63c888d38336d8258f66713cf5ba47434eab8b5' } as const

export type FigureRoom = 'house' | 'grave-court' | 'mechanism-hall' | 'picture-room' | 'long-gallery'
export type FigureShape = 'clip' | 'fade'
export interface RoomFigure {
  room: FigureRoom
  /** the film's held stop */
  stop: string
  framing: 'wide' | 'upright'
  shape: FigureShape
  /** world metres: the soles' centre on the finished floor (a room's floor skin stands a few mm over its construction) */
  at: readonly [x: number, y: number, z: number]
  /** rotation about the upright, square to the held eye */
  yaw: number
  /** the grey's lightness as a share of the measure's own, where the room behind the body prints the measure's own
   * value: it separates by value, never by a glow or an outline */
  tone?: number
  /** a cool cast on the grey, luminance kept (linear r, g, b over 1), where the room's light is warm enough to turn a
   * neutral grey into a skin tone: it holds the marker nearer neutral and still takes the room's light */
  tint?: readonly [r: number, g: number, b: number]
  /** outdoors: the share of the fill and the environment the body's front keeps, by the house walls' own law
   * (`surface.ts`: the share of sky a face sees past the house's walls, as `house-weather.ts` bakes it, squared,
   * times 0.8, plus 0.2), taken at its place and facing. Every street surface carries its occlusion; a body without
   * one is lit as an open field */
  sky?: number
  /** where the figure stands in leaf litter, the contact's lift, metres: over the litter's lower layers
   * (`leaf-litter.ts` lays them 3 to 13 mm over the ground, 12 mm more on grass), so the leaves round the soles
   * darken with the ground */
  litter?: number
  /** the contact's strength as a multiple of the shared one: in open shade every light the ground takes is the sky's,
   * and the body hides a larger share of it near the soles than in a room lit by a key */
  contact?: number
}

export const VINCI_ROOM_FIGURES: readonly RoomFigure[] = [
  { room: 'house', stop: 'stop:arrival', framing: 'wide', shape: 'clip', at: [13.95, 1, 9.4], yaw: 1.0229, tone: 1, sky: 0.638, litter: 0.025, contact: 1.5 },
  { room: 'house', stop: 'stop:arrival', framing: 'upright', shape: 'clip', at: [16.5, 1, 14.25], yaw: 1.2827, tone: 0.65, sky: 0.844, litter: 0.025, contact: 1.5 },
  { room: 'grave-court', stop: 'stop:grave', framing: 'wide', shape: 'clip', at: [-54.8125, -6.42, 29.25], yaw: 1.5771, tone: 0.45, contact: 1.4 },
  { room: 'mechanism-hall', stop: 'stop:flight', framing: 'wide', shape: 'fade', at: [-55.25, -6.3, 48.5], yaw: 1.4565, tone: 0.36, tint: [0.7938, 1.032, 1.29] },
  { room: 'mechanism-hall', stop: 'stop:flight', framing: 'upright', shape: 'fade', at: [-55.25, -6.3, 48.5], yaw: 1.4565, tone: 0.36, tint: [0.7938, 1.032, 1.29] },
  { room: 'picture-room', stop: 'stop:picture-room', framing: 'wide', shape: 'fade', at: [-35.625, -6.292, 37.6875], yaw: 1.5442, tone: 0.5 },
  { room: 'long-gallery', stop: 'stop:line-early', framing: 'wide', shape: 'fade', at: [-32.6875, -6.297, 52.625], yaw: 0.2808, tone: 0.6 },
]

/** the scene flag: every room figure in (the default) or none */
export const roomFiguresShown = (): boolean => typeof location === 'undefined' || new URLSearchParams(location.search).get('figures') !== 'off'

/** the contact shadow, drawn on a disc round the feet (half widths across and along, metres, centred `forward` of the
 * soles' middle) and lifted over the finished floor (never under its finish): a soft pool of `radius` metres under
 * the stance, and round each sole a darkening that falls with the distance from its footprint (a rounded rectangle
 * centred `side` either way and `toe` forward, half widths `half`), from `depth` at its edge to none `reach` metres
 * out. Measured from the footprint in metres, it reaches past the feet's sides and toes as far at a grazing eye as at
 * a high one, where a fall scaled to the disc printed only between the feet */
const CONTACT = { across: 0.36, along: 0.4, forward: 0.06, lift: 0.006, pool: 0.4, radius: 0.26, fall: 1.5,
  sole: { side: 0.11, toe: 0.07, half: [0.045, 0.115] as const, round: 0.035, depth: 0.5, reach: 0.12 } }

export interface RoomFigures {
  group: Group
  /** every figure stands (its geometry fetched) */
  ready: Promise<void>
  /** show the figures of the framing the stage now has */
  frame(narrow: boolean): void
  /** the collection's rooms are drawn this frame: a figure in them is drawn
   * with them, never through the walls the far stations leave out */
  follow(collectionDrawn: boolean): void
  dispose(): void
}

/** `light` lights a figure by its room, as the room lights its own surfaces */
export function createRoomFigures(light: (room: FigureRoom, body: Mesh) => void, figures: readonly RoomFigure[] = VINCI_ROOM_FIGURES): RoomFigures {
  const group = new Group()
  group.name = 'vinci/room-figures'
  const stood: { figure: RoomFigure; root: Group }[] = []
  const materials: Material[] = []
  // the body's geometry is the measure's shared one; the contact disc is ours to free
  let contact: CircleGeometry | undefined
  let alive = true, narrow: boolean | null = null, collection = true
  const show = (): void => {
    for (const s of stood) s.root.visible = (narrow === null || (s.figure.framing === 'upright') === narrow) && (s.figure.room === 'house' || collection)
  }
  const ready = loadMeasureGeometry(assetAddress(MEASURE_RECORD)).then(geometry => {
    if (!alive) return
    contact = new CircleGeometry(1, 48)
    contact.rotateX(-Math.PI / 2)
    for (const figure of figures) {
      const material = measureMaterial()
      if (figure.tone !== undefined) material.color.multiplyScalar(figure.tone)
      if (figure.tint !== undefined) { material.color.r *= figure.tint[0]; material.color.g *= figure.tint[1]; material.color.b *= figure.tint[2] }
      if (figure.sky !== undefined) material.aoNode = float(figure.sky)
      materials.push(material)
      const body = measure(geometry, { material })
      light(figure.room, body)
      body.name = `vinci/room-figures/${figure.room}/${figure.framing}`
      body.userData['manifestId'] = 'shared/measure'
      // a ray picks the work behind it, never the marker
      body.raycast = () => {}
      // THE CONTACT: the soles' own darkening of the floor, an engine term like the rooms' bounce
      // drawn among the opaque surfaces, after the ground and before the body (`renderOrder`), so the body covers it
      // where the disc lies in front of the soles' lowest centimetres; it keeps the target's alpha
      const shade = new MeshBasicNodeMaterial({ transparent: false, depthWrite: false, fog: false, blending: CustomBlending,
        blendSrc: SrcAlphaFactor, blendDst: OneMinusSrcAlphaFactor, blendSrcAlpha: ZeroFactor, blendDstAlpha: OneFactor })
      const S = CONTACT.sole
      // the disc's own metres in the body's frame (across, forward of the soles' middle)
      const at = positionGeometry.xz.mul(vec2(CONTACT.across, CONTACT.along)).add(vec2(0, CONTACT.forward))
      // each sole's footprint as a rounded rectangle's signed distance, metres
      const out = (side: number) => {
        const q = abs(at.sub(vec2(side, S.toe))).sub(vec2(S.half[0] - S.round, S.half[1] - S.round))
        return length(max(q, vec2(0, 0))).add(min(max(q.x, q.y), 0)).sub(S.round)
      }
      const soles = float(1).sub(smoothstep(0, S.reach, min(out(S.side), out(-S.side)))).pow(2).mul(S.depth)
      const pool = float(1).sub(smoothstep(0, 1, length(at.sub(vec2(0, CONTACT.forward))).div(CONTACT.radius))).pow(CONTACT.fall).mul(CONTACT.pool)
      shade.colorNode = vec3(0, 0, 0)
      shade.opacityNode = max(pool, soles).mul(figure.contact ?? 1).min(1)
      shade.polygonOffset = true
      shade.polygonOffsetFactor = -2
      shade.polygonOffsetUnits = -4
      shade.name = 'vinci/room-figures/contact'
      materials.push(shade)
      const foot = new Mesh(contact, shade)
      foot.name = `vinci/room-figures/${figure.room}/${figure.framing}/contact`
      foot.position.set(0, figure.litter ?? CONTACT.lift, CONTACT.forward)
      foot.scale.set(CONTACT.across, 1, CONTACT.along)
      foot.renderOrder = 1
      body.renderOrder = 2
      foot.raycast = () => {}
      foot.userData['manifestId'] = 'shared/measure'
      const root = new Group()
      root.name = `vinci/room-figures/${figure.room}`
      root.position.set(...figure.at)
      root.rotation.y = figure.yaw
      root.add(body, foot)
      group.add(root)
      stood.push({ figure, root })
    }
    show()
  })
  return {
    group, ready,
    frame(isNarrow) { narrow = isNarrow; show() },
    follow(drawn) { if (drawn !== collection) { collection = drawn; show() } },
    dispose() {
      alive = false
      for (const m of materials) m.dispose()
      contact?.dispose()
      group.removeFromParent()
    },
  }
}
