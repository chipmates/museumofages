// Stop 4's two paper features: the oil list (feature 2) and the gardens in words (feature 3).
// Pure checks on the scenes and the words; PAPER_READOUTS=<folder> also reads the browser's own read-back
// (paper-shoot.mjs --page oil / --page words) for overlaps, the band and sheet, the mark and the doors at rest.
import test from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
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

const B = join(APP, 'src/wings/babylon')
const load = (p) => import(pathToFileURL(join(B, p)).href)
const sceneKit = await load('paper/scene.ts')
const oilData = await load('oil/oil-data.ts')
const oilWords = await load('oil/oil-words.ts')
const oilScene = await load('oil/oil-scene.ts')
const oil = await load('oil/oil-label.ts')
const gwData = await load('garden-words/garden-words-data.ts')
const gwWords = await load('garden-words/garden-words-words.ts')
const gwScene = await load('garden-words/garden-words-scene.ts')

const LANGS = ['en', 'de']
const SIZES = { wide: [[1600, 648], [1440, 648]], upright: [[390, 605], [390, 425], [360, 391], [360, 214]] }
const OIL_STEPS = oilWords.STEP_IDS.length
const WORDS_STEPS = gwWords.STEP_IDS.length
// a small coast and a river through the map's frame, so the map's lines are drawn without the asset store
const COASTS = { coasts: [[[30, 36], [34, 35], [35.5, 33], [34, 31]]], rivers: [{ name: 'Euphrates', line: [[38.5, 36], [41, 34.4], [45.5, 31.3]] }] }
const oilAt = (t, framing, w, h) => oilScene.oilScene(t, framing, w, h, { inset: sceneKit.insetFor(framing, 0), data: { coasts: COASTS } })
const gwAt = (t, framing, w, h) => gwScene.gardenWordsScene(t, framing, w, h, { inset: sceneKit.insetFor(framing, 0) })
const oilLabels = (lang, step) => oilScene.oilScene(step, 'wide', 1600, 648, { inset: sceneKit.insetFor('wide', 0), data: { coasts: COASTS } })
  .anchors.map((a) => [a.id, oil.oilLabel(lang, a.id, step)])

// qualifiers belong to the band, never on the plate
const QUALIFIER = /\b(about|circa|ca\.|etwa|rund|guess|guessed|vermutet|restored|ergänzt|perhaps|vielleicht|maybe|unknown|unbekannt|probably|wohl)\b|\?/i
const DASH = /[–—;]/

test('the plate carries numbers with their units and single names, no qualifier (the credit aside)', () => {
  let seen = 0
  for (const lang of LANGS) {
    for (let s = 0; s < OIL_STEPS; s++) for (const [id, text] of oilLabels(lang, s)) {
      if (id === 'credit') continue
      for (const part of [text].flat()) { seen++; assert.doesNotMatch(part, QUALIFIER, `${lang} oil ${s} ${id}: "${part}"`); assert.doesNotMatch(part, DASH) }
    }
    for (const v of Object.values(gwWords.GARDEN_WORDS[lang].labels)) { seen++; assert.doesNotMatch(v, QUALIFIER, `${lang} words: "${v}"`); assert.doesNotMatch(v, DASH) }
  }
  assert.ok(seen > 40)
})

test('the band names every number its plate shows at that step', () => {
  for (const lang of LANGS) {
    const W = oilWords.OIL_WORDS[lang]
    for (let s = 0; s < OIL_STEPS; s++) {
      const band = W.band[oilWords.STEP_IDS[s]]
      for (const [id, text] of oilLabels(lang, s)) {
        if (id === 'credit') continue
        for (const part of [text].flat()) {
          const nums = part.match(/[\d½][\d.,½]*/g) ?? []
          for (const n of nums) assert.ok(band.includes(n), `${lang} step ${s}: the plate shows ${n} (${id}), the band does not name it`)
        }
      }
    }
  }
})

