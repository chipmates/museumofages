// Feature 11, the evening sky and the watcher's tablet (stop 13, the bridge). Pure checks on the computation, the
// edition's numbers, the scene and the words; PAPER_READOUTS=<folder> also reads the browser's own read-back
// (paper-shoot.mjs --page sky) and the stage's (sky-heaps-shoot.mjs, its sidecars in the same folder when present).
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
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

const B = join(APP, 'src/wings/babylon')
const load = (p) => import(pathToFileURL(join(B, p)).href)
const kit = await load('paper/scene.ts')
const figure = await load('paper/figure.ts')
const data = await load('sky/sky-data.ts')
const scene = await load('sky/sky-scene.ts')
const words = await load('sky/sky-words.ts')
const skies = { '0414': JSON.parse(readFileSync(join(B, 'sky/sky-0414.json'), 'utf8')), '0415': JSON.parse(readFileSync(join(B, 'crescent/sky-570.json'), 'utf8')) }
const evenings = data.EVENING_IDS.map((id) => data.eveningOf(id, skies[id]))

const LANGS = ['en', 'de']
const SIZES = { wide: [[1600, 648], [1440, 648]], upright: [[390, 605], [390, 425], [360, 391], [360, 350]] }
const at = (t, framing, w, h) => scene.skyScene(t, framing, w, h, { inset: kit.insetFor(framing, 0), data: { evenings } })
const every = (fn) => { for (const [framing, list] of Object.entries(SIZES)) for (const [w, h] of list) for (let s = 0; s < 3; s++) fn(at(s, framing, w, h), framing, w, h, s) }
const shown = (lang) => {
  const W = words.SKY_WORDS[lang]
  return [W.ui.title, W.ui.door, W.ui.close, ...Object.values(W.band), ...Object.values(W.list).flat()]
}
const sentences = (s) => s.replace(/^DRAFT ?·? ?/, '').split(/(?<=[.!?])\s+/).filter(Boolean)

test('the two evenings are the computation\'s, rounded as printed (P2)', () => {
  const [a, b] = evenings
  assert.deepEqual(data.printed(a), { height: 6.4, lit: 0.7, lag: 36 })
  assert.deepEqual(data.printed(b), { height: 19.1, lit: 3.7, lag: 99 })
  assert.equal(a.cls, 'D'); assert.equal(b.cls, 'A')
  assert.match(skies['0414'].about, /14 April 570 BC/)
  assert.match(skies['0415'].about, /15 April 570 BC/)
  // the 15 April numbers as the stop's research holds them (TARGETS-W2B 13.3.2): due west, the Sun at 279
  assert.ok(Math.abs(b.moon.az - 270) < 0.5 && Math.abs(b.sun.az - 279) < 0.5, `${b.moon.az} ${b.sun.az}`)
  // the Moon is never drawn before sunset: every evening is read at its own sunset second
  for (const e of evenings) assert.ok(Math.abs(e.sun.el + 0.83) < 0.01, `${e.id} sun ${e.sun.el}`)
})

test('the plate draws each Moon at its computed height within half a degree, the Sun under the horizon (P2)', () => {
  every((S, framing, w, h, s) => {
    if (s !== 0) return
    assert.equal(S.facts.panels.length, 2)
    S.facts.panels.forEach((p, i) => {
      assert.ok(Math.abs(p.drawnHeight - evenings[i].moon.el) < 0.5, `${framing} ${w}x${h} ${p.id}: ${p.drawnHeight}`)
      assert.ok(p.drawnSunEl < 0, `${p.id} sun above the horizon`)
      // the drawn disc's lit part is the phase: its width at the middle r (1 + cos i)
      assert.ok(Math.abs(p.disc.litWidth / p.disc.r - (1 + Math.cos(evenings[i].moon.sto * Math.PI / 180))) < 1e-9)
    })
    // one scale for the two evenings
    assert.equal(S.facts.panels[0].k, S.facts.panels[1].k)
  })
})

