/* THE KIT SHEET (`/src/wings/babylon/paper/sheet.html`): every mark of the
   paper kit beside its name, at the size the page is opened at, and the
   contrast each one keeps against the paper. A dev page, never the museum's;
   its words are the bench's own. The rig `window.__paper` hands the shooter
   each sample's box, so the contrast is measured on the drawn pixels too. */

import {
  CONTRAST_FLOOR, INK_SHARE, MARKS, contrast, createPaperPlate, createPaperSteps, figurePath, gridBox, markLine, markPath,
  markRect, millions, placeElements, rangeRow, rulerPaths, shades, stackPath, svg, unitGrid, framingOf, type Box, type PaperMark,
} from './index'

const says = document.getElementById('says') as HTMLElement
const host = document.getElementById('sheet') as HTMLElement
const q = new URLSearchParams(location.search)
const lang = q.get('lang') === 'de' ? 'de' : 'en'
const dir = q.get('dir') === 'rtl' ? 'rtl' : 'ltr'

const S = shades()
const ratio = (name: keyof typeof S): number => Math.round(contrast(S[name], S.paper) * 100) / 100

interface Sample { id: string; mark: string; box: Box; floor: number; tokenRatio: number }
const samples: Sample[] = []
let steps: ReturnType<typeof createPaperSteps> | null = null

const NAMES: Record<PaperMark, [string, string]> = {
  place: ['in place', 'heavy stroke, solid fill'],
  known: ['known', 'fine plain stroke, outline only'],
  guessed: ['guessed', 'dashed stroke, hatched fill'],
  unknown: ['not known', 'bare paper, at most the word'],
  measure: ['our measures', 'grey pencil: figure, ruler, unit'],
}

