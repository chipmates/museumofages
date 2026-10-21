// A NAME'S PARTICLE STAYS WITH THE NAME it leads into, in every language the
// museum speaks: "Lisa del Giocondo", "Lorenzo de’ Medici", "Leonardo da
// Vinci", "Леонардо да Винчи" may break before the particle, never after it,
// as the site holds a long name by its last words. A particle binds only
// between two capitalised words, so an article or a preposition of running
// text stays free; "ser" and "il" (a notary's title, a byname's article: "ser
// Piero", "il Moro", "Сер Пиеро") bind to a capitalised word wherever they
// stand; a capital "Il" opens an Italian sentence and stays free. Display
// only; tested without a page (forge/keep-names.test.mjs).

const PARTICLES = new Set(["de'", 'de’', 'de', 'del', 'della', 'delle', 'dei', 'degli', 'da', 'dal', 'dalla', 'di', 'да', 'де', 'ди', 'дел', 'дела', 'деле'])
const TITLES = new Set(['ser', 'Ser', 'сер', 'Сер', 'il', 'ил'])
const capital = (word) => /^[«“"‘'(\[¿¡]*\p{Lu}/u.test(word.split(' ').pop() ?? '')
const leads = (word) => PARTICLES.has(word) || TITLES.has(word)

/**
 * The text with every name's particle bound to the word after it.
 * @param {string} said
 * @returns {string}
 */
export function keepNames(said) {
  if (!said.includes(' ')) return said
  const words = said.split(' ')
  const bind = words.map(() => false)
  // from the end, so a particle before a bound title ("di ser Piero") knows it leads into a name
  for (let i = words.length - 2; i >= 0; i--) {
    const word = words[i]
    if (!leads(word)) continue
    const next = words[i + 1]
    if (!capital(next) && !(bind[i + 1] && leads(next))) continue
    const before = words[i - 1]
    if (TITLES.has(word) || (before !== undefined && (capital(before) || leads(before)))) bind[i] = true
  }
  return words.reduce((text, word, i) => i === 0 ? word : text + (bind[i - 1] ? ' ' : ' ') + word, '')
}