test('every sky number the words carry is the computation\'s (P2)', () => {
  for (const lang of LANGS) {
    const L = words.SKY_WORDS[lang].list.evenings.join(' ')
    for (const e of evenings) {
      const p = data.printed(e)
      for (const n of [`${words.num(lang, p.height)}°`, `${words.num(lang, p.lit)}\u00a0%`, ` ${p.lag} `]) assert.ok(L.includes(n), `${lang} ${e.id}: ${n}`)
    }
  }
})

test('the heaps hold the edition\'s litres within 2 percent; the lump weighs one shekel (P3)', () => {
  const want = { barley: 180, dates: 240, sesame: 24 }
  for (const h of data.heaps()) assert.ok(Math.abs(h.litres / want[h.id] - 1) < 0.02, `${h.id} ${h.litres}`)
  for (const g of data.GOOD_IDS) assert.equal(data.litresOf(g), want[g])
  const core = data.datesCore()
  const coreL = data.profileVolume(data.heapProfile(core.R)) * 1000
  assert.ok(Math.abs((coreL + core.shell) / 240 - 1) < 0.02, `dates ${coreL} + ${core.shell}`)
  assert.ok(Math.abs(data.silverVolumeCm3() * data.SILVER_DENSITY / 8.33 - 1) < 1e-9)
  assert.ok(Math.abs(data.riseM() - 1.65) < 1e-9)
})

test('the stage\'s pictures are drawn at the sizes the plate expects, and the figure is the paper\'s (P3, P4)', () => {
  const shooter = readFileSync(join(APP, 'forge/babylon/sky-heaps-shoot.mjs'), 'utf8')
  for (const [k, v] of Object.entries(scene.HEAPS_PICTURE)) {
    assert.ok(shooter.includes(`${k}: [${v.w}, ${v.h}]`), `${k} size`)
    assert.ok(Math.abs(v.w / v.h - data.HEAPS_PLAN.views[k].aspect) < 1e-9, `${k} aspect`)
  }
  assert.equal(data.FIGURE_HEIGHT, figure.FIGURE_M)
})

test('the rise and the figure stand on one scale (P4)', () => {
  every((S, framing, w, h, s) => {
    if (s !== 2) return
    const r = S.facts.rise
    assert.ok(Math.abs(r.drawn / 1.65 - 1) < 0.01, `${framing} ${w}x${h}: ${r.drawn}`)
    assert.equal(r.fill, 1)
  })
})

test('every part of every step stays on the plate, at every size', () => {
  every((S, framing, w, h, s) => {
    for (const p of S.prims) {
      const b = p.type === 'image' ? (p.clip ?? kit.primBox(p)) : kit.primBox(p)
      if (!b) continue
      assert.ok(b.l >= -0.5 && b.t >= -0.5 && b.r <= w + 0.5 && b.b <= h + 0.5, `${framing} ${w}x${h} step ${s}: ${p.id} off the plate`)
    }
  })
})

test('the plate carries numbers with their units and single names, no qualifier (P8)', () => {
  const QUAL = /\b(about|circa|ca\.|etwa|rund|guess|vermutet|perhaps|vielleicht|probably|wohl)\b|\?/i
  for (const lang of LANGS) {
    const ids = new Set()
    every((S) => { for (const a of S.anchors) ids.add(a.id) })
    for (const id of ids) {
      if (id === 'credit') continue
      const v = words.skyText(lang, evenings, id)
      for (const s of typeof v === 'string' ? [v] : v) assert.ok(!QUAL.test(s), `${lang} ${id}: ${s}`)
    }
  }
})