function draw(): void {
  const W = innerWidth, H = innerHeight
  const framing = framingOf(W, H)
  const plate = createPaperPlate(document, { lang, dir, name: 'paper kit' })
  plate.root.dataset['framing'] = framing
  host.replaceChildren(plate.root)
  plate.resize(W, H)
  samples.length = 0
  const cols = framing === 'wide' ? 4 : 2
  const rows = framing === 'wide' ? 3 : 5
  const pad = framing === 'wide' ? 28 : 12
  const tw = (W - pad * (cols + 1)) / cols, th = (H - pad * (rows + 1)) / rows
  const tile = (i: number): { x: number; y: number } => ({ x: pad + (i % cols) * (tw + pad), y: pad + Math.floor(i / cols) * (th + pad) })
  const g = plate.layer('sheet')
  const pencil = plate.layer('pencil')
  const asks: Parameters<typeof placeElements>[1][number][] = []
  const taken: (Box & { id?: string })[] = []
  const head = (i: number, title: string, sub: string, extra = ''): void => {
    const at = tile(i)
    const t = plate.label(`h${i}`, title, 'big')
    const s = plate.label(`s${i}`, `${sub}${extra}`.replace(/ (px|m|%)(?!\w)/g, '\u00a0$1'), 'quiet')
    s.style.whiteSpace = 'normal'; s.style.width = `${tw}px`
    for (const [node, y] of [[t, at.y + 4], [s, at.y + (framing === 'wide' ? 30 : 26)]] as const) {
      node.style.left = dir === 'rtl' ? '' : `${at.x}px`
      if (dir === 'rtl') node.style.right = `${W - at.x - tw}px`
      node.style.top = `${y}px`
    }
  }
  const body = (i: number): Box => { const at = tile(i); const top = at.y + (framing === 'wide' ? 64 : 66); return { l: at.x + 4, t: top, r: at.x + tw - 4, b: at.y + th - 6 } }

  // 1 to 4: the four marks
  const marks: PaperMark[] = ['place', 'known', 'guessed', 'unknown']
  marks.forEach((mark, i) => {
    const b = body(i)
    const w = Math.min(b.r - b.l, (b.b - b.t) * 1.6) * 0.8, h = (b.b - b.t) * 0.72
    const box = { x: b.l + 6, y: b.t + 6, w, h }
    const floor = mark === 'place' ? CONTRAST_FLOOR.main : CONTRAST_FLOOR.stroke
    if (mark === 'unknown') {
      const word = plate.label('unknown-word', NAMES.unknown[0], 'quiet')
      word.style.left = `${box.x + w / 2 - 34}px`; word.style.top = `${box.y + h / 2 - 9}px`
      head(i, NAMES[mark][0], NAMES[mark][1])
      return
    }
    g.append(markRect(document, mark, plate.ids, box))
    if (mark === 'place') {
      // a second solid inside, as a core in its mantle: one class, two tones, no pattern
      g.append(markRect(document, 'place', plate.ids, { x: box.x + w * 0.2, y: box.y + h * 0.35, w: w * 0.6, h: h * 0.65 }, 'paper-deep'))
    }
    samples.push({ id: mark, mark, box: { l: box.x - 3, t: box.y - 3, r: box.x + w + 3, b: box.y + h + 3 }, floor, tokenRatio: ratio('ink') })
    head(i, NAMES[mark][0], NAMES[mark][1], `  ${MARKS[mark].stroke} px`)
  })

  // 5: our measures: the figure, a stack, the ruler, a unit
  {
    const i = 4, b = body(i)
    const tall = b.b - b.t - 12, px = tall / (1.7 * 6)
    const foot = b.b - 6
    pencil.append(svg(document, 'path', { d: figurePath(b.l + 24, foot, tall / 1.7 * 0.92) }, 'paper-pencil'))
    pencil.append(svg(document, 'path', { d: stackPath(b.l + 70, foot, px, 6) }, 'paper-pencil'))
    const r = rulerPaths(b.l + 96, b.t + 8, Math.min(26, (b.r - b.l - 110) / 10))
    pencil.append(svg(document, 'path', { d: r.body, 'stroke-width': 1.25 }, 'paper-pencil-line'))
    pencil.append(svg(document, 'path', { d: r.ticks, 'stroke-width': 1 }, 'paper-pencil-line'))
    const unit = Math.min(28, (b.b - b.t) * 0.25)
    pencil.append(markRect(document, 'measure', plate.ids, { x: b.l + 96, y: foot - unit, w: unit, h: unit }))
    samples.push({ id: 'figure', mark: 'measure', box: { l: b.l + 8, t: b.t, r: b.l + 40, b: foot + 2 }, floor: CONTRAST_FLOOR.stroke, tokenRatio: ratio('pencil') })
    samples.push({ id: 'ruler', mark: 'measure', box: { l: r.ends[0] - 2, t: b.t + 6, r: r.ends[1] + 2, b: b.t + 8 + Math.max(10, 26 * 0.9) + 2 }, floor: CONTRAST_FLOOR.stroke, tokenRatio: ratio('pencil') })
    const label = plate.label('ruler', '10 cm', 'pencil')
    label.style.left = `${r.ends[1] - 40}px`; label.style.top = `${b.t + 8 + 26}px`
    head(i, NAMES.measure[0], NAMES.measure[1], `  1.70 m`)
  }

  // 6: counted units: 8.7 of them, and a range of 12 to 15 groups
  {
    const i = 5, b = body(i)
    const size = Math.max(10, Math.min(22, (b.r - b.l) / 14)), gap = Math.max(3, size * 0.25)
    const grid = unitGrid(8.7, { x: b.l + 6, y: b.t + 6, size, gap, perRow: 5, mirror: dir === 'rtl' })
    for (const u of grid) pencil.append(markRect(document, 'measure', plate.ids, { x: u.x, y: u.y, w: u.w, h: u.h }))
    const gb = gridBox(8.7, { x: 0, y: 0, size, gap, perRow: 5 })
    const lab = plate.label('count', millions(8.7, lang), 'count')
    lab.style.left = `${b.l + 12 + gb.w}px`; lab.style.top = `${b.t + 4}px`
    const row = rangeRow(12, 15, { x: b.l + 6, y: b.t + gb.h + 22, size: size * 0.7, gap: gap * 0.8, perRow: 15, mirror: dir === 'rtl' })
    for (const u of row) {
      const r = markRect(document, 'measure', plate.ids, { x: u.x, y: u.y, w: u.w, h: u.h }, u.open ? 'paper-open' : '')
      if (u.open) r.setAttribute('stroke-dasharray', '2 2')
      pencil.append(r)
    }
    samples.push({ id: 'unit', mark: 'measure', box: { l: b.l + 4, t: b.t + 4, r: b.l + 8 + gb.w, b: b.t + 8 + gb.h }, floor: CONTRAST_FLOOR.stroke, tokenRatio: ratio('pencil') })
    head(i, 'counted unit', 'one unit repeated, never enlarged')
  }

  // 7: the placer: a stepped outline and names round it, none touching
  {
    const i = 6, b = body(i)
    const cx = (b.l + b.r) / 2 - 20, foot = b.b - 22
    const wide = Math.min((b.r - b.l) * 0.45, (b.b - b.t) * 0.9)
    const tiers = [[1, 0.36], [0.8, 0.2], [0.6, 0.12], [0.4, 0.12]] as const
    let y = foot
    const lines: { ax: number; ay: number; bx: number; by: number }[] = []
    tiers.forEach(([share, hshare], k) => {
      const w = wide * share, h = (b.b - b.t - 40) * hshare
      const r = { x: cx - w / 2, y: y - h, w, h }
      g.append(markRect(document, k === 0 ? 'place' : 'guessed', plate.ids, r))
      taken.push({ l: r.x - 1.5, t: r.y - 1.5, r: r.x + w + 1.5, b: y + 1.5, id: `tier${k}` })
      y -= h
    })
    g.append(markLine(document, 'known', plate.ids, { x: b.l, y: foot }, { x: b.r, y: foot }))
    lines.push({ ax: b.l, ay: foot, bx: b.r, by: foot })
    asks.push({ id: 'a', x: cx + wide / 2, y: foot - 10, sides: ['right', 'above-right'], gap: 8, node: plate.label('pa', lang === 'de' ? 'etwa 90 m' : 'about 90 m') })
    asks.push({ id: 'b', x: cx, y, sides: ['above', 'right', 'left'], gap: 8, node: plate.label('pb', lang === 'de' ? 'nicht bekannt' : 'not known', 'quiet') })
    asks.push({ id: 'c', x: cx + wide * 0.3, y: y + 20, sides: ['right', 'above-right', 'below-right'], gap: 10, node: plate.label('pc', lang === 'de' ? 'Stufe' : 'stage') })
    head(i, 'labels by the placer', 'page text; nothing touches')
  }

  // 8: the two tokens and their shades
  {
    const i = 7, b = body(i)
    const names = ['ink', 'pencil', 'solidDeep', 'solid', 'unit'] as const
    const sw = Math.min(46, (b.r - b.l - 12) / names.length - 8)
    names.forEach((name, k) => {
      const x = b.l + 6 + k * (sw + 8)
      const r = svg(document, 'rect', { x, y: b.t + 6, width: sw, height: sw * 0.8 })
      r.setAttribute('style', `fill: ${name === 'ink' ? 'var(--paper-ink)' : `var(--paper-${name})`}`)
      g.append(r)
      const l = plate.label(`tok-${name}`, framing === 'wide' ? `${ratio(name)}` : ratio(name).toFixed(1), name === 'ink' || name === 'pencil' ? 'ink' : 'quiet')
      l.style.left = `${x - 2}px`; l.style.top = `${b.t + 10 + sw * 0.8}px`
    })
    head(i, 'ink and paper', `contrast on paper; pencil ${Math.round(INK_SHARE.pencil * 100)} % ink`)
  }

  // 9: notches and named steps
  {
    const i = framing === 'wide' ? 8 : 8, b = body(i)
    const row = document.createElement('div')
    // upright, the row takes the page's width, as a feature's band gives it
    const rowW = framing === 'wide' ? Math.min(b.r - b.l, 560) : W - 2 * pad - 8
    row.style.cssText = `position:absolute; left:${b.l}px; top:${b.t}px; width:${rowW}px; color: var(--paper-ink)`
    steps?.dispose()
    steps = createPaperSteps({
      doc: document, reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches, dir,
      // upright, three steps: one row of names fits the sheet's last tile
      steps: [{ id: 'a', name: lang === 'de' ? 'nicht bekannt' : 'not known' }, { id: 'b', name: lang === 'de' ? 'etwa 66\u00a0m' : 'about 66\u00a0m' },
        { id: 'c', name: lang === 'de' ? 'etwa 90\u00a0m' : 'about 90\u00a0m' }, { id: 'd', name: lang === 'de' ? 'nicht bekannt' : 'not known' }].slice(0, framing === 'wide' ? 4 : 3),
      words: { play: lang === 'de' ? 'Abspielen' : 'Play', pause: 'Pause', track: 'steps', between: (a, c) => `${a} / ${c}` },
      onMove: () => undefined,
    })
    row.append(steps.element)
    plate.root.append(row)
    head(i, 'notches and named steps', 'arrow keys, play and pause; 44 px')
  }

  const placed = placeElements(plate.labels, asks, { taken, walls: [], bounds: { l: 0, t: 0, r: W, b: H }, mirror: dir === 'rtl' })
  rig.placed = placed.placed.map(p => ({ id: p.id, box: p.box, side: p.side }))
  says.textContent = `${framing} ${W}x${H}; ${samples.length} samples`
}

const rig = {
  ready: false,
  placed: [] as unknown[],
  state: () => ({ backend: 'dom', architecture: 'svg' }),
  samples: () => samples,
  tokens: () => Object.fromEntries(Object.keys(S).map(k => [k, { rgb: S[k as keyof typeof S], ratio: ratio(k as keyof typeof S) }])),
}
;(window as unknown as { __paper: typeof rig }).__paper = rig

let last = 0
function frame(now: number): void {
  const dt = last ? Math.min(0.1, (now - last) / 1000) : 0
  last = now
  steps?.update(dt)
  requestAnimationFrame(frame)
}
draw()
addEventListener('resize', draw)
requestAnimationFrame(frame)
await document.fonts.ready
draw()
rig.ready = true
