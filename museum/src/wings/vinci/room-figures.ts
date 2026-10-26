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

import { CircleGeometry, Group, Mesh, MeshBasicNodeMaterial, type Material } from 'three/webgpu'
import { float, length, positionGeometry, smoothstep, vec3 } from 'three/tsl'
import { loadMeasureGeometry, measure, measureMaterial } from '../../measure'
import { assetAddress } from '../../stack/materials'

/** the baked measure in the store; the digest is the bytes' own */
export const MEASURE_RECORD = { wing: 'shared', path: 'measure/measure-170.glb', sha256: '5b3155519640dfe65704758360afed8244d66223dec58d0abee0a2283cab4a7a' } as const

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
}

export const VINCI_ROOM_FIGURES: readonly RoomFigure[] = [
  { room: 'house', stop: 'stop:arrival', framing: 'wide', shape: 'clip', at: [16.5, 1, 14.25], yaw: 1.2827 },
  { room: 'house', stop: 'stop:arrival', framing: 'upright', shape: 'clip', at: [16.5, 1, 14.25], yaw: 1.2827 },
  { room: 'grave-court', stop: 'stop:grave', framing: 'wide', shape: 'clip', at: [-55.25, -6.42, 29.75], yaw: 1.6366, tone: 0.45 },
  { room: 'mechanism-hall', stop: 'stop:flight', framing: 'wide', shape: 'fade', at: [-55.25, -6.3, 48.5], yaw: 1.4565 },
  { room: 'mechanism-hall', stop: 'stop:flight', framing: 'upright', shape: 'fade', at: [-55.25, -6.3, 48.5], yaw: 1.4565 },
  { room: 'picture-room', stop: 'stop:picture-room', framing: 'wide', shape: 'fade', at: [-36, -6.292, 38], yaw: 1.57, tone: 0.5 },
  { room: 'long-gallery', stop: 'stop:line-early', framing: 'wide', shape: 'fade', at: [-32.75, -6.297, 56.25], yaw: 0.4602 },
]

/** the scene flag: every room figure in (the default) or none */
export const roomFiguresShown = (): boolean => typeof location === 'undefined' || new URLSearchParams(location.search).get('figures') !== 'off'

/** the contact shadow: an ellipse round the soles (half widths across and along, metres), its darkest share, its
 * falloff, and its lift over the finished floor (drawn over the floor, never under its finish) */
const CONTACT = { across: 0.24, along: 0.2, forward: 0.04, depth: 0.55, fall: 1.5, lift: 0.006 }

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
      materials.push(material)
      const body = measure(geometry, { material })
      light(figure.room, body)
      body.name = `vinci/room-figures/${figure.room}/${figure.framing}`
      body.userData['manifestId'] = 'shared/measure'
      // a ray picks the work behind it, never the marker
      body.raycast = () => {}
      // THE CONTACT: the soles' own darkening of the floor, an engine term like the rooms' bounce
      const shade = new MeshBasicNodeMaterial({ transparent: true, depthWrite: false, fog: false })
      const r = length(positionGeometry.xz)
      shade.colorNode = vec3(0, 0, 0)
      shade.opacityNode = float(1).sub(smoothstep(0, 1, r)).pow(CONTACT.fall).mul(CONTACT.depth)
      shade.polygonOffset = true
      shade.polygonOffsetFactor = -2
      shade.polygonOffsetUnits = -4
      shade.name = 'vinci/room-figures/contact'
      materials.push(shade)
      const foot = new Mesh(contact, shade)
      foot.name = `vinci/room-figures/${figure.room}/${figure.framing}/contact`
      foot.position.set(0, CONTACT.lift, CONTACT.forward)
      foot.scale.set(CONTACT.across, 1, CONTACT.along)
      foot.renderOrder = 2
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
