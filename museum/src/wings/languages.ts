/* THE LANGUAGES A PAGE CAN BE READ IN, and which of them a build publishes.
   English and German are the wing's own and always published; another
   language shows only once the build names it (`VITE_NA_LANGS=en,de,fr`), so
   a language still under work never appears.

   No import with a value: the build's own step reads this file too. */

import type { PageLang } from './content'

/** every language in the order a list of them stands */
export const LANGUAGES: readonly PageLang[] = ['en', 'de', 'fr', 'it', 'es', 'pt-BR', 'bg']

/** each language by its own name, as the site's switcher names it */
export const OWN_NAMES: Readonly<Record<PageLang, string>> = {
  en: 'English', de: 'Deutsch', fr: 'Français', it: 'Italiano', es: 'Español', 'pt-BR': 'Português (Brasil)', bg: 'Български',
}

/** the languages a build's setting publishes, English and German first */
export function publishedLangs(setting: unknown): PageLang[] {
  const named = typeof setting === 'string' ? setting.split(',').map(code => code.trim().toLowerCase()) : []
  return LANGUAGES.filter(code => code === 'en' || code === 'de' || named.includes(code.toLowerCase()))
}
