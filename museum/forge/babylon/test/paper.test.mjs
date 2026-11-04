// node --experimental-strip-types --test forge/babylon/test/*.test.mjs (the paper kit and feature 7's plate)
// The kit's modules are TypeScript with the bundler's extensionless imports, so a resolve hook tries `.ts` for them.
// PAPER_READOUTS=<folder> also reads the browser's own read-back of every step (paper-shoot.mjs) for overlaps.
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
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

const W = join(APP, 'src/wings')
const load = (p) => import(pathToFileURL(join(W, p)).href)
const tokens = await load('babylon/paper/tokens.ts')
const marks = await load('babylon/paper/marks.ts')
const figure = await load('babylon/paper/figure.ts')
const placer = await load('babylon/paper/placer.ts')
const counter = await load('babylon/paper/counter.ts')
const data = await load('babylon/measure/measure-data.ts')
const scene = await load('babylon/measure/measure-scene.ts')
const words = await load('babylon/measure/measure-words.ts')
const framing = await load('babylon/paper/framing.ts')

test('every meaning stroke keeps 3:1 on the paper, the main stroke 7:1, every text 4.5:1', () => {
  const S = tokens.shades()
  const ratio = (name) => tokens.contrast(S[name], S.paper)
  // the ink draws the four marks' lines and the hatch; the pencil draws our measures and their numbers
  assert.ok(ratio('ink') >= tokens.CONTRAST_FLOOR.main, `ink ${ratio('ink').toFixed(2)}`)
  assert.ok(ratio('pencil') >= tokens.CONTRAST_FLOOR.text, `pencil ${ratio('pencil').toFixed(2)}`)
  // the grain darkens the paper by its share at most: the pencil's numbers keep 4.5:1 there too (measured in the frames, not only on the token)
  const grained = tokens.contrast(S.pencil, S.grain)
  assert.ok(grained >= tokens.CONTRAST_FLOOR.text, `pencil on the grain ${grained.toFixed(2)}`)
  for (const [mark, style] of Object.entries(marks.MARKS)) {
    if (style.stroke === 0) continue
    const r = ratio(style.hand === 'ink' ? 'ink' : 'pencil')
    assert.ok(r >= tokens.CONTRAST_FLOOR.stroke, `${mark}: ${r.toFixed(2)}`)
  }
  // the two hands differ by more than hue: pencil is lighter than ink by a clear step
  assert.ok(ratio('ink') / ratio('pencil') > 2, 'ink and pencil read apart')
})

test('the four marks differ by pattern, not by hue alone', () => {
  const m = marks.MARKS
  const sig = (s) => `${s.stroke}|${s.dash ? 'dash' : 'plain'}|${s.fill}`
  const seen = new Set(Object.values(m).map(sig))
  assert.equal(seen.size, Object.keys(m).length)
  assert.ok(m.place.stroke > m.known.stroke * 2, 'in place is heavy')
  assert.equal(m.known.fill, 'none')
  assert.ok(m.guessed.dash && m.guessed.fill === 'hatch')
  assert.equal(m.unknown.stroke, 0)
  assert.equal(m.measure.hand, 'pencil')
})

