import { keepDates } from '../keep-dates.mjs'

/* A LINE BREAKS WHERE A READER EXPECTS IT: a separator stays with the word
   before it, so no line starts with one, and a measure and a date stay whole
   ("177 × 151 cm", "15 April 1452"). Display only, and in no film key. */
export function keepTogether(said: string): string {
  return keepDates(said)
    .replace(/ (·) /g, ' $1 ')
    .replace(/(\d) ?× ?(\d)/g, '$1 × $2')
    .replace(/(\d) (cm|mm|m|km)\b/g, '$1 $2')
}

/** every text a shown part carries, kept together as above */
export function keepTogetherIn(root: Node): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const said = node.nodeValue ?? ''
    const kept = keepTogether(said)
    if (kept !== said) node.nodeValue = kept
  }
}