test('may not claim: no 570 beside a price or the rise; BM 36761 always with its date; never VAT 4956\'s picture (P8)', () => {
  for (const lang of LANGS) {
    const W = words.SKY_WORDS[lang]
    for (const s of [W.band.shekel, W.band.rise, ...W.list.shekel, ...W.list.rise]) assert.ok(!/570/.test(s), `${lang}: ${s}`)
    for (const s of shown(lang)) if (/BM 36761/.test(s)) assert.ok(s.includes(data.PHOTO.date[lang]), `${lang}: ${s}`)
    assert.equal(W.labels.tablet, 'BM 36761')
    assert.equal(W.labels.tabletDate, data.PHOTO.date[lang])
    // VAT 4956 is named with its holder and its year wherever it is named
    for (const s of shown(lang)) if (/VAT 4956/.test(s)) assert.ok(/Berlin/.test(s) && s.includes(data.DIARY.year), `${lang}: ${s}`)
  }
})

test('may not claim: no cinnamon, coin, wool or festival; the crescent never claimed as seen; every edition number "about" (P8)', () => {
  const BANNED = /cinnamon|zimt|\bcoins?\b|münze|geprägte?n? münze|\bwool\b|wolle|festival|\bfest\b|procession|prozession/i
  for (const lang of LANGS) {
    for (const s of shown(lang)) {
      assert.ok(!BANNED.test(s), `${lang}: ${s}`)
      for (const t of sentences(s)) if (/\b(saw|sah)\b/i.test(t)) assert.ok(/not known|nicht bekannt/.test(t), `${lang}: ${t}`)
    }
    const ABOUT = lang === 'de' ? 'etwa' : 'about'
    const edition = lang === 'de' ? ['8,3', '180', '240', '24 ', '1,65'] : ['8.3', '180', '240', '24 ', '1.65']
    for (const s of shown(lang)) for (const n of edition) {
      let i = s.indexOf(n)
      while (i >= 0) {
        // the edition's number with "about" just before it (the cubit of 0.495 m is the commentary's own figure)
        const before = s.slice(Math.max(0, i - 12), i)
        if (!/\d$/.test(s.slice(0, i)) && !/0[.,]49$/.test(s.slice(0, i))) assert.ok(before.includes(ABOUT), `${lang}: "${n}" without ${ABOUT} in: ${s}`)
        i = s.indexOf(n, i + 1)
      }
    }
  }
})

test('the band\'s lines: about 90 characters, no sentence over 14 words, every displayed sentence DRAFT', () => {
  for (const lang of LANGS) {
    const W = words.SKY_WORDS[lang]
    for (const l of Object.values(W.band)) {
      assert.ok(l.length <= words.LINE_CHARS, `${lang} ${l.length}: ${l}`)
      for (const t of sentences(l)) assert.ok(t.split(/\s+/).length <= words.SENTENCE_WORDS, `${lang}: ${t}`)
    }
    for (const s of shown(lang)) assert.ok(s.startsWith('DRAFT'), `${lang}: ${s}`)
    assert.deepEqual(Object.keys(W.band), [...words.STEP_IDS])
    for (const id of words.STEP_IDS) assert.ok(words.BAND_KEYS[id].carries && words.BAND_KEYS[id].pointer, id)
  }
})

test('the title fits the phone sheet\'s one row, and each lit share carries its class in words', () => {
  for (const lang of LANGS) {
    const W = words.SKY_WORDS[lang]
    assert.ok(W.ui.title.length <= words.TITLE_CHARS, `${lang} ${W.ui.title.length}: ${W.ui.title}`)
    const [a, b] = ['0414', '0415'].map((id) => words.skyText(lang, evenings, `lit-${id}`))
    assert.deepEqual(a, [`${words.num(lang, 0.7)}\u00a0%`, W.labels.sight.aid])
    assert.deepEqual(b, [`${words.num(lang, 3.7)}\u00a0%`, W.labels.sight.eye])
    assert.equal(words.skyText(lang, evenings, 'sight-0414'), W.labels.sight.aid)
    assert.equal(words.skyText(lang, evenings, 'share-0415'), `${words.num(lang, 3.7)}\u00a0%`)
  }
})