test('the paper\'s two colours live in one place: no colour value in the feature or in the kit\'s other files', () => {
  const hex = /#[0-9a-fA-F]{3,8}\b|rgba?\(/
  for (const dir of ['babylon/paper', 'babylon/measure']) {
    for (const f of readdirSync(join(W, dir))) {
      if (f === 'tokens.ts' || !/\.(ts|css)$/.test(f)) continue
      const text = readFileSync(join(W, dir, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
      assert.ok(!hex.test(text), `${dir}/${f} holds a colour value`)
    }
  }
})

test('the pencil figure is the walk\'s own scale figure, form f2, at 1.70 m', () => {
  const r = spawnSync(process.execPath, ['--experimental-strip-types', '--no-warnings', '--input-type=module', '-e',
    `import { PERSON_FORMS } from ${JSON.stringify(pathToFileURL(join(W, 'place/person.ts')).href)}; console.log(JSON.stringify(PERSON_FORMS.f2))`], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  const f2 = JSON.parse(r.stdout.trim().split('\n').pop())
  for (const [k, v] of Object.entries(figure.FIGURE_FORM)) assert.equal(v, f2[k], `form ${k}`)
  assert.equal(figure.FIGURE_M, 1.7)
  // the stacks the readings hold (W2A's arithmetic): 39, 53, 54
  assert.deepEqual([figure.figuresFor(66), figure.figuresFor(90), figure.figuresFor(91.5)], [39, 53, 54])
})

test('the plate\'s stages are the walk\'s own build, the tablet at about 6 m a gar, about 90 m in all', () => {
  const plan = JSON.parse(readFileSync(join(W, 'babylon/map/map-plan.json'), 'utf8'))
  assert.deepEqual(data.TOWER.stages.map((s) => [s.side, s.h]), plan.tower.stages.map((s) => [s.side, s.h]))
  assert.equal(data.tabletHeight(), plan.tower.total)
  assert.equal(data.TOWER.base, plan.tower.stages[0].side)
  assert.deepEqual([data.BRICKS.mud, data.BRICKS.baked], [8.7, 30.2])
  assert.deepEqual([...data.BRICKS.walls], [12, 15])
  assert.equal(Math.round((data.BRICKS.mud + data.BRICKS.baked) * 10) / 10, 38.9)
})

test('a counted unit is repeated, never enlarged; a part is a part of one', () => {
  const g = counter.unitGrid(8.7, { x: 0, y: 0, size: 10, gap: 2, perRow: 5 })
  assert.equal(g.length, 9)
  assert.ok(g.every((u) => u.h === 10 && u.w <= 10))
  assert.ok(Math.abs(g[8].w - 7) < 1e-9)
  const pile = counter.unitGrid(30.2, { x: 0, y: 100, size: 10, gap: 2, perRow: 5, rise: true, cut: 'height' })
  assert.equal(pile.length, 31)
  assert.ok(Math.abs(pile[30].h - 2) < 1e-9 && pile[30].y + pile[30].h <= pile[25].y)
  assert.equal(counter.millions(8.7, 'de'), '8,7')
  assert.equal(counter.millions(30.2, 'en'), '30.2')
})

test('the placer puts nothing on anything else, and mirrors for a right-to-left page', () => {
  const taken = [{ l: 40, t: 40, r: 60, b: 60 }]
  const asks = [{ id: 'a', x: 60, y: 50, sides: ['right', 'left'], gap: 4, w: 30, h: 12 }, { id: 'b', x: 50, y: 40, sides: ['right', 'above'], gap: 4, w: 30, h: 12 }]
  const out = placer.placeLabels(asks, { taken, walls: [], bounds: { l: 0, t: 0, r: 200, b: 200 } })
  assert.equal(out[0].side, 'right')
  assert.equal(out[1].side, 'above')
  assert.deepEqual(placer.overlaps(out, taken, []), [])
  // the caller mirrors the drawing; the placer turns each side to its reading direction
  const rtl = placer.placeLabels(asks.slice(0, 1), { taken: [], walls: [], bounds: { l: 0, t: 0, r: 200, b: 200 }, mirror: true })
  assert.equal(rtl[0].side, 'left')
  // a label that fits nowhere is left off, never laid on top
  const none = placer.placeLabels([{ id: 'c', x: 50, y: 50, sides: ['on'], gap: 0, w: 30, h: 12 }], { taken, walls: [], bounds: { l: 0, t: 0, r: 200, b: 200 } })
  assert.equal(none[0].box, null)
})

/* every step's labels, in English and German, wide and upright, at sizes as the page's text sets them (an estimate here;
   the browser's own read-back is checked below when it is handed in) */
const FRAMES = { wide: [[1600, 690], [1440, 690]], upright: [[390, 498], [360, 380], [390, 330]] }
const PX = { wide: { ink: 15, pencil: 15, quiet: 15, count: 22, pair: 20 }, upright: { ink: 14, pencil: 14, quiet: 14, count: 18, pair: 17 } }
function textFor(lang, id, sc) {
  const L = words.MEASURE_WORDS[lang].labels
  const m = (n) => L.million(counter.millions(n, lang))
  return { base: L.base, about66: L.about66, about90: L.about90, figure: L.figure, count: String(sc.figures),
    mudPair: [m(data.BRICKS.mud), L.mud], bakedPair: [m(data.BRICKS.baked), L.baked], tower: L.tower, walls: L.walls, lo: '12', hi: '15' }[id]
}
const estimate = (text, px) => ({ w: Math.ceil(text.length * px * 0.56 + 8), h: Math.ceil(px * 1.15 + 2) })

test('every step\'s labels stand clear of the drawing and of each other (EN and DE, wide and upright)', () => {
  const left = []
  for (const lang of ['en', 'de']) for (const [framing, sizes] of Object.entries(FRAMES)) for (const [w, h] of sizes) for (let t = 0; t <= 5; t++) {
    const sc = scene.measureScene(t, framing, w, h)
    const asks = sc.anchors.map((a) => {
      const text = textFor(lang, a.id, sc)
      const size = Array.isArray(text)
        ? (() => { const a1 = estimate(text[0], PX[framing].pair), b1 = estimate(text[1], PX[framing].ink); return { w: Math.max(a1.w, b1.w), h: a1.h + b1.h } })()
        : estimate(text, PX[framing][a.kind] ?? 15)
      return { ...a, ...size }
    })
    const placed = placer.placeLabels(asks, { taken: sc.taken, walls: sc.walls, bounds: sc.bounds, clear: 3 })
    assert.deepEqual(placer.overlaps(placed, sc.taken, sc.walls, asks), [], `${lang} ${framing} ${w}x${h} step ${t}`)
    for (const p of placed) if (!p.box) left.push(`${lang} ${framing} ${w}x${h} step ${t}: ${p.id}`)
  }
  // every label stands at the sizes the visitor sees, the key's own included; a phone of 330 px of plate may drop the key's label
  const essential = left.filter((x) => !(/: figure$/.test(x) && /390x330/.test(x)))
  assert.deepEqual(essential, [], 'labels left off')
})

/* the drawing's own box per part: rects and lines exactly, paths by their absolute points */
function partBox(p) {
  if (p.type === 'rect') return { l: p.x, t: p.y, r: p.x + p.w, b: p.y + p.h }
  if (p.type === 'line') return { l: Math.min(p.ax, p.bx), t: Math.min(p.ay, p.by), r: Math.max(p.ax, p.bx), b: Math.max(p.ay, p.by) }
  const pts = [...p.d.matchAll(/[ML]\s*(-?\d+(?:\.\d+)?)[ ,](-?\d+(?:\.\d+)?)/g)].map((m) => [Number(m[1]), Number(m[2])])
  return pts.length ? { l: Math.min(...pts.map((q) => q[0])), t: Math.min(...pts.map((q) => q[1])), r: Math.max(...pts.map((q) => q[0])), b: Math.max(...pts.map((q) => q[1])) } : null
}

test('a narrow or tall plate draws upright, a wide one side by side', () => {
  assert.equal(framing.framingOf(1600, 711), 'wide')
  assert.equal(framing.framingOf(640, 300), 'wide')
  assert.equal(framing.framingOf(390, 473), 'upright')
  // a short phone's plate is wider than tall, and still too narrow to lay out side by side
  assert.equal(framing.framingOf(390, 265), 'upright')
  assert.equal(framing.framingOf(360, 241), 'upright')
})

test('every step\'s drawing stays on the plate, from a short phone to the desktop', () => {
  const off = []
  for (const [w, h] of [[1600, 711], [1440, 690], [1024, 560], [640, 300], [560, 300], [390, 473], [390, 445], [390, 293], [390, 265], [360, 241]]) {
    for (let t = 0; t <= 5; t += 0.25) {
      const sc = scene.measureScene(t, framing.framingOf(w, h), w, h)
      for (const p of sc.prims) {
        const b = partBox(p)
        if (b && (p.alpha ?? 1) > 0.05 && (b.l < -1 || b.t < -1 || b.r > w + 1 || b.b > h + 1)) off.push(`${w}x${h} t ${t}: ${p.id}`)
      }
    }
  }
  assert.deepEqual(off, [])
})

/* THE PLATE'S WORDS: numbers with their unit and single names, each on its own mark or line; nothing says how sure */
const ON_PLATE = new Set(['base', 'about66', 'about90', 'figure', 'count', 'mudPair', 'bakedPair', 'tower', 'walls', 'lo', 'hi'])
const QUALIFIER = /not known|unknown|nicht bekannt|unbekannt|one model|einem modell|reading|lesart|guess|vermut|maybe|perhaps|vielleicht/i
test('no qualifier on the plate: names and numbers only, each height on its own height line', () => {
  for (const lang of ['en', 'de']) {
    const L = words.MEASURE_WORDS[lang].labels
    assert.ok(!('notKnown' in L) && !('oneModel' in L), `${lang}: a qualifier is still a plate word`)
    for (const v of Object.values(L)) if (typeof v === 'string') assert.doesNotMatch(v, QUALIFIER, `${lang}: "${v}"`)
    for (const [framing, sizes] of Object.entries(FRAMES)) for (const [w, h] of sizes) for (let t = 0; t <= 5; t++) {
      const sc = scene.measureScene(t, framing, w, h)
      for (const a of sc.anchors) {
        assert.ok(ON_PLATE.has(a.id), `${lang} ${framing} ${w}x${h} step ${t}: ${a.id} is not a plate word`)
        const text = [textFor(lang, a.id, sc)].flat().join(' ')
        assert.doesNotMatch(text, QUALIFIER, `${lang} ${framing} ${w}x${h} step ${t}: "${text}"`)
        assert.ok(/\d/.test(text) || text.split(/\s+/).length <= 2, `${lang} "${text}" is neither a number nor a single name`)
      }
      // a height's label stands on its own height line
      for (const [id, line] of [['about66', 'h66'], ['about90', 'h90']]) {
        const a = sc.anchors.find((x) => x.id === id)
        if (!a) continue
        const ys = sc.prims.filter((p) => p.type === 'line' && p.id.startsWith(line) && (p.alpha ?? 1) > 0.5).map((p) => p.ay)
        assert.ok(ys.some((y) => Math.abs(y - a.y) <= 1), `${framing} ${w}x${h} step ${t}: ${id} is off its line`)
      }
    }
  }
})

test('the unknown height is drawn: an open, dashed top and no height line', () => {
  for (const [framing, sizes] of Object.entries(FRAMES)) for (const [w, h] of sizes) {
    const sc = scene.measureScene(0, framing, w, h)
    assert.ok(sc.open > 0.99, `${framing} ${w}x${h}: the top is not open`)
    const open = sc.prims.filter((p) => p.id.startsWith('open') && (p.alpha ?? 1) > 0.05)
    assert.ok(open.length >= 4 && open.every((p) => p.mark === 'guessed'), `${framing} ${w}x${h}: no dashed open top`)
    // the dashes rise and fade: the sides end in bare paper, no line closes them
    const ys = open.map((p) => Math.min(p.ay, p.by))
    assert.ok(Math.min(...ys) < sc.prims.find((p) => p.id === 'ground').ay, 'the dashes rise from the ground')
    assert.deepEqual(sc.prims.filter((p) => /^h(66|90)/.test(p.id) && (p.alpha ?? 1) > 0.05).map((p) => p.id), [], `${framing} ${w}x${h}: a height line at "not known"`)
    assert.ok(!sc.anchors.some((a) => a.id === 'about66' || a.id === 'about90'))
  }
  for (const [framing, [w, h]] of [['wide', [1600, 690]], ['upright', [390, 498]]]) {
    assert.ok(scene.measureScene(1, framing, w, h).open < 0.05, 'a reading closes the top')
    assert.ok(scene.measureScene(2, framing, w, h).open < 0.05)
  }
})

test('"39" and "53" show their figures at every size the plate draws, or leave with them', () => {
  const sizes = [...FRAMES.wide, ...FRAMES.upright, [390, 209], [360, 192], [1024, 560]]
  for (const dpr of [1, 2, 3]) for (const [w, h] of sizes) for (const t of [1, 2]) {
    const fr = framing.framingOf(w, h)
    const sc = scene.measureScene(t, fr, w, h, dpr)
    const stack = sc.prims.find((p) => p.id === 'stack')
    const count = sc.anchors.find((a) => a.id === 'count')
    const one = figure.stackFigure(sc.s, dpr)
    if (sc.stack) {
      assert.ok(stack && stack.d.length > 0 && count, `${w}x${h} @${dpr} step ${t}: the count stands without its figures`)
      // a figure is a figure: at least seven device pixels, widened and never heightened
      assert.ok(one.h * dpr >= figure.STACK_LEAST_H * 0.9 && one.h <= figure.FIGURE_M * sc.s + 1e-9, `${w}x${h} @${dpr}: ${one.h}`)
      assert.ok(one.w >= figure.FIGURE_FORM.shoulders * sc.s - 1e-9)
      // the figures stand one on another up to the reading: as many as the count says
      assert.equal((stack.d.match(/a/g) ?? []).length, 2 * sc.figures, `${w}x${h} step ${t}: heads`)
    } else {
      assert.ok(!stack && !count, `${w}x${h} @${dpr} step ${t}: the count stands, its figures left`)
      assert.ok(one === null)
    }
  }
  // the phone's plate at three device pixels keeps its figures, a raised sheet's smaller plate lets them go
  assert.ok(scene.measureScene(2, 'upright', 390, 330, 3).stack)
  assert.ok(!scene.measureScene(2, 'upright', 390, 209, 1).stack)
})

/* THE CHROME'S READ-BACK (paper-shoot.mjs, chrome per step): the frozen designs' checklists, measured in the page */
function readbacks() {
  const dir = process.env.PAPER_READOUTS
  return readdirSync(dir).filter((x) => x.startsWith('readout-measure-')).map((f) => ({ f, r: JSON.parse(readFileSync(join(dir, f), 'utf8')) }))
}
test('every step name stands under its own tick, at the frozen designs\' type size, none on another', { skip: !process.env.PAPER_READOUTS }, () => {
  let seen = 0
  for (const { f, r } of readbacks()) for (const [k, ro] of Object.entries(r.readouts ?? {})) {
    const seats = (ro.seats ?? []).filter((x) => x.box.r - x.box.l > 0)
    if (!seats.length) continue
    seen++
    for (const x of seats) {
      assert.ok(x.box.l + 4 <= x.tick && x.tick <= x.box.r - 4, `${f} ${k}: ${x.id} is not under its tick`)
      assert.ok(x.px >= 14, `${f} ${k}: ${x.id} at ${x.px} px`)
    }
    for (const a of seats) for (const b of seats) {
      if (a === b) continue
      if (a.row === b.row) assert.ok(a.box.r <= b.box.l + 0.5 || b.box.r <= a.box.l + 0.5, `${f} ${k}: ${a.id} meets ${b.id}`)
      // a second row's hairline rises past the first row: no first-row name stands in its way
      if (a.row === 0 && b.row === 1) assert.ok(b.tick < a.box.l || b.tick > a.box.r, `${f} ${k}: ${b.id}'s hairline crosses ${a.id}`)
    }
    // the order of the names is the order of the ticks
    const byTick = [...seats].sort((a, b) => a.tick - b.tick).map((x) => x.id)
    const byName = [...seats].sort((a, b) => (a.box.l + a.box.r) - (b.box.l + b.box.r)).map((x) => x.id)
    assert.deepEqual(byName, byTick, `${f} ${k}: names out of their ticks' order`)
  }
  assert.ok(seen > 0, 'no step names in the read-back')
})

test('the desktop band: the line in two rows at the 860 measure, a heavy 20-word German line too; one x, gold in its corner', { skip: !process.env.PAPER_READOUTS }, () => {
  let seen = 0
  for (const { f, r } of readbacks()) for (const [k, c] of Object.entries(r.chrome ?? {})) {
    if (c.form !== 'desk') continue
    seen++
    assert.ok(c.line.rows <= 2, `${f} ${k}: the line takes ${c.line.rows} rows`)
    assert.ok(c.line.words <= words.LINE_WORDS_MOST, `${f} ${k}: ${c.line.words} words`)
    // the proof is laid where the line stands; with the drawer open the line gives way to the words behind it
    assert.equal(c.proof.words, words.LINE_WORDS_MOST)
    if (c.line.rows > 0) assert.ok(c.proof.rows >= 1 && c.proof.rows <= 2, `${f} ${k}: a 20-word German line takes ${c.proof.rows} rows`)
    assert.equal(c.measure, 860)
    assert.ok(c.line.w <= 860, `${f} ${k}: the line runs ${c.line.w} px`)
    // one x; a right-to-left page keeps the walk's own 2 px for the step back's focus ring on its physical left
    assert.ok(Math.max(...c.wordsX) - Math.min(...c.wordsX) <= (c.dir === 'rtl' ? 2 : 0), `${f} ${k}: the words start at ${c.wordsX}`)
    // at rest gold holds the band's corner; an open drawer is the walk's own taller band, its ways at the top of their column
    if (c.line.rows > 0) assert.ok(c.gold.right < c.stage.w * 0.1 && c.gold.bottom < c.stage.h * 0.1, `${f} ${k}: gold is not in the corner`)
    else assert.ok(c.gold.right < c.stage.w * 0.1 && c.gold.y + c.gold.h <= c.stage.h, `${f} ${k}: gold is off its column`)
    assert.ok(c.band.y >= c.plate.y + c.plate.h - 1, `${f} ${k}: the band stands on the picture`)
  }
  assert.ok(seen > 0, 'no desktop chrome in the read-back')
})

test('the phone sheet: three seats in the foot row, every control centre in the thumb\'s reach, the line alone at the lowest height', { skip: !process.env.PAPER_READOUTS }, () => {
  let seen = 0
  for (const { f, r } of readbacks()) for (const [k, c] of Object.entries(r.chrome ?? {})) {
    if (c.form !== 'phone') continue
    seen++
    assert.equal(c.seats.length, 3, `${f} ${k}: seats`)
    const foot = c.seats.map((x) => x.cy)
    assert.ok(Math.max(...foot) - Math.min(...foot) <= 2, `${f} ${k}: the seats are not one row`)
    for (const x of c.controls) assert.ok(x.cy >= c.reach, `${f} ${k}: ${x.what} "${x.text}" at ${x.cy}, above the reach ${c.reach}`)
    assert.ok(c.topmost >= c.reach)
    // at the lowest height the steps are not shown: the line is the sheet's one text
    if (!c.sheet.raised) assert.ok(!c.controls.some((x) => /paper-(name|slider|play)/.test(x.what)), `${f} ${k}: the steps show at the lowest height`)
    else assert.ok(c.controls.some((x) => /paper-name/.test(x.what)), `${f} ${k}: the next height shows no steps`)
    assert.ok(c.plate.y + c.plate.h <= c.sheet.y + 1, `${f} ${k}: the plate runs under the sheet`)
  }
  assert.ok(seen > 0, 'no phone chrome in the read-back')
})

test('no frame carries the harness\'s marker', { skip: !process.env.PAPER_READOUTS }, () => {
  let seen = 0
  for (const { f, r } of readbacks()) for (const [k, m] of Object.entries(r.marked ?? {})) { seen++; assert.equal(m, false, `${f} ${k}`) }
  assert.ok(seen > 0, 'no frame marks in the read-back')
})

test('the browser\'s own read-back: no label on anything, at every step shot', { skip: !process.env.PAPER_READOUTS }, () => {
  const dir = process.env.PAPER_READOUTS
  let steps = 0
  for (const f of readdirSync(dir).filter((x) => x.startsWith('readout-measure-'))) {
    const r = JSON.parse(readFileSync(join(dir, f), 'utf8'))
    for (const [k, ro] of Object.entries(r.readouts ?? {})) { steps++; assert.deepEqual(ro.overlaps, [], `${f} ${k}`) }
  }
  assert.ok(steps > 0, 'no read-back in the folder')
})

test('the words: names and numbers on the plate, no dash, no semicolon, every band line a DRAFT placeholder', () => {
  const bad = /[–—;]/
  for (const lang of ['en', 'de']) {
    const L = words.MEASURE_WORDS[lang]
    const shown = [...Object.values(L.steps), ...Object.values(L.labels).filter((v) => typeof v === 'string'), L.labels.million('8.7'),
      L.ui.play, L.ui.pause, L.ui.track, L.ui.close, L.ui.door, L.ui.title, ...Object.values(L.band),
      L.list.base, L.list.core, L.list.notKnown, L.list.stages, L.list.height('x'), L.list.figures(39), L.list.bricks('a', 'b'), L.list.walls(12, 15)]
    for (const s of shown) assert.ok(!bad.test(s), `${lang}: "${s}"`)
    for (const s of [...Object.values(L.steps), ...Object.values(L.labels).filter((v) => typeof v === 'string')]) assert.ok(s.split(/\s+/).length <= 3, `${lang} label "${s}" is more than a name`)
    for (const [k, s] of Object.entries(L.band)) assert.ok(s.startsWith('DRAFT'), `${lang} band ${k} is not marked DRAFT`)
    for (const s of [L.ui.door, L.ui.title, L.ui.close]) assert.ok(s.startsWith('DRAFT'))
    // a band line stands in two rows of the band: twenty words at most, DRAFT included
    for (const [k, s] of Object.entries(L.band)) assert.ok(s.split(/\s+/).filter((x) => x && x !== '·').length <= words.LINE_WORDS_MOST, `${lang} band ${k}`)
    // six steps, told apart by name, each name a few words
    assert.equal(new Set(Object.values(L.steps)).size, words.STEP_IDS.length, `${lang}: two steps share a name`)
    assert.ok(!/learn more|mehr erfahren/i.test(L.ui.door), 'the door names what it shows')
  }
  // the step names and the band's lines are DRAFT words, listed so in the words file
  for (const k of ['steps', 'band', 'ui.title', 'ui.close']) assert.ok(words.DRAFT_WORDS.includes(k), `${k} is not marked DRAFT`)
  // the band's facts carry what the targets ask, word for word where they quote
  const en = words.BAND_KEYS
  assert.match(en['not-known'].carries, /not known/)
  assert.match(en.bricks.carries, /one model/)
  assert.doesNotMatch(Object.values(en).map((x) => x.carries).join(' '), /were used|between 66 and 90|91\.5|too low/)
})

test('the ink still turns a frame to ink in the kit\'s two colours', { skip: !existsSync('/opt/homebrew/Caskroom/miniforge/base/bin/python3') }, () => {
  const r = spawnSync('/opt/homebrew/Caskroom/miniforge/base/bin/python3', ['-I', join(APP, 'forge/babylon/ink-still.py'), '--self-test'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /self-test: ok/)
})
