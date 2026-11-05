// node --experimental-strip-types --test forge/babylon/test/*.test.mjs (feature 6: the city's name pressed in clay)
// The feature's modules use the bundler's extensionless imports, so a resolve hook tries `.ts` for them.
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
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

const C = join(APP, 'src/wings/babylon/clay')
const load = (p) => import(pathToFileURL(join(C, p)).href)
const data = await load('clay-data.ts')
const press = await load('clay-press.ts')
const { signProblems, wedgeTris } = await import(pathToFileURL(join(APP, 'src/wings/babylon/objects/inscription.ts')).href)
const file = JSON.parse(readFileSync(join(C, 'clay-signs.json'), 'utf8'))
const placed = data.layout(file)
const all = data.presses(placed)

// THE WEDGES OF EACH SIGN AS AM's "Bab. mod." COLUMN DRAWS THEM, counted on the page (No 222, 11, 217, 250):
// KÁ two heads left, a Winkelhaken between them, a vertical, two heads right and the right vertical; AN two heads in a
// row and a vertical; RA three heads, the middle one short, two verticals; KI the Winkelhaken, two heads, two short
// verticals, two slant wedges, the vertical
const COUNTS = { KA2: 7, AN: 3, RA: 5, KI: 8 }

test('the four signs stand in the edition\'s order with their readings, codes and pages', () => {
  assert.deepEqual(file.signs.map((s) => s.sign), [...data.EDITION])
  assert.deepEqual(file.signs.map((s) => s.reading), [...data.READINGS])
  assert.deepEqual(file.signs.map((s) => s.code), ['U+1218D', 'U+1202D', 'U+1228F', 'U+121A0'])
  assert.deepEqual(file.signs.map((s) => s.am), [222, 11, 217, 250])
  for (const s of file.signs) {
    assert.equal(s.leaf - s.page, 22, `${s.sign}: the 1902 scan's leaf is its page plus 22`)
    assert.match(s.from, /Bab(yl)?\. mod\./, `${s.sign} names the column`)
  }
  assert.equal(file.signs.filter((s) => s.silent).map((s) => s.sign).join(), 'KI', 'only KI is the silent marker')
})

test('every wedge of each sign is present, as many as its copy draws, and each is a sound wedge', () => {
  for (const s of file.signs) {
    assert.equal(s.w.length, COUNTS[s.sign], `${s.sign}: ${s.w.length} wedges against the copy's ${COUNTS[s.sign]}`)
    for (const [x, y, a, len, wid, kind] of s.w) {
      assert.ok([x, y, a, len, wid].every(Number.isFinite) && len > 0 && wid > 0, `${s.sign}: [${x}, ${y}, ${a}, ${len}, ${wid}]`)
      assert.ok(kind === undefined || kind === 'w' || kind === 'l', `${s.sign}: kind ${kind}`)
    }
  }
  assert.equal(all.length, 23)
  assert.deepEqual(signProblems(data.asInscription(file, placed)), [])
})

test('the name reads in one line on the tablet, left to right, no sign on another', () => {
  const [W, H] = [data.TABLET.size[0] * 1000, data.TABLET.size[2] * 1000]
  for (const p of placed) {
    assert.ok(p.box.u0 > 4 && p.box.u1 < W - 4 && p.box.v0 > 4 && p.box.v1 < H - 4, `${p.sign.reading} off the face`)
  }
  for (let i = 1; i < placed.length; i++) assert.ok(placed[i].box.u0 >= placed[i - 1].box.u1 + 1, `sign ${i} runs into sign ${i - 1}`)
  // one stylus: every sign's middle head comes out at the stylus's width
  for (const p of placed) assert.ok(Math.abs(data.copyHead(p.sign) * p.scale - data.LINE.head) < 1e-9)
})

test('no sign is given a meaning: no gate and no god in the file or the feature\'s words', () => {
  const said = JSON.stringify({ ...file, signs: file.signs.map(({ w, ...rest }) => rest) })
  assert.doesNotMatch(said, /\b(gate|god|gods|Tor|Gott|Götter)\b/i)
})

