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

/* ---- THE PAPER STEPS: letters to signs, a student's steps (clay-paper.ts) ---- */
const paper = await load('clay-paper.ts')
const words = await load('clay-words.ts')
const placer = await import(pathToFileURL(join(APP, 'src/wings/babylon/paper/placer.ts')).href)
const PAPER_FRAMES = { wide: [[1600, 690], [1440, 690]], upright: [[390, 498], [360, 380], [390, 330]] }
const PAPER_PX = { wide: { ink: 15, pencil: 15, quiet: 15, count: 22, big: 18 }, upright: { ink: 14, pencil: 14, quiet: 14, count: 18, big: 16 } }
const sayOf = (lang, say) => {
  const L = words.CLAY_WORDS[lang]
  return say.what === 'letter' ? L.name[say.i] : say.what === 'reading' ? L.readings[say.i] : say.what === 'step' ? L.labels.steps[say.step]
    : say.what === 'ruler' ? L.labels.ruler : say.what === 'later' ? L.labels.later : L.labels.credit
}
const guess = (text, px) => ({ w: Math.ceil(text.length * px * 0.56 + 8), h: Math.ceil(px * 1.15 + 2) })
const eachPaper = (fn) => {
  for (const lang of ['en', 'de']) for (const [framing, sizes] of Object.entries(PAPER_FRAMES)) for (const [w, h] of sizes)
    for (const t of [1, 1.5, 2, 2.5, 3, 4]) fn({ lang, framing, w, h, t, sc: paper.clayPaperScene(t, framing, w, h, file, words.CLAY_WORDS[lang].name.length) })
}

test('letters to signs: seven pencil boxes, then four signs in ink with their readings in order', () => {
  for (const lang of ['en', 'de']) {
    assert.equal(words.CLAY_WORDS[lang].name.length, 7, `${lang}: the name's letters`)
    for (const [framing, sizes] of Object.entries(PAPER_FRAMES)) for (const [w, h] of sizes) {
      const one = paper.clayPaperScene(1, framing, w, h, file), two = paper.clayPaperScene(2, framing, w, h, file)
      assert.equal(one.letters, 7); assert.equal(one.signs, 0)
      assert.deepEqual(one.anchors.map((a) => sayOf(lang, a.say)).join(''), 'BABYLON')
      assert.equal(two.cells, 4); assert.equal(two.signs, 4); assert.equal(two.letters, 7)
      assert.deepEqual(two.anchors.filter((a) => a.say.what === 'reading').map((a) => sayOf(lang, a.say)), ['KÁ', 'DINGIR', 'RA', 'KI'])
      // the signs in fine ink, the boxes our pencil: the grammar's Known and the measure
      assert.ok(two.prims.filter((p) => /^sign\d$/.test(p.id)).every((p) => p.mark === 'known'))
      assert.ok(two.prims.filter((p) => /^cell\d$/.test(p.id) || p.id === 'fold').every((p) => p.mark === 'measure'))
      // every wedge of each sign drawn: a head, and a tail where the wedge is longer than its head
      for (let j = 0; j < 4; j++) {
        const d = two.prims.find((p) => p.id === `sign${j}`).d
        const tris = all.filter((p) => p.signIndex === j).reduce((s, p) => s + wedgeTris(p, 0.5).length, 0)
        assert.equal((d.match(/Z/g) ?? []).length, tris, `sign ${j}: its wedges' outlines`)
      }
    }
  }
})

test('the fold closes its walls onto the four cells, never onto a letter\'s edge: no letter is drawn as a sign\'s', () => {
  const to = paper.foldTo(7, 4)
  assert.deepEqual(to, [0.25, 0.25, 0.5, 0.5, 0.75, 0.75])
  for (const x of to) for (let i = 1; i < 7; i++) assert.ok(Math.abs(x - i / 7) > 0.02, `a wall closes on letter edge ${i}`)
  const mid = paper.clayPaperScene(1.5, 'wide', 1600, 690, file)
  assert.equal(mid.prims.filter((p) => /^wall\d$/.test(p.id)).length, 6)
  assert.equal(mid.anchors.filter((a) => a.say.what === 'reading').length, 0, 'a reading before its sign is inked')
})

