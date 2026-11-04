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
  return { base: L.base, notKnown: L.notKnown, about66: L.about66, about90: L.about90, figure: L.figure, count: String(sc.figures), oneModel: L.oneModel,
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
  // the readings and the counts must stand at the sizes the visitor sees; a phone of 330 px of plate may drop the key's own label
  const essential = left.filter((x) => !/: figure$/.test(x) && !/390x330/.test(x))
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
    assert.ok(!/learn more|mehr erfahren/i.test(L.ui.door), 'the door names what it shows')
  }
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
