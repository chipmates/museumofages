/* THE WALK'S OWN CONTROLS, shared by every wing that walks. While the eye
   walks, the words' place says where it goes ("Walking to"), with the one
   way to arrive at once and, under it, one short tip; beside the gold stands
   the hold, which stops the walk at its frame and frees it again. A wing hands
   the place's name and its picture's hold and skip; where each part stands is
   the form's own stylesheet's.

   · ONE TIP A WALK, each once a visit, four at most, never at a stop
     (walk-rules.mjs nextTip); gone when the walk arrives or on a press.
   · THE KEYS' HINT, once a visit: a key, a drag or the wheel a guided walk does
     not answer is told what it does instead, in the tip's place while the eye
     walks, over the line at rest, gone after a few seconds or on a press.
   · ONCE A VISIT is a flag for the open tab; a store that refuses counts by
     the page load. */

import { langTag, lang, say } from './content'
import { WALK_WORDS } from './walk-words'
import { nextTip, type WalkTip } from './walk-rules.mjs'
import css from './walk-controls.css?inline'

/** the stylesheet a wing mounts beside its own */
export const WALK_CONTROLS_CSS = css

export type WalkForm = 'desk' | 'upright' | 'cinema'

export interface WalkPanelHost {
  form(): WalkForm
  /** the name of the place the walk goes to; '' where it has none */
  to(): string
  held(): boolean
  hold(): void
  goOn(): void
  skip(): void
  /** the turn's own words where this glass can turn (an upright phone in a hand), else null */
  sideways(): string | null
  /** a close look has been opened this visit */
  looked(): boolean
}

export interface WalkPanel {
  /** the words' place while the eye walks: where to, the tip, the skip */
  readonly element: HTMLElement
  /** the hold, which the form stands beside its gold (a phone's form shows it while the walk moves) */
  readonly hold: HTMLButtonElement
  /** a walk began; `toStop` a walk between stops, which may carry a tip */
  began(toStop: boolean): void
  /** the walk arrived, or was cut short */
  ended(): void
  /** the place's name, the hold's state and the words again */
  paint(): void
  /** the keys' hint, once a visit: over `line` at rest, in the tip's place while the eye walks;
      `touch` a finger's drag, which is told the way on alone */
  hint(line: HTMLElement | null, touch?: boolean): void
  dispose(): void
}

const SVG = 'http://www.w3.org/2000/svg'
const HOLD_ICON = 'M5.5 3.5v9M10.5 3.5v9'
const ON_ICON = 'M5 3.2l7.6 4.8L5 12.8z'
const TURN_ICON = 'M5.2 2.8h5.6c.6 0 1 .4 1 1v8.4c0 .6-.4 1-1 1H5.2c-.6 0-1-.4-1-1V3.8c0-.6.4-1 1-1zM13.8 7.2a5.6 5.6 0 0 0-2-3.6M2.2 8.8a5.6 5.6 0 0 0 2 3.6'
/** how long the keys' hint stands without a press */
const HINT_MS = 6000

const TIPS_FLAG = 'walk-tips'
const HINT_FLAG = 'walk-hint'
let tipsThisLoad: string[] = []
let hintThisLoad = false
function tipsShown(): string[] {
  try {
    const kept = sessionStorage.getItem(TIPS_FLAG)
    return kept ? kept.split(',').filter(Boolean) : tipsThisLoad
  } catch { return tipsThisLoad }
}
function markTip(tip: WalkTip): void {
  tipsThisLoad = [...new Set([...tipsShown(), tip])]
  try { sessionStorage.setItem(TIPS_FLAG, tipsThisLoad.join(',')) } catch { /* the page load's own list holds it */ }
}
/** a tip the hint took the place of before it was read is kept for a later walk */
function unmarkTip(tip: WalkTip): void {
  tipsThisLoad = tipsShown().filter(shown => shown !== tip)
  try { sessionStorage.setItem(TIPS_FLAG, tipsThisLoad.join(',')) } catch { /* the page load's own list holds it */ }
}
function hintShown(): boolean {
  if (hintThisLoad) return true
  try { return sessionStorage.getItem(HINT_FLAG) === '1' } catch { return false }
}
function markHint(): void {
  hintThisLoad = true
  try { sessionStorage.setItem(HINT_FLAG, '1') } catch { /* the page load's own flag holds it */ }
}

/** a key's sign never ends a row apart from the word it goes with */
const bindKeys = (text: string): string => text.replace(/([←→‖]) /g, '$1\u00a0')

