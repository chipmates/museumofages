import { Vector3 } from 'three/webgpu'
import type { Pose } from './rail'
import { RAIL_SHIFT_CEILING } from './rail-projection'

/** THE SHORT PHONE'S WINDOW, on the upright master (v from 0 at the top). On
 * a 390 by 664 or 360 by 640 screen the words start at 58 to 60% of the
 * glass and the trim takes the master's top tenth, so a hero must stand whole
 * between v 0.154 and 0.545 with its middle near 0.34; a hero with a foot on
 * the ground may stand lower, its base at 0.48, its middle at most 0.39. The
 * top keeps 6% of the short phone's height clear over the hero: a hero at
 * the trim's 21 px margin read as pressed against the edge. */
const WINDOW = { top: .154, foot: .545, middle: .34, middleLow: .39, base: .48, slack: .05 }
/** The upright lens may open to hold a tall hero, no wider than this across. */
const ACROSS_MOST_DEG = 55
const UPRIGHT_ASPECT = 390 / 844
const PITCH_STEP_DEG = .25

/** THE HERO OF EACH STOP, the one thing its line names, as the stop's eye sees
 * it: the four corners of its outline on the phone's frame (top left, top
 * right, foot left, foot right) as headings east of north and elevations, in
 * degrees. Read off the upright frames of 23 Oct, a painting to its frame's
 * outer edge, the aerial screw and the grave from their own numbers; a hero
 * stays where it is in the world, so an aim or a lens changed later keeps it,
 * an eye moved does not. `standing`: it has a foot on the ground. `with`: neighbours the frame
 * keeps whole beside the hero. `inset`: how far inside the window the hero
 * stands; a frame read to its outer edge needs the trim's margin exactly. */
type Corners = readonly (readonly [number, number])[]
const UPRIGHT_HEROES: Readonly<Record<string, { corners: Corners; standing?: true; with?: Corners; inset?: number }>> = {
  'picture-room': { corners: [[-158.76, 13.26], [-138.86, 10.85], [-158.76, -15.07], [-138.82, -12.37]], inset: .006 },
  'picture-room-lisa': { corners: [[-172.31, 8.89], [172.31, 8.89], [-172.31, -11.8], [172.31, -11.8]] },
  'picture-room-west': { corners: [[170.9, 13.64], [152.47, 12.29], [170.9, -15.65], [152.47, -14.12]] },
  flight: { corners: [[-92.61, 20.28], [-47.2, 20.25], [-92.61, -9.71], [-47.2, -9.69]], standing: true },
  works: { corners: [[-79.57, -2.90], [-53.49, -2.80], [-80.30, -18.48], [-52.08, -17.76]], standing: true },
  'reading-table': { corners: [[-95.94, -14.53], [-84.35, -14.54], [-96.25, -20.12], [-84.05, -20.13]] },
  body: { corners: [[-102.99, 9.79], [-77.24, 9.80], [-103.46, -4.53], [-76.78, -4.53]] },
  'body-valve': { corners: [[-96.42, 26.72], [-83.37, 26.71], [-96.09, 13.06], [-83.71, 13.05]] },
  'line-early': { corners: [[-15.40, -45.29], [26.45, -45.09], [-20.42, -56.54], [31.66, -56.26]] },
  'supper-wall': { corners: [[-105.90, 20.27], [-58.71, 20.22], [-106.28, -6.13], [-58.33, -6.12]] },
  arrival: { corners: [[-90.24, 34.58], [-36.76, 34.58], [-86.64, -6.60], [-40.36, -6.60]], standing: true },
  courtyard: { corners: [[-45.13, 12.66], [-37.86, 12.67], [-44.81, -4.20], [-38.11, -4.20]], standing: true },
  hall: { corners: [[-139.86, -2.88], [-129.46, -2.94], [-140.61, -13.98], [-129.56, -14.31]], standing: true },
  oratory: { corners: [[-31.37, 24.37], [-6.9, 24.56], [-31.37, -13.73], [-6.9, -13.84]], standing: true },
  study: { corners: [[-60.91, 33.72], [-28.98, 33.44], [-60.91, -6.6], [-28.98, -6.53]], standing: true },
  chamber: { corners: [[-28.06, 43.21], [23.19, 44.37], [-22.81, -0.30], [18.68, -0.31]], standing: true },
  grave: { corners: [[-66.47, -7.82], [-37.11, -7.83], [-66.47, -15.88], [-37.11, -15.91]], with: [[-58.77, 12.85], [-43.64, 12.83], [-58.77, -2.97], [-43.64, -2.96]] },
}

const RAD = Math.PI / 180
const direction = ([heading, elevation]: readonly [number, number]): Vector3 =>
  new Vector3(Math.sin(heading * RAD) * Math.cos(elevation * RAD), Math.sin(elevation * RAD), -Math.cos(heading * RAD) * Math.cos(elevation * RAD))