test('the unit: a square a sila, one size on a plate, never enlarged; twenty halves are the king\'s length', () => {
  assert.deepEqual(oilData.ROWS.map((r) => [r.id, r.sila]), [['king', 10], ['sons', 2.5], ['men', 4], ['carpenter', 0.5]])
  assert.equal(oilData.HALVES * 0.5, oilData.ROWS.find((r) => r.id === 'king').sila)
  for (const [framing, sizes] of Object.entries(SIZES)) for (const [w, h] of sizes) {
    const units = new Set(), kingW = new Set()
    for (let s = 1; s <= 4; s++) {
      const f = oilAt(s, framing, w, h).facts
      units.add(f.unit)
      for (const r of f.rows) {
        assert.equal(r.size, f.unit, `${framing} ${w}x${h} step ${s}: ${r.id} drawn at ${r.size}, the plate's unit is ${f.unit}`)
        const sila = r.id === 'halves' ? oilData.HALVES * 0.5 : oilData.ROWS.find((x) => x.id === r.id).sila
        assert.equal(r.count, r.id === 'halves' ? r.count : sila, `${r.id}: the count is the list's`)
        if (r.id === 'king') kingW.add(Math.round(r.w))
      }
    }
    assert.equal(units.size, 1, `${framing} ${w}x${h}: the unit changes between steps (${[...units]})`)
    assert.equal(kingW.size, 1, `${framing} ${w}x${h}: the king's row changes length`)
  }
})

test('the photograph at true size where it fits, the ruler always at the photograph\'s scale', () => {
  for (const [framing, sizes] of Object.entries(SIZES)) for (const [w, h] of sizes) for (const s of [0, 1, 4]) {
    const f = oilAt(s, framing, w, h).facts
    // a low upright plate lets the photograph go once the rows come
    if (framing === 'upright' && h < 330 && s > 0) { assert.equal(f.photo, null); continue }
    // the ruler spans 10 cm at the scale the photograph is drawn at: upright on a wide plate, flat under it upright
    const cm = f.photo.scale * oilData.PHOTO.pxPerCm
    assert.ok(Math.abs(f.photo.pxPerCm - cm) < 1e-6)
    const span = framing === 'wide' ? f.ruler.h : f.ruler.w
    assert.ok(Math.abs(span - 10 * cm) <= 0.75, `${framing} ${w}x${h} step ${s}: ruler ${span.toFixed(1)} px for 10 cm at ${cm.toFixed(2)} px/cm`)
    assert.ok(cm <= oilData.CSS_CM + 1e-6, 'never larger than true size')
    if (framing === 'wide' && h >= 648) assert.ok(f.photo.trueSize, `${w}x${h}: the photograph is not at true size`)
  }
})

test('the map: dots on bare paper, today\'s coasts and rivers, no line between the dots, Lydia an open ring', () => {
  for (const [framing, sizes] of Object.entries(SIZES)) for (const [w, h] of sizes) {
    const sc = oilAt(5, framing, w, h)
    for (const p of sc.prims) assert.match(p.id, /^(coast|river|dot-)/, `${framing}: ${p.id} on the map`)
    const dots = sc.prims.filter((p) => p.id.startsWith('dot-'))
    assert.equal(dots.length, oilData.LANDS.length)
    for (const d of dots) {
      const land = oilData.LANDS.find((l) => `dot-${l.id}` === d.id)
      assert.equal(d.mark, land.restored ? 'guessed' : 'known', d.id)
    }
    // the map's lines are today's coasts and rivers, drawn in pencil
    for (const p of sc.prims.filter((x) => !x.id.startsWith('dot-'))) assert.equal(p.mark, 'pencil', p.id)
  }
})

