// A DATE STAYS WHOLE ON ITS LINE in every language the museum speaks: its day,
// month or season and year are bound with no-break spaces, in whatever words a
// catalog said them ("15 April 1452", "15. April 1452", "15 de abril de 1452",
// "15 април 1452 г.", "Herbst 1502"). The months are matched here, never
// translated. Display only; tested without a page (forge/keep-dates.test.mjs).

const MONTHS = [
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'januar', 'februar', 'märz', 'juni', 'juli', 'oktober', 'dezember',
  'janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
  'gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'dicembre',
  'enero', 'febrero', 'abril', 'mayo', 'junio', 'julio', 'septiembre', 'octubre', 'noviembre', 'diciembre',
  'janeiro', 'fevereiro', 'março', 'maio', 'junho', 'julho', 'setembro', 'outubro', 'novembro', 'dezembro',
  'януари', 'февруари', 'март', 'април', 'май', 'юни', 'юли', 'август', 'септември', 'октомври', 'ноември', 'декември',
]
// a season is a date's part only with its year after it ("Autumn 1502", "Otoño de 1502", "Есента на 1502 г.")
const SEASONS = [
  'spring', 'summer', 'autumn', 'winter', 'frühling', 'frühjahr', 'sommer', 'herbst',
  'printemps', 'été', 'automne', 'hiver', 'primavera', 'estate', 'autunno', 'inverno', 'verano', 'otoño', 'invierno', 'verão', 'outono',
  'пролетта', 'пролет', 'лятото', 'лято', 'есента', 'есен', 'зимата', 'зима',
]
const SPACE = '[ \\u00a0]'
const MONTH = `(?:${[...new Set(MONTHS)].sort((a, b) => b.length - a.length).join('|')})`
// a day with its ordinal mark (1er, 1º, 15.), the "de" set between the parts, a year with the Bulgarian "г."
const DAY = '(?<![\\p{L}\\p{N}.,])\\d{1,2}(?:er|º|ª|°|\\.)?'
const JOIN = `${SPACE}(?:de${SPACE})?`
const YEAR = `\\d{3,4}(?![\\p{L}\\p{N}])(?:${SPACE}г\\.)?`
const SEASON = `(?:${[...new Set(SEASONS)].sort((a, b) => b.length - a.length).join('|')})${SPACE}(?:(?:de|del|di|на)${SPACE})?${YEAR}`
const DATE = new RegExp(`(?:${DAY}${JOIN})?(?<![\\p{L}\\p{N}])${MONTH}(?![\\p{L}\\p{N}])(?:${JOIN}${YEAR})?|(?<![\\p{L}\\p{N}])${SEASON}|(?<![\\p{L}\\p{N}])\\d{3,4}${SPACE}г\\.`, 'giu')

/**
 * The text with every date in it bound into one unit.
 * @param {string} said
 * @returns {string}
 */
export function keepDates(said) {
  return said.replace(DATE, (date) => date.replace(/ /g, '\u00a0'))
}