/** The same eye and heading, looking `pitch` degrees up, at `fov`. */
function aimed(pose: Pose, pitch: number, fov: number): Pose {
  const v = pose.at.clone().sub(pose.eye), heading = Math.atan2(v.x, -v.z), t = pitch * RAD
  return { eye: pose.eye.clone(), at: pose.eye.clone().add(new Vector3(Math.sin(heading) * Math.cos(t), Math.sin(t), -Math.cos(heading) * Math.cos(t))), fov }
}
/** The hero's box on the upright master, as three's camera projects it with no shift: [u0, u1, v0, v1]. */
function heroBox(pose: Pose, corners: readonly Vector3[]): [number, number, number, number] | null {
  const forward = pose.at.clone().sub(pose.eye).normalize(), right = forward.clone().cross(new Vector3(0, 1, 0)).normalize(), up = right.clone().cross(forward)
  const tan = Math.tan(pose.fov * RAD / 2)
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  for (const d of corners) {
    const z = d.dot(forward)
    if (z <= 1e-6) return null
    const u = (d.dot(right) / z / (tan * UPRIGHT_ASPECT) + 1) / 2, v = (1 - d.dot(up) / z / tan) / 2
    u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v)
  }
  return [u0, u1, v0, v1]
}
/** Where the hero's middle is stood: 0.34, or lower for a small hero on the ground, never past the window's edges. */
function middleFor(box: readonly number[], standing: boolean, top: number, foot: number): number {
  const height = box[3]! - box[2]!
  const middle = standing ? Math.min(WINDOW.middleLow, Math.max(WINDOW.middle, WINDOW.base - height / 2)) : WINDOW.middle
  return height <= foot - top + 1e-4 ? Math.max(top + height / 2, Math.min(foot - height / 2, middle)) : middle
}

/** THE UPRIGHT FRAME STANDS ITS HERO IN THE SHORT PHONE'S WINDOW. A stop
 * whose hero already stands there keeps its pose, and so does a pose that
 * carries a shift lens of its own. Every other phone pose keeps its eye and
 * heading and looks level, so the walls stand upright; its lens opens only as
 * far as a hero taller than the window needs and 55 degrees across allows;
 * the shift lens slides the frame until the hero stands in the window. Where
 * the shift's ceiling cannot reach a hero far below or above the eye, the
 * look tilts toward it by the least that lets the shift reach. */
export function uprightPose(stop: string, pose: Pose): Pose {
  const hero = UPRIGHT_HEROES[stop]
  if (!hero || pose.shift !== undefined) return pose
  const corners = [...hero.corners, ...(hero.with ?? [])].map(direction)
  const top = WINDOW.top + (hero.inset ?? 0), foot = WINDOW.foot - (hero.inset ?? 0)
  const held = heroBox(pose, corners)
  if (held && held[2] >= top && held[3] <= foot && Math.abs((held[2] + held[3]) / 2 - WINDOW.middle) <= WINDOW.slack) return pose
  const widest = 2 * Math.atan(Math.tan(ACROSS_MOST_DEG * RAD / 2) / UPRIGHT_ASPECT) / RAD
  const level = heroBox(aimed(pose, 0, pose.fov), corners)
  const toward = level && (level[2] + level[3]) / 2 < WINDOW.middle ? 1 : -1
  for (let pitch = 0; ; pitch += toward * PITCH_STEP_DEG) {
    let fov = pose.fov, box = heroBox(aimed(pose, pitch, fov), corners)
    if (!box) { if (Math.abs(pitch) >= 60) return pose; continue }
    // the hero's height is not linear in the lens's tangent off the axis, so
    // the opening is taken again until the hero fits the window to a hair
    for (let k = 0, tall = (box[3] - box[2]) / (foot - top); k < 4 && tall > 1 + 1e-6 && fov < widest; k++, tall = (box[3] - box[2]) / (foot - top)) {
      fov = Math.min(widest, 2 * Math.atan(Math.tan(fov * RAD / 2) * tall) / RAD)
      box = heroBox(aimed(pose, pitch, fov), corners) ?? box
    }
    const shift = 2 * (middleFor(box, hero.standing === true, top, foot) - (box[2] + box[3]) / 2)
    if (Math.abs(shift) <= RAIL_SHIFT_CEILING || Math.abs(pitch) >= 60)
      return { ...aimed(pose, pitch, fov), shift: Math.max(-RAIL_SHIFT_CEILING, Math.min(RAIL_SHIFT_CEILING, shift)) }
  }
}

/** The stops this cure reads a hero for. */
export const uprightStops = (): readonly string[] => Object.keys(UPRIGHT_HEROES)