/* A TIP OR HINT THAT WRAPS BREAKS BETWEEN ITS SENTENCES: each sentence is a
   box of its own, so a narrow place never ends a row on "Or". A sign stands
   in a column of its own before the words, so a wrapped row starts under the
   words and not under the sign. */
function sentences(into: HTMLElement, text: string, sign?: SVGSVGElement): void {
  const words = sign ? make('span', 'walk-tip-words') : into
  if (sign) into.append(sign, words)
  text.split(/(?<=[.?!…])\s+(?=\S)/u).forEach((sentence, i) => {
    if (i) words.append(' ')
    words.append(make('span', 'walk-tip-part', sentence))
  })
}

/** the element whose ground the line stands on: itself or the nearest box under it that paints one */
function groundOf(line: HTMLElement): HTMLElement | null {
  for (let at: HTMLElement | null = line; at; at = at.parentElement) {
    const paint = getComputedStyle(at).backgroundColor
    if (paint && paint !== 'transparent' && !/(,\s*0\)|\/\s*0\))$/.test(paint)) return at
  }
  return null
}

function icon(path: string, cls: string): SVGSVGElement {
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('viewBox', '0 0 16 16')
  svg.setAttribute('class', cls)
  svg.setAttribute('aria-hidden', 'true')
  const line = document.createElementNS(SVG, 'path')
  line.setAttribute('d', path)
  svg.append(line)
  return svg
}
const make = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, value?: string): HTMLElementTagNameMap[K] => {
  const node = document.createElement(tag)
  node.className = cls
  if (value !== undefined) node.textContent = value
  return node
}