test('no dash and no semicolon in a displayed sentence', () => {
  for (const lang of LANGS) for (const s of shown(lang)) assert.ok(!/[–—;]/.test(s), `${lang}: ${s}`)
})

/* THE BROWSER'S OWN READ-BACK */
const R = { skip: !process.env.PAPER_READOUTS }
function readbacks() {
  return readdirSync(process.env.PAPER_READOUTS).filter((x) => /^readout-sky-/.test(x)).map((f) => ({ f, r: JSON.parse(readFileSync(join(process.env.PAPER_READOUTS, f), 'utf8')) }))
}

test('read-back: each step\'s subject drawn inside the plate, the lump\'s ring on the heaps\' picture (P1)', R, () => {
  let seen = 0
  const inside = (c, w, h, f) => assert.ok(c.x - c.r >= 0 && c.y - c.r >= 0 && c.x + c.r <= w && c.y + c.r <= h, f)
  const within = (b, w, h, f) => assert.ok(b && b.l >= 0 && b.t >= 0 && b.r <= w && b.b <= h, f)
  for (const { f, r } of readbacks()) for (const [k, ro] of Object.entries(r.readouts ?? {})) {
    const F = ro.facts, { w, h } = ro.size
    if (F.state === 'evenings') {
      assert.equal(F.panels.length, 2, `${f} ${k}`)
      for (const p of F.panels) for (const part of ['moon', 'sun', 'disc']) inside(p[part], w, h, `${f} ${k}: ${p.id} ${part}`)
      seen++
    }
    if (F.state === 'shekel') {
      for (const part of ['photo', 'heaps', 'silver']) within(F[part], w, h, `${f} ${k}: ${part}`)
      assert.ok(F.silverMark, `${f} ${k}: no ring round the lump`)
      const m = F.silverMark, b = F.heaps
      assert.ok(m.x - m.r > b.l && m.x + m.r < b.r && m.y - m.r > b.t && m.y + m.r < b.b, `${f} ${k}: the ring off the picture`)
      assert.equal(m.lead, F.silver.l >= F.heaps.r + 4, `${f} ${k}: a leader where the close picture stands beside`)
      seen++
    }
    if (F.state === 'rise' && F.step === 2) for (const id of ['rise', 'base', 'level-across']) within(ro.drawn.find((d) => d.id === id)?.box, w, h, `${f} ${k}: ${id}`)
  }
  assert.ok(seen > 0)
})

test('read-back: no label on anything and none left off, at every step shot, EN and DE, desktop and three phones (P6)', R, () => {
  const tags = new Set()
  for (const { f, r } of readbacks()) for (const [k, ro] of Object.entries(r.readouts ?? {})) {
    tags.add(`${r.lang}-${r.size}`)
    assert.deepEqual(ro.overlaps, [], `${f} ${k}`)
    for (const l of ro.labels) assert.ok(l.box, `${f} ${k}: ${l.id} left off`)
    for (const l of ro.labels) assert.ok(l.box.l >= 0 && l.box.t >= 0 && l.box.r <= ro.size.w && l.box.b <= ro.size.h, `${f} ${k}: ${l.id} cut`)
  }
  for (const t of ['en-desktop', 'de-desktop', 'en-phone', 'de-phone', 'de-phone-short', 'de-phone-small']) assert.ok(tags.has(t), `no read-back for ${t}`)
})

