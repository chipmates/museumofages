/* THE GOLD'S NAME FITS ITS PILL. A name stands at the pill's own type on up
   to two rows; one that would take a third steps to the small type on two
   rows (data-rows 2), then breaks its long word there at a syllable
   (data-hyphens), and only then takes three rows, which grow the pill about
   the seats' centre line so each row keeps its air. A name the small type
   still sets in four rows grows the pill further, inside the foot row.
   Shared by the live wing's phone form and the film player's. */

const rowsOf = (name: HTMLElement): number =>
  Math.round(name.getBoundingClientRect().height / (parseFloat(getComputedStyle(name).lineHeight) || 18))

/** the pill's contents reach past its own right padding: a kept last pair
    wider than the room beside the arrow pushes the disc out of the pill */
function overruns(name: HTMLElement): boolean {
  const pill = name.parentElement
  if (!pill) return false
  const edge = pill.getBoundingClientRect().right - (parseFloat(getComputedStyle(pill).paddingRight) || 0)
  let reach = name.getBoundingClientRect().right
  for (const part of pill.children) {
    const box = part.getBoundingClientRect()
    if (box.width > 0) reach = Math.max(reach, box.right)
  }
  return reach > edge + 0.5
}

/** Read again wherever the name or the foot changes size. A name already read
    at this width stands, so the answer never reads itself, unless the pill it
    was read in has since changed and now cuts it. */
export function fitGoldName(name: HTMLElement): void {
  const width = name.closest<HTMLElement>('.film-foot')?.clientWidth ?? 0
  // hidden (the walking ring): read when it shows
  if (!width || !(name.getBoundingClientRect().height > 0)) return
  // a close look's pill reaches further than a rest's in the same foot: a name read in one is read again in the other
  const reach = name.parentElement ? getComputedStyle(name.parentElement).maxWidth : ''
  const key = `${name.textContent ?? ''}|${width}|${reach}`
  if (name.dataset['fit'] === key && (name.dataset['rows'] || rowsOf(name) <= 2) && !overruns(name)) return
  delete name.dataset['rows']
  delete name.dataset['loose']
  delete name.dataset['hyphens']
  // the kept pair parts where it cannot stand beside the arrow, so the name wraps before the disc
  if (name.querySelector('.film-keep') && overruns(name)) name.dataset['loose'] = 'true'
  if (rowsOf(name) > 2) {
    name.dataset['rows'] = '2'
    if (rowsOf(name) > 2) name.dataset['hyphens'] = 'true'
    if (rowsOf(name) > 2) {
      delete name.dataset['hyphens']
      name.dataset['rows'] = '3'
    }
    if (name.dataset['rows'] === '3' && rowsOf(name) > 3) name.dataset['rows'] = '4'
  }
  name.dataset['fit'] = key
}

/** Keeps the name fitted for the life of its form: a new name, a new width,
    the serif arriving after the first read. */
export function watchGoldName(name: HTMLElement, signal: AbortSignal): void {
  const watch = new ResizeObserver(() => requestAnimationFrame(() => fitGoldName(name)))
  watch.observe(name)
  signal.addEventListener('abort', () => watch.disconnect())
  void document.fonts?.ready.then(() => { delete name.dataset['fit']; fitGoldName(name) })
}