export function createWalkPanel(host: WalkPanelHost, signal: AbortSignal): WalkPanel {
  const element = make('div', 'walk-panel')
  element.hidden = true
  const to = make('p', 'walk-to')
  // the place is said once as the walk begins; the tip under it stays quiet
  to.setAttribute('role', 'status')
  const kicker = make('span', 'walk-to-kicker')
  const name = make('span', 'walk-to-name')
  to.append(kicker, name)
  const tip = make('p', 'walk-tip')
  tip.hidden = true
  const ways = make('div', 'walk-ways')
  const skip = make('button', 'walk-skip')
  skip.type = 'button'
  skip.addEventListener('click', () => host.skip())
  ways.append(skip)
  element.append(to, tip, ways)

  const hold = make('button', 'walk-hold')
  hold.type = 'button'
  const holdIcon = icon(HOLD_ICON, 'walk-ic')
  const holdWord = make('span', 'walk-hold-word')
  hold.append(holdIcon, holdWord)
  hold.addEventListener('click', () => { if (host.held()) host.goOn(); else host.hold() })

  let walking = false
  let tipNow: WalkTip | 'hint' | null = null
  let hintTimer = 0
  let hintTouch = false
  let restHint: { line: HTMLElement; words: HTMLElement } | null = null

  function tipWords(which: WalkTip | 'hint'): string {
    if (which === 'hint') return bindKeys(say(hintTouch ? WALK_WORDS.hintTouch : WALK_WORDS.hint))
    if (which === 'keys') return bindKeys(say(host.form() === 'desk' ? WALK_WORDS.tipKeys : WALK_WORDS.tipKeysTouch))
    if (which === 'plan') return say(WALK_WORDS.tipPlan)
    if (which === 'look') return say(WALK_WORDS.tipLook)
    return host.sideways() ?? ''
  }
  function paintTip(): void {
    /* HELD, THE TIP'S ROW NAMES THE STATE, so it is no empty gap; a hint asked
       meanwhile stands there for its seconds. After the hold the row keeps its
       room unseen, so nothing moves when the walk goes on. */
    if (walking && host.held() && tipNow !== 'hint') {
      // the row keeps the room the tip had, so nothing over it or beside it moves (a card sideways is as wide as its widest row)
      if (!tip.hidden && tip.dataset['held'] === undefined) Object.assign(tip.style, { minHeight: `${tip.offsetHeight}px`, minWidth: `${tip.offsetWidth}px` })
      tip.textContent = say(WALK_WORDS.paused)
      tip.lang = langTag(lang())
      tip.dataset['tip'] = 'paused'
      tip.dataset['held'] = ''
      tip.dataset['gone'] = ''
      tip.hidden = false
      return
    }
    delete tip.dataset['held']
    // the turn's tip is gone once the phone stands sideways
    if (tipNow === 'sideways' && !host.sideways()) tipNow = null
    // a tip a press took away keeps its room, unseen, until the walk ends
    if (!tipNow && tip.dataset['gone'] !== undefined) return
    tip.textContent = ''
    Object.assign(tip.style, { minHeight: '', minWidth: '' })
    if (!tipNow) { tip.hidden = true; return }
    delete tip.dataset['gone']
    // the turn's tip carries the turning phone before its words
    sentences(tip, tipWords(tipNow), tipNow === 'sideways' ? icon(TURN_ICON, 'walk-ic walk-turn') : undefined)
    tip.lang = langTag(lang())
    tip.dataset['tip'] = tipNow
    tip.hidden = false
  }
  function clearTip(): void {
    tipNow = null
    clearTimeout(hintTimer)
    delete tip.dataset['gone']
    paintTip()
  }
  function clearRestHint(): void {
    if (!restHint) return
    restHint.words.remove()
    delete restHint.line.dataset['walkHinted']
    restHint = null
    clearTimeout(hintTimer)
  }
  /** a tip a press took away keeps its room until the walk ends, so nothing moves under the hand */
  function fadeTip(): void {
    tipNow = null
    clearTimeout(hintTimer)
    if (!tip.hidden) tip.dataset['gone'] = ''
  }
  /* A PRESS ANYWHERE TAKES THE TIP AND THE HINT AWAY, after the press that
     brought the hint: the next one, not this one */
  const pressed = (): void => { if (tipNow) { fadeTip(); paintTip() } clearRestHint() }
  addEventListener('pointerdown', pressed, { capture: true, signal })
  addEventListener('keydown', e => { if (!/^[wasd]$/i.test(e.key)) pressed() }, { capture: true, signal })

  function paint(): void {
    kicker.textContent = say(WALK_WORDS.walkingTo)
    name.textContent = host.to()
    name.hidden = !name.textContent
    skip.textContent = say(WALK_WORDS.skip)
    const held = host.held()
    hold.setAttribute('aria-label', say(held ? WALK_WORDS.walkOn : WALK_WORDS.pause))
    hold.setAttribute('aria-pressed', String(held))
    holdWord.textContent = say(held ? WALK_WORDS.walkOn : WALK_WORDS.pause)
    holdIcon.querySelector('path')?.setAttribute('d', held ? ON_ICON : HOLD_ICON)
    hold.dataset['held'] = String(held)
    element.dataset['held'] = String(held)
    element.lang = langTag(lang())
    paintTip()
  }

  return {
    element,
    hold,
    began(toStop) {
      clearRestHint()
      walking = true
      element.hidden = false
      if (toStop && tipNow !== 'hint') {
        const next = nextTip({ shown: tipsShown(), upright: host.sideways() !== null, looked: host.looked() })
        // a tip whose words the wing cannot say is passed over and kept for no later walk
        if (next) { markTip(next); tipNow = tipWords(next) ? next : null }
      }
      paint()
    },
    ended() {
      walking = false
      element.hidden = true
      clearTip()
    },
    paint,
    hint(line, touch = false) {
      if (hintShown() || signal.aborted) return
      markHint()
      hintTouch = touch
      clearTimeout(hintTimer)
      if (walking || !line) {
        if (tipNow && tipNow !== 'hint') unmarkTip(tipNow)
        tipNow = 'hint'
        paintTip()
        hintTimer = window.setTimeout(() => { if (tipNow === 'hint') { fadeTip(); paintTip() } }, HINT_MS)
        return
      }
      /* AT REST THE HINT STANDS IN THE LINE'S PLACE for its few seconds, so one
         text stands at a time: on the line's own ground, at its own inset */
      const box = line.getBoundingClientRect()
      const words = make('p', 'walk-hint-rest')
      sentences(words, tipWords('hint'))
      words.lang = langTag(lang())
      words.setAttribute('role', 'status')
      const own = getComputedStyle(line)
      const ground = groundOf(line)
      const seen = ground ? getComputedStyle(ground) : null
      Object.assign(words.style, {
        left: `${Math.round(box.left)}px`, top: `${Math.round(box.top)}px`, width: `${Math.round(box.width)}px`, minHeight: `${Math.round(box.height)}px`,
        padding: own.padding, borderRadius: ground === line ? own.borderRadius : '',
        backgroundColor: seen?.backgroundColor ?? '', backdropFilter: seen?.backdropFilter ?? '',
      })
      line.dataset['walkHinted'] = ''
      line.after(words)
      restHint = { line, words }
      hintTimer = window.setTimeout(clearRestHint, HINT_MS)
    },
    dispose() {
      clearTimeout(hintTimer)
      clearRestHint()
      element.remove()
      hold.remove()
    },
  }
}