test('upright: every drawing inside the 16 px gutter and under the top safe area', () => {
  const inside = (b, w, h, top, f, id) => {
    assert.ok(b.l >= 16 - 0.5 && b.r <= w - 16 + 0.5, `${f}: ${id} runs into the side gutter (${b.l.toFixed(1)}..${b.r.toFixed(1)} of ${w})`)
    assert.ok(b.t >= top - 0.5 && b.b <= h + 0.5, `${f}: ${id} above the top safe area or below the plate`)
  }
  // a notch's 47 px on the tall phones that have one, a status bar's 20 px on the small one
  const cases = [...SIZES.upright.map(([w, h]) => [w, h, 0]), [390, 605, 47], [390, 425, 47], [360, 391, 20]]
  for (const [w, h, safe] of cases) {
    const inset = sceneKit.insetFor('upright', safe)
    assert.ok(inset.l >= 16 && inset.r >= 16 && inset.t >= Math.max(16, safe + 8))
    for (let t = 0; t <= OIL_STEPS - 1; t += 0.5) {
      const sc = oilScene.oilScene(t, 'upright', w, h, { inset, data: { coasts: COASTS } })
      for (const p of sc.prims) { const b = sceneKit.primBox(p); if (b && p.alpha > 0.01) inside(b, w, h, inset.t, `oil ${w}x${h} t ${t} safe ${safe}`, p.id) }
      inside(sc.bounds, w, h, inset.t, `oil ${w}x${h} t ${t}`, 'the label bounds')
    }
    for (let t = 0; t <= WORDS_STEPS - 1; t += 0.5) {
      const sc = gwScene.gardenWordsScene(t, 'upright', w, h, { inset })
      // the stop's colour is a picture edge to edge on its side, not a drawing
      for (const p of sc.prims) { if (p.id === 'colour') continue; const b = sceneKit.primBox(p); if (b && p.alpha > 0.01) inside(b, w, h, inset.t, `words ${w}x${h} t ${t} safe ${safe}`, p.id) }
    }
  }
})

test('feature 3: every sketch Guessed, the locator\'s outlines the walk\'s own plan, the stop a pencil ring', () => {
  const plan = JSON.parse(readFileSync(join(B, 'map/map-plan.json'), 'utf8'))
  const block = (id) => plan.blocks.find((b) => b.id === id).poly
  assert.deepEqual(gwData.PLAN.esagila, block('esagila'))
  assert.deepEqual(gwData.PLAN.annex, block('esagila-annex'))
  assert.deepEqual(gwData.PLAN.palace, block('south-palace'))
  assert.deepEqual(gwData.PLAN.river, plan.water.find((x) => x.id === 'euphrates').poly)
  const gardens = JSON.parse(readFileSync(join(B, 'gardens/gardens-plan.json'), 'utf8'))
  assert.deepEqual(gwData.PLAN.stop, gardens.vaulted.unit)
  for (const [framing, sizes] of Object.entries(SIZES)) for (const [w, h] of sizes) {
    for (const s of [1, 2]) for (const p of gwAt(s, framing, w, h).prims) if (p.id !== 'colour') assert.equal(p.mark, 'guessed', `step ${s}: ${p.id} is ${p.mark}`)
    const where = gwAt(3, framing, w, h).prims
    for (const p of where) {
      if (p.id === 'colour') continue
      const want = p.id === 'ekarzaginna' ? 'guessed' : p.id === 'stopRing' ? 'pencil' : 'known'
      assert.equal(p.mark, want, `the locator: ${p.id}`)
    }
    // never a plan of a found place: no scale bar, no north arrow
    for (const s of [0, 1, 2, 3]) for (const p of gwAt(s, framing, w, h).prims) assert.doesNotMatch(p.id, /scale|north|arrow|bar/i)
  }
})

test('the first step of feature 3 shows the stop\'s colour whole; the paper\'s drawings wait until it has made room', () => {
  for (const [framing, sizes] of Object.entries(SIZES)) for (const [w, h] of sizes) {
    const s0 = gwAt(0, framing, w, h)
    assert.deepEqual(s0.prims.map((p) => p.id), ['colour'])
    const c = s0.facts.colour
    assert.equal(c.r - c.l, w); assert.equal(c.b - c.t, h)
    const s1 = gwAt(1, framing, w, h).facts.colour
    assert.ok(framing === 'wide' ? s1.r < w * 0.5 : s1.b < h * 0.5, `${framing}: the colour does not give way to the paper`)
    assert.equal(gwAt(0.35, framing, w, h).facts.shown.ea, 0)
  }
})

