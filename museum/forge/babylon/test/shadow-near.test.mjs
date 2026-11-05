// The sun's near shadow map (open/light.ts): fitted to the frame's first metres, so at stop 7's eye-level hold its texel
// is millimetres where the far map's is centimetres, and its box holds House VI's court and the parapets that shade it.
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
const mp = JSON.parse(readFileSync(join(W, 'map/map-plan.json'), 'utf8'))
const hp = JSON.parse(readFileSync(join(W, 'house/house-plan.json'), 'utf8'))
const { E0, N0 } = mp.frame
const D2R = Math.PI / 180

/** stop 7's still camera at desktop 1600x900, as map.ts aims it */
function stop7() {
  const k = cams.path.find((x) => x.stop === 7 && x.still)
  const cam = new PerspectiveCamera(2 * Math.atan(Math.tan((k.hfov / 2) * D2R) * (900 / 1600)) / D2R, 1600 / 900, 0.3, 60000)
  cam.position.set(k.at[0] - E0, k.y, N0 - k.at[1])
  cam.up.set(0, 1, 0)
  cam.lookAt(new Vector3(k.look[0] - E0, k.look[2], N0 - k.look[1]))
  cam.updateProjectionMatrix()
  cam.updateMatrixWorld(true)
  return { cam, k }
}
/** the near box as walkLight fits it (the default slice depth), its sides in metres */
function nearBox(cam, hour) {
  const sun = new Vector3(...S.sunVector(S.hourOf(hour))).normalize()
  const h = Math.max(2, cam.position.y - 5), reach = Math.min(4200, 260 + h * 9)
  const pts = L.nearSlice(cam, L.nearDepthOf(h, reach))
  const centre = pts.reduce((a, p) => a.add(p), new Vector3()).multiplyScalar(1 / pts.length)
  const lc = new OrthographicCamera()
  return { box: L.sunBox(lc, pts, centre, sun, 0.02, 0.5), lc, sun }
}

test('at stop 7 the near box is under 60 m a side and its texel under 6 mm (the far map\'s is 36 mm)', () => {
  const { cam, k } = stop7()
  const { box } = nearBox(cam, k.hour)
  const w = box.x1 - box.x0, h = box.y1 - box.y0
  assert.ok(w < 60 && h < 60, `box ${w.toFixed(1)} x ${h.toFixed(1)} m`)
  assert.ok(Math.max(w, h) / 8192 < 0.006, `texel ${(Math.max(w, h) / 8192 * 1000).toFixed(2)} mm`)
})

test('the near box holds every point of House VI\'s court walls the frame sees, from the floor to the caps\' crown', () => {
  const { cam, k } = stop7()
  const { box, lc } = nearBox(cam, k.hour)
  const b = hp.frame.bearing * D2R, A = [Math.sin(b), -Math.cos(b)], C = [Math.sin(b + Math.PI / 2), -Math.cos(b + Math.PI / 2)]
  const O = [hp.frame.origin[0] - E0, N0 - hp.frame.origin[1]], ct = hp.courts[0]
  const at = (u, v, y) => new Vector3(O[0] + A[0] * u + C[0] * v, y, O[1] + A[1] * u + C[1] * v)
  const out = []
  let seen = 0
  for (let s = 0; s <= 26; s++) for (let y = hp.levels.floor; y <= hp.levels.top + hp.build.cap.rise + 1e-9; y += 0.25) {
    const t = ct.u[0] + ((ct.u[1] - ct.u[0]) * s) / 26
    for (const p of [at(ct.u[0], t, y), at(ct.u[1], t, y), at(t, ct.v[0], y), at(t, ct.v[1], y)]) {
      const c = p.clone().project(cam)
      if (Math.abs(c.x) > 1 || Math.abs(c.y) > 1 || c.z < -1 || c.z > 1) continue
      seen++
      const q = p.applyMatrix4(lc.matrixWorldInverse)
      if (q.x < box.x0 || q.x > box.x1 || q.y < box.y0 || q.y > box.y1) out.push([+t.toFixed(2), +y.toFixed(2)])
    }
  }
  assert.ok(seen > 100, `only ${seen} wall points in the frame`)
  assert.deepEqual(out, [])
})

test('the slice grows with the camera\'s height and never passes the far map\'s reach', () => {
  assert.equal(L.nearDepthOf(2, 278), 36)
  assert.ok(L.nearDepthOf(80, 980) > L.nearDepthOf(20, 440))
  assert.equal(L.nearDepthOf(1000, 4200), 4200)
})