test('every paper step\'s labels stand clear of the drawing and of each other, none left off (EN and DE, wide and upright)', () => {
  const left = []
  eachPaper(({ lang, framing, w, h, t, sc }) => {
    const asks = sc.anchors.map((a) => ({ ...a, ...guess(sayOf(lang, a.say), PAPER_PX[framing][a.kind]) }))
    const placed = placer.placeLabels(asks, { taken: sc.taken, walls: sc.walls, bounds: sc.bounds, clear: 3 })
    assert.deepEqual(placer.overlaps(placed, sc.taken, sc.walls, asks), [], `${lang} ${framing} ${w}x${h} at ${t}`)
    for (const p of placed) if (!p.box) left.push(`${lang} ${framing} ${w}x${h} at ${t}: ${p.id}`)
  })
  assert.deepEqual(left, [], 'labels left off')
})

test('every paper part stays on its plate', () => {
  eachPaper(({ framing, w, h, t, sc }) => {
    for (const p of sc.prims) {
      const pts = p.type === 'rect' ? [[p.x, p.y], [p.x + p.w, p.y + p.h]] : p.type === 'line' ? [[p.ax, p.ay], [p.bx, p.by]]
        : [...p.d.matchAll(/[MLC]\s*(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])])
      for (const [x, y] of pts) assert.ok(x >= 0 && x <= w && y >= 0 && y <= h, `${framing} ${w}x${h} at ${t}: ${p.id} off the plate (${x}, ${y})`)
    }
    if (sc.photo) for (const k of ['l', 'r']) assert.ok(sc.photo.clip[k] >= 0 && sc.photo.clip[k] <= w)
  })
})

test('a student\'s steps: five dashed tablets of one unit, the one real tablet solid at true size against the 10 cm ruler', () => {
  for (const [framing, sizes] of Object.entries(PAPER_FRAMES)) for (const [w, h] of sizes) {
    const sc = paper.clayPaperScene(3, framing, w, h, file)
    const tabs = sc.prims.filter((p) => p.id.startsWith('tablet-'))
    assert.equal(tabs.length, 5); assert.equal(sc.tablets, 5)
    assert.ok(tabs.every((p) => p.mark === 'guessed'), 'a step drawn as known')
    assert.equal(new Set(tabs.map((p) => p.d.replace(/-?\d+(\.\d+)?/g, '#'))).size, 1, 'one unit')
    assert.equal(sc.prims.find((p) => p.id === 'photo-frame').mark, 'known')
    // the photo's tablet, 707 px of the photo across for 9.9 cm, at the ruler's own scale
    const [x0, , x1] = data.MET_TABLET.extent
    const s = sc.photo.w / data.MET_TABLET.px[0]
    assert.ok(Math.abs((x1 - x0) * s / sc.pxPerCm - 9.9) < 0.01, `${framing} ${w}x${h}: the tablet is not 9.9 cm on the ruler's scale`)
    const ruler = sc.taken.find((b) => b.id === 'ruler')
    assert.ok(Math.abs((ruler.r - ruler.l) - 10 * sc.pxPerCm) < 0.01)
    assert.ok(sc.pxPerCm >= 6, `${framing} ${w}x${h}: ${sc.pxPerCm} px a cm`)
  }
})

test('the words: no meaning for a sign, students never children, and every band line at the close look\'s length', () => {
  for (const lang of ['en', 'de']) {
    const L = words.CLAY_WORDS[lang]
    const text = JSON.stringify(L)
    assert.ok(!/\b(gate|gates|god|gods|Tor|Tore|Gott|Götter|children|Kinder|alphabet of)\b/i.test(text.replace(/In our alphabet|In unserem Alphabet/g, '')), `${lang}: a forbidden word`)
    for (const [key, line] of Object.entries(L.band)) {
      assert.ok(line.startsWith('DRAFT'), `${lang} ${key}: not marked DRAFT`)
      const shown = line.replace(/^DRAFT · /, '')
      assert.ok(shown.split(/\s+/).length <= words.LINE_WORDS_MOST, `${lang} ${key}: over ${words.LINE_WORDS_MOST} words`)
      for (const s of shown.split(/(?<=[.!?])\s+/)) assert.ok(s.split(/\s+/).length <= words.SENTENCE_WORDS_MOST, `${lang} ${key}: "${s}"`)
      assert.ok(line.length <= 110, `${lang} ${key}: ${line.length} characters`)
      assert.ok(!/[–—;]/.test(shown), `${lang} ${key}: a dash or a semicolon`)
    }
    assert.deepEqual(Object.keys(L.steps), [...words.STEP_IDS])
    assert.equal(new Set(Object.values(L.steps)).size, words.STEP_IDS.length)
  }
  assert.deepEqual(Object.keys(words.BAND_KEYS).sort(), Object.keys(words.CLAY_WORDS.en.band).sort())
})