test('feature 3 opens on the held frame itself: at the first step the colour stands in the window\'s box, cut by the plate', () => {
  const stages = { wide: [[1600, 648, 1600, 900], [1440, 600, 1440, 900]], upright: [[390, 605, 390, 844], [390, 425, 390, 664], [360, 391, 360, 640], [360, 214, 360, 640]] }
  const focus = { wide: [0.56, 0.36], upright: [0.5, 0.32] }, zoom = { wide: 1.4, upright: 1 }
  for (const [framing, list] of Object.entries(stages)) for (const [w, h, W, H] of list) {
    const stage = { l: 0, t: 0, r: W, b: H }
    const at = (t) => gwScene.gardenWordsScene(t, framing, w, h, { inset: sceneKit.insetFor(framing, 0), focus: focus[framing], zoom: zoom[framing], stage })
    const c0 = at(0).prims.find((p) => p.id === 'colour')
    assert.deepEqual([c0.x, c0.y, c0.w, c0.h], [0, 0, W, H], `${framing} ${w}x${h}: the colour is not the held frame at the first step`)
    assert.deepEqual(c0.clip, { l: 0, t: 0, r: w, b: h })
    for (const t of [0.25, 0.5, 1, 2, 3]) {
      const { colour, frame } = at(t).facts
      // the frame keeps the window's shape and always covers its panel: never a gap, never stretched
      assert.ok(Math.abs((frame.r - frame.l) / (frame.b - frame.t) - W / H) < 1e-6, `${framing} t ${t}: the frame's shape`)
      assert.ok(frame.l <= colour.l + 1e-6 && frame.t <= colour.t + 1e-6 && frame.r >= colour.r - 1e-6 && frame.b >= colour.b - 1e-6, `${framing} ${w}x${h} t ${t}: the frame leaves its panel bare`)
      assert.ok(frame.r - frame.l <= W * zoom[framing] + 1e-6, `${framing} t ${t}: enlarged past its zoom`)
    }
  }
})

test('the words: DRAFT lines at the line\'s length, no sentence over 14 words, no dash, no semicolon', () => {
  const sets = LANGS.flatMap((lang) => [['oil', lang, oilWords.OIL_WORDS[lang]], ['words', lang, gwWords.GARDEN_WORDS[lang]]])
  for (const [kind, lang, W] of sets) {
    for (const [id, line] of Object.entries(W.band)) {
      assert.ok(line.startsWith('DRAFT'), `${kind} ${lang} ${id}: not a DRAFT placeholder`)
      assert.ok(line.length <= oilWords.LINE_CHARS, `${kind} ${lang} ${id}: ${line.length} characters`)
      for (const sentence of line.replace(/^DRAFT · /, '').split(/(?<=[.!?:])\s+(?=[A-ZÄÖÜ0-9½])/)) {
        const n = sentence.split(/\s+/).filter(Boolean).length
        assert.ok(n <= oilWords.SENTENCE_WORDS, `${kind} ${lang} ${id}: "${sentence}" has ${n} words`)
      }
    }
    const shown = [...Object.values(W.steps), ...Object.values(W.band), ...Object.values(W.list).flat(), W.ui.title, W.ui.door, W.ui.close, W.ui.track, W.ui.play, W.ui.pause]
    for (const s of shown) assert.doesNotMatch(s, DASH, `${kind} ${lang}: "${s}"`)
    for (const s of [...Object.values(W.list).flat(), W.ui.title, W.ui.door, W.ui.close]) assert.ok(s.startsWith('DRAFT'), `${kind} ${lang}: "${s}"`)
  }
  // a number and its unit never part at a line's end
  for (const lang of LANGS) for (const line of Object.values(oilWords.OIL_WORDS[lang].band)) assert.doesNotMatch(line, /\d (cm|sila|Sila|BC|v\.)/)
  for (const lang of LANGS) for (const line of Object.values(gwWords.GARDEN_WORDS[lang].band)) assert.doesNotMatch(line, /\d (BC|v\.)/)
  // each garden names its text and time (RULES-W2A F3.1): the letter of 597 to 587 or 586 BC on its line
  assert.match(gwWords.GARDEN_WORDS.en.band.jeremiah, /597 to 587 or 586/)
  assert.match(gwWords.GARDEN_WORDS.de.band.jeremiah, /597 bis 587 oder 586/)
  assert.match(gwWords.GARDEN_WORDS.en.band.ea, /680 to 669/)
  // the lines are the lists', never this tablet's own; never that he lived in the building
  for (const lang of LANGS) for (const s of Object.values(oilWords.OIL_WORDS[lang].list).flat()) assert.doesNotMatch(s, /on the tablet|auf der Tafel|lived there|dort lebte/, s)
  // the doors are named by what they show, never "Learn more"
  for (const lang of LANGS) for (const d of [oilWords.OIL_WORDS[lang].ui.door, gwWords.GARDEN_WORDS[lang].ui.door]) assert.doesNotMatch(d, /learn more|mehr erfahren/i)
})

