import { keepDates } from '../keep-dates.mjs'
import { keepNames } from '../keep-names.mjs'

/* A LINE BREAKS WHERE A READER EXPECTS IT: a separator stays with the word
   before it, so no line starts with one, a measure and a date stay whole
   ("177 × 151 cm", "15 April 1452"), an ordinal keeps its word ("19. Jahrhundert",
   so no line ends on "19." as a sentence would), and a name keeps its particle
   ("da Vinci"). Display only, and in no film key. */
export function keepTogether(said: string): string {
  return keepNames(keepDates(said))
    .replace(/ (·) /g, ' $1 ')
    .replace(/(\d) ?× ?(\d)/g, '$1 × $2')
    .replace(/(\d) (cm|mm|m|km)\b/g, '$1 $2')
    .replace(/(?<![\p{L}\p{N}.,])(\d{1,2}\.) (?=\p{L})/gu, '$1\u00a0')
}

/** every text a shown part carries, kept together as above */
export function keepTogetherIn(root: Node): void {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    // preformatted text (the hour's arithmetic) keeps its own spaces
    if (node.parentElement?.closest('pre')) continue
    const said = node.nodeValue ?? ''
    const kept = keepTogether(said)
    if (kept !== said) node.nodeValue = kept
  }
}
