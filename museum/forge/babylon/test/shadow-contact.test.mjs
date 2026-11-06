// The near shadow slice at a street eye facing a low sun (open/light.ts nearSlice): the slice's far ground lies under
// its rays in the light's frame, so the box must hold it, or a contact there takes the far map, whose 2 cm texel and
// 9 cm bias let the sun past a caster 3 cm away (stop 10's lit speck at the south rooms' foot, 37 m out).
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { APP } from '../pages.mjs'

register('data:text/javascript,' + encodeURIComponent(`
export async function resolve(spec, ctx, next) {
  try { return await next(spec, ctx) } catch (e) {
    if ((spec.startsWith('./') || spec.startsWith('../')) && !/\\.[a-z]+$/.test(spec)) return next(spec + '.ts', ctx)
    throw e
  }
}`), import.meta.url)

const W = join(APP, 'src/wings/babylon')
const L = await import(pathToFileURL(join(W, 'open/light.ts')).href)
const S = await import(pathToFileURL(join(W, 'map/sun.ts')).href)
const { OrthographicCamera, PerspectiveCamera, Vector3 } = await import('three')
const cams = JSON.parse(readFileSync(join(W, 'map/map-cams.json'), 'utf8'))
const { E0, N0 } = JSON.parse(readFileSync(join(W, 'map/map-plan.json'), 'utf8')).frame
const D2R = Math.PI / 180
// the still's eye (1.65 m over the stand) and hour (the walk's clock at the still's second), as its sidecar states
// them; the street's level at the speck
const EYE = 4.05, HOUR = 17.621, STREET = 2.2
// the speck's ground point, 3 cm off the south rooms' street face (a ray probe through its pixels)
const SPECK = new Vector3(263.532, 2.203, 472.457)

/** stop 10's still camera, desktop or phone, as map.ts aims it (the shift lens on the projection) */
function stop10(framing) {
  const k = cams.path.find((x) => x.stop === 10 && x.still)
  const ph = framing === 'phone'
  const [w, h] = ph ? [390, 844] : [1600, 900]
  const hfov = ph ? k.phone.hfov : k.hfov, shift = ph ? k.phone.shift : k.shift
  const at = ph ? k.phone.at : k.at, look = ph ? k.phone.look : k.look
  const cam = new PerspectiveCamera(2 * Math.atan(Math.tan((hfov / 2) * D2R) * (h / w)) / D2R, w / h, 0.3, 60000)
  cam.position.set(at[0] - E0, EYE, N0 - at[1])
  cam.lookAt(new Vector3(look[0] - E0, look[2], N0 - look[1]))
  cam.updateProjectionMatrix()
  cam.projectionMatrix.elements[9] += shift
  cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert()
  cam.updateMatrixWorld(true)
  return { cam, k }
}
/** the near box as walkLight fits it, and a point's near weight there (SunShadowNode: the border band's smoothstep) */
function nearBox(cam, hour) {
  const sun = new Vector3(...S.sunVector(hour)).normalize()
  const h = Math.max(2, cam.position.y - 5), reach = Math.min(4200, 260 + h * 9)
  const depth = L.nearDepthOf(h, reach)
  const pts = L.nearSlice(cam, depth)
  const centre = pts.reduce((a, p) => a.add(p), new Vector3()).multiplyScalar(1 / pts.length)
  const lc = new OrthographicCamera()
  const box = L.sunBox(lc, pts, centre, sun, 0.02, 0.5)
  const weight = (p) => {
    const q = p.clone().applyMatrix4(lc.matrixWorldInverse)
    const u = (q.x - box.x0) / (box.x1 - box.x0), v = (q.y - box.y0) / (box.y1 - box.y0)
    const t = Math.min(1, Math.max(0, Math.min(u, 1 - u, v, 1 - v) / 0.06))
    return t * t * (3 - 2 * t)
  }
  return { box, depth, weight, texel: Math.max(box.x1 - box.x0, box.y1 - box.y0) / 8192 }
}
test('stop 10: the speck\'s contact takes the near map whole (the far map drew it, lit, before)', () => {
  const { cam } = stop10('desktop')
  const { weight, depth } = nearBox(cam, HOUR)
  const fwd = new Vector3(0, 0, -1).transformDirection(cam.matrixWorld)
  const at = SPECK.clone().sub(cam.position).dot(fwd)
  assert.ok(at > 30 && at < depth + 3, `the speck at ${at.toFixed(1)} m of view depth, the slice ${depth} m`)
  assert.equal(weight(SPECK), 1, `near weight ${weight(SPECK).toFixed(3)}`)
})

test('stop 10: every street point the frame sees takes the near map whole to a metre short of the slice\'s depth, and mostly to its end, both framings', () => {
  for (const framing of ['desktop', 'phone']) {
    const { cam } = stop10(framing)
    const { weight, depth } = nearBox(cam, HOUR)
    const fwd = new Vector3(0, 0, -1).transformDirection(cam.matrixWorld)
    const out = []
    let seen = 0
    for (let i = 0; i <= 40; i++) for (let j = 0; j <= 40; j++) {
      const dir = new Vector3(i / 20 - 1, j / 20 - 1, 0.5).unproject(cam).sub(cam.position).normalize()
      if (dir.y > -1e-3) continue
      const p = cam.position.clone().addScaledVector(dir, (STREET - EYE) / dir.y)
      const d = p.clone().sub(cam.position).dot(fwd)
      if (d > depth) continue
      seen++
      // the box's border band blends the two maps over the slice's last metre
      if (weight(p) < (d < depth - 1 ? 1 : 0.8)) out.push([i, j, +d.toFixed(1), +weight(p).toFixed(2)])
    }
    assert.ok(seen > 200, `${framing}: only ${seen} street points`)
    assert.deepEqual(out, [], `${framing}: street points under full near weight: ${JSON.stringify(out)}`)
  }
})

test('stop 10: the near texel stays under 3.1 mm on the desktop (the box\'s width sets it, the ground only adds height)', () => {
  const { cam } = stop10('desktop')
  const { texel } = nearBox(cam, HOUR)
  assert.ok(texel < 0.0031, `texel ${(texel * 1000).toFixed(2)} mm`)
})