test('feature 2 may not say: no litre, no jar, no 592 on the plate, never Greeks, never "the king fed"', () => {
  for (const lang of LANGS) {
    const W = oilWords.OIL_WORDS[lang]
    const all = [...Object.values(W.band), ...Object.values(W.list).flat(), ...Object.values(W.steps)].join(' ')
    assert.doesNotMatch(all, /\blit(re|er)s?\b|\bLiter\b|Greek|Griech|king fed|fed the king|prison|chains|Gefängnis|Ketten/i)
    for (let s = 0; s < OIL_STEPS; s++) for (const [, text] of oilLabels(lang, s)) assert.doesNotMatch([text].flat().join(' '), /592|591|jar|Krug/)
    assert.doesNotMatch(Object.values(W.band).join(' '), /this (tablet|list) names|diese Tafel nennt/i)
  }
  for (const lang of LANGS) {
    const W = gwWords.GARDEN_WORDS[lang]
    const all = [...Object.values(W.band), ...Object.values(W.list).flat()].join(' ')
    // the Hanging Gardens only ever in the negative
    for (const m of all.matchAll(/[^.]*(Hanging Gardens|Hängenden Gärten)[^.]*/g)) assert.match(m[0], /\b(None|Keiner|not|nicht|kein)/, m[0])
  }
})

test('no colour value in the stop\'s new files: they draw with the paper kit\'s tokens', () => {
  const files = [
    ...readdirSync(join(B, 'oil')).map((f) => join(B, 'oil', f)),
    ...readdirSync(join(B, 'garden-words')).map((f) => join(B, 'garden-words', f)),
    ...['scene.ts', 'feature.ts', 'feature.css', 'bench.ts', 'bench.css'].map((f) => join(B, 'paper', f)),
  ].filter((f) => /\.(ts|css|html)$/.test(f))
  assert.ok(files.length >= 14)
  for (const f of files) {
    const src = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    assert.doesNotMatch(src, /#[0-9a-fA-F]{3,8}\b(?![-\w])|\brgba?\(|\bhsla?\(|\boklch\(/, f)
  }
})

test('the coasts\' cutter passes its own self-test', () => {
  const r = spawnSync(process.env.BABYLON_PY ?? 'python3', ['-I', join(APP, 'forge/babylon/coasts.py'), '--self-test'], { encoding: 'utf8' })
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /self-test: ok/)
})

/* THE BROWSER'S OWN READ-BACK */
function readbacks() {
  const dir = process.env.PAPER_READOUTS
  return readdirSync(dir).filter((x) => /^readout-(oil|words)-/.test(x)).map((f) => ({ f, r: JSON.parse(readFileSync(join(dir, f), 'utf8')) }))
}
const R = { skip: !process.env.PAPER_READOUTS }

test('read-back: no label on anything and none left off, at every step shot', R, () => {
  let steps = 0
  for (const { f, r } of readbacks()) for (const [k, ro] of Object.entries(r.readouts ?? {})) {
    steps++
    assert.deepEqual(ro.overlaps, [], `${f} ${k}`)
    for (const l of ro.labels) assert.ok(l.box, `${f} ${k}: ${l.id} left off`)
  }
  assert.ok(steps > 0, 'no read-back in the folder')
})