test('each press adds exactly one wedge, in order, and a press sinks only its own wedge', () => {
  const f = press.pressField(all, data.LINE.depth, 0.1)
  const deep = all.map((w) => press.deepPoint(w, data.LINE.depth))
  const cut = () => deep.map((p) => f.depthAt(p.u, p.v))
  assert.deepEqual(cut().map((d) => d > 0.05), all.map(() => false), 'fresh clay has no pit')
  for (let k = 1; k <= all.length; k++) {
    f.set(k, 0)
    const d = cut()
    // the wedges pressed are as deep as their cut (a softened tip loses a little), the rest are untouched
    d.forEach((v, j) => {
      if (j < k) assert.ok(v > deep[j].d * 0.5, `press ${k}: wedge ${j} only ${v.toFixed(3)} of ${deep[j].d.toFixed(3)} mm`)
      else assert.ok(v < 0.05, `press ${k}: wedge ${j} already ${v.toFixed(3)} mm`)
    })
  }
  // half-way through a press, only the sinking wedge stands between nothing and its depth
  f.set(4, 0.5)
  const half = cut()
  assert.ok(half[4] > 0.05 && half[4] < deep[4].d * 0.9, `the sinking wedge at ${half[4].toFixed(3)}`)
  assert.ok(half[5] < 0.05)
  // back: the clay smoothed and laid anew
  f.set(2, 0)
  assert.deepEqual(cut().map((v) => v > 0.05), all.map((_, j) => j < 2))
})

test('the clay pushed aside stands as a slight lip, never a ridge', () => {
  const f = press.pressField(all, data.LINE.depth, 0.1)
  f.set(all.length, 0)
  let lip = 0, pit = 0
  for (const h of f.height) { lip = Math.max(lip, h); pit = Math.min(pit, h) }
  assert.ok(lip > 0.01, `lip ${lip.toFixed(3)} mm`)
  assert.ok(lip < -pit * 0.15, `lip ${lip.toFixed(3)} mm against a pit of ${(-pit).toFixed(3)} mm`)
})

test('the signs finish at their last wedge and the four readings come in order', () => {
  const ends = []
  for (let k = 1; k <= all.length; k++) { const f = data.finished(k, all); if (f.just !== null) ends.push([k, data.READINGS[f.just]]) }
  assert.deepEqual(ends, [[7, 'KÁ'], [10, 'DINGIR'], [15, 'RA'], [23, 'KI']])
  assert.equal(data.finished(23, all).all, true)
  assert.equal(data.finished(22, all).all, false)
  // every wedge's tetrahedron is a real cut on the face
  for (const w of all) assert.ok(wedgeTris(w, data.LINE.depth).every((t) => t.d > 0))
})

test('nothing in the feature glows: no emissive colour and no additive light in its code', () => {
  for (const name of readdirSync(C).filter((n) => /\.(ts|css)$/.test(n))) {
    const text = readFileSync(join(C, name), 'utf8')
    assert.doesNotMatch(text, /emissive|AdditiveBlending|bloom|glow\s*\(|text-shadow|box-shadow:\s*0 0/i, name)
  }
})

test('the run\'s clock counts wedges: a press plays to the next wedge and lands one more, back takes one out', () => {
  const total = all.length, P = data.period(total)
  assert.equal(P, total + data.PACE.hold)
  let clock = 0
  for (let k = 0; k < total; k++) {
    assert.equal(data.pressState(clock, total).done, k)
    const p = data.pressFrom(clock, total)
    assert.ok(p && p.from === clock && p.stop > clock && p.stop < clock + 1, `press ${k}`)
    // half-way to the stop only the one wedge is sinking
    const mid = data.pressState((p.from + p.stop) / 2, total)
    assert.equal(mid.done, k); assert.ok(mid.sink > 0 && mid.sink < 1)
    assert.equal(data.pressState(p.stop, total).done, k + 1)
    clock = p.land
  }
  assert.equal(data.pressFrom(clock, total), null, 'nothing presses past the whole name')
  assert.equal(data.backFrom(clock, total), total - 1)
  assert.equal(data.backFrom(5.2, total), 5, 'a wedge partly in is the one taken out')
  assert.equal(data.backFrom(0, total), 0)
})