test('read-back: BM 36761 with its date and its credit wherever the photograph shows; the date at 14 px or more (P5)', R, () => {
  const css = readFileSync(join(B, 'paper/paper.css'), 'utf8')
  // the labels' own sizes: 0.9375rem on a wide plate, 0.875rem upright (the pair's name takes the label's size)
  assert.match(css, /\.paper-label \{[^}]*font: 500 0\.9375rem/)
  assert.match(css, /\[data-framing='upright'\] \.paper-label \{ font-size: 0\.875rem; \}/)
  let seen = 0
  for (const { f, r } of readbacks()) for (const [k, ro] of Object.entries(r.readouts ?? {})) {
    if (!ro.drawn.some((d) => d.id === 'photo' && d.box)) continue
    seen++
    const tab = ro.labels.find((l) => l.id === 'tablet')
    assert.ok(tab?.box && tab.text.includes(data.PHOTO.date[r.lang]), `${f} ${k}: ${tab?.text}`)
    const credit = ro.labels.find((l) => l.id === 'credit')
    assert.ok(credit?.box && credit.text === data.PHOTO.credit, `${f} ${k}: no credit`)
  }
  assert.ok(seen > 0)
})

test('read-back: the band in two rows on the desktop, at most three on every phone', R, () => {
  let seen = 0
  for (const { f, r } of readbacks()) for (const [k, c] of Object.entries(r.chrome ?? {})) {
    seen++
    assert.ok(c.line.rows <= (c.form === 'desk' ? 2 : 3), `${f} ${k}: ${c.line.rows} rows`)
  }
  assert.ok(seen > 0)
})

test('read-back: the door at rest, 44 px or more, and no frame carries the harness\'s marker (P7)', R, () => {
  let seen = 0
  for (const { f, r } of readbacks()) {
    for (const [k, m] of Object.entries(r.marked ?? {})) assert.equal(m, false, `${f} ${k}`)
    if (!r.rest) continue
    seen++
    assert.equal(r.rest.doors.length, 1, f)
    for (const d of r.rest.doors) assert.ok(d.w >= 44 && d.h >= 44, `${f}: ${d.w}x${d.h}`)
  }
  assert.ok(seen > 0, 'no rest in the read-back')
})

test('read-back: the stage built what the plan holds, and the plan\'s points fall where the plate puts the names (P3)', R, () => {
  const dir = process.env.PAPER_READOUTS
  const files = ['heaps-wide.json', 'heaps-upright.json', 'silver.json'].filter((x) => existsSync(join(dir, x)))
  if (!files.length) return
  for (const name of files) {
    const s = JSON.parse(readFileSync(join(dir, name), 'utf8'))
    const m = s.measure
    assert.ok(Math.abs(m.litres.barley / 180 - 1) < 0.02, `${name} barley ${m.litres.barley}`)
    assert.ok(Math.abs((m.litres.dates + m.shell) / 240 - 1) < 0.02, `${name} dates ${m.litres.dates} + ${m.shell}`)
    assert.ok(Math.abs(m.litres.sesame / 24 - 1) < 0.02, `${name} sesame ${m.litres.sesame}`)
    assert.ok(Math.abs(m.silverCm3 * data.SILVER_DENSITY / 8.33 - 1) < 0.01, `${name} silver ${m.silverCm3}`)
    assert.ok(Math.abs(m.figureHeight - 1.7) < 0.005, `${name} figure ${m.figureHeight}`)
    const [w, h] = s.size
    for (const [k, p] of Object.entries(m.points)) {
      const [id, part] = k.split(/-(?=[a-z]+$)/)
      const plan = data.HEAPS_PLAN, heap = data.heaps().find((x) => x.id === id)
      const at3 = k.startsWith('figure') ? [plan.figure[0], part === 'top' ? data.FIGURE_HEIGHT : 0, plan.figure[1]]
        : k.startsWith('silver') ? [plan.silver[0] + (k.endsWith('-a') ? -0.005 : k.endsWith('-b') ? 0.005 : 0), 0, plan.silver[1]]
          : [heap.at[0], part === 'top' ? heap.H : 0, heap.at[1]]
      const q = data.project(s.view, at3)
      assert.ok(Math.abs((q.x - p.x) * w) < 1 && Math.abs((q.y - p.y) * h) < 1, `${name} ${k}: ${q.x * w} ${p.x * w}, ${q.y * h} ${p.y * h}`)
    }
  }
})