test('read-back: the band in two rows on the desktop, at most three on every phone (the line\'s length); the mark never gold', R, () => {
  let seen = 0
  const grey = (c) => { const v = (c.match(/\d+/g) ?? []).slice(0, 3).map(Number); return v.length === 3 && Math.max(...v) - Math.min(...v) <= 40 }
  for (const { f, r } of readbacks()) for (const [k, c] of Object.entries(r.chrome ?? {})) {
    seen++
    if (c.form === 'desk') assert.ok(c.line.rows <= 2 && c.line.w <= 860, `${f} ${k}: ${c.line.rows} rows`)
    else assert.ok(c.line.rows <= 3, `${f} ${k}: ${c.line.rows} rows`)
    assert.ok(grey(c.mark.colour), `${f} ${k}: the certainty mark is ${c.mark.colour}`)
    if (c.mark.phoneColour) assert.ok(grey(c.mark.phoneColour), `${f} ${k}: the certainty mark is ${c.mark.phoneColour}`)
  }
  assert.ok(seen > 0)
})

test('read-back: the two doors at rest stand as one group where the one control stood, each 44 px or more', R, () => {
  let seen = 0
  for (const { f, r } of readbacks()) {
    const rest = r.rest
    if (!rest) continue
    seen++
    assert.equal(rest.doors.length, 2, f)
    const [a, b] = rest.doors
    assert.ok(Math.abs(a.cy - b.cy) <= 1, `${f}: the doors are not one row`)
    const gap = b.x - (a.x + a.w)
    assert.ok(gap >= 8 && gap <= 16, `${f}: ${gap} px between the doors`)
    for (const d of rest.doors) assert.ok(d.w >= 44 && d.h >= 44, `${f}: ${d.text} ${d.w}x${d.h}`)
    const g = rest.group, S = rest.stage
    if (rest.form === 'wide') {
      assert.ok(S.w - (g.x + g.w) <= S.w * 0.05 && S.h - (g.y + g.h) <= S.h * 0.1, `${f}: the group is not in the corner`)
      assert.ok(rest.pictureShare >= 0.95, `${f}: the picture keeps ${rest.pictureShare}`)
    } else {
      for (const d of rest.doors) assert.ok(d.cy >= rest.reach, `${f}: ${d.text} above the thumb's reach`)
      assert.ok(g.x >= 16 && S.w - (g.x + g.w) >= 16, `${f}: the doors run into the gutter`)
      assert.ok(rest.pictureShare >= 2 / 3, `${f}: the picture keeps ${rest.pictureShare}`)
    }
  }
  assert.ok(seen > 0, 'no rest in the read-back')
})

test('read-back: on the map each land\'s name stands clearly nearer its own dot than any other', R, () => {
  let seen = 0
  // from the name's box to a dot's centre; a name about as near another dot reads as that dot's name, so its own is at
  // most three quarters of the next (Byblos set below-right, level with Tyre's dot, was 11.2 against 13.8)
  const reach = (b, d) => Math.hypot(Math.max(b.l - d.x, 0, d.x - b.r), Math.max(b.t - d.y, 0, d.y - b.b))
  for (const { f, r } of readbacks()) for (const [k, ro] of Object.entries(r.readouts ?? {})) {
    const dots = (ro.facts?.dots ?? []).filter((d) => d.lit > 0.99)
    for (const l of ro.labels.filter((x) => x.id.startsWith('land-') && x.box)) {
      seen++
      const own = l.id.slice(5)
      const mine = dots.find((d) => d.id === own)
      const next = Math.min(...dots.filter((d) => d.id !== own).map((d) => reach(l.box, d)))
      assert.ok(mine && reach(l.box, mine) <= 0.75 * next, `${f} ${k}: ${own}'s name ${mine ? reach(l.box, mine).toFixed(1) : '-'} from its dot, ${next.toFixed(1)} from another`)
    }
  }
  assert.ok(seen > 0, 'no land name in the read-backs')
})

test('read-back: no frame carries the harness\'s marker', R, () => {
  let seen = 0
  for (const { f, r } of readbacks()) for (const [k, m] of Object.entries(r.marked ?? {})) { seen++; assert.equal(m, false, `${f} ${k}`) }
  assert.ok(seen > 0)
})
