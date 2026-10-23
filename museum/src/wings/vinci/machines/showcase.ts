/** The machines built to showcase, one at a time, before they have a place
 * in the wing. They stand on the bench only: the hall, the film and the
 * wing's lists read the fifteen of `MACHINE_SLUGS` and never these. */
import type { Dossier } from './types'
import type { EvidenceRecord, Language } from './catalog'
import flyingJson from './data/flying-machine.json?raw'
import bridgeJson from './data/bridge-of-poles.json?raw'

export const SHOWCASE_SLUGS = ['flying-machine', 'bridge-of-poles'] as const
export type ShowcaseSlug = (typeof SHOWCASE_SLUGS)[number]
export function isShowcaseSlug(value: string): value is ShowcaseSlug {
  return (SHOWCASE_SLUGS as readonly string[]).includes(value)
}

interface ShowcaseDossier extends Dossier {
  record: {
    title: Record<Language, string>
    label: Record<Language, string>
    arithmetic: Record<Language, string>
    sections: Record<Language, { title: string; body: string }[]>
  }
}
export interface ShowcaseRecord extends EvidenceRecord { slug: ShowcaseSlug; dossier: Dossier }

/** The record is the construction document's own: no locked page stands behind it yet. */
function recordOf(slug: ShowcaseSlug, raw: string): ShowcaseRecord {
  const dossier = JSON.parse(raw) as ShowcaseDossier
  const page = (lang: Language): string => [`# ${dossier.record.title[lang]}`, dossier.record.label[lang],
    ...dossier.record.sections[lang].map(s => `## ${s.title}\n\n${s.body}`)].join('\n\n')
  return {
    slug, status: dossier.status, dossier,
    title: dossier.record.title, label: dossier.record.label, arithmetic: dossier.record.arithmetic,
    page: { en: page('en'), de: page('de') },
    sections: dossier.record.sections,
    folio: dossier.folio, scope: dossier.scope, gaps: [...dossier.gaps],
    sourcePath: `src/wings/vinci/machines/data/${slug}.json`, sourceSha256: '',
    pageSourcePath: '', pageSourceSha256: '',
  }
}

export const showcaseCatalog: Record<ShowcaseSlug, ShowcaseRecord> = {
  'flying-machine': recordOf('flying-machine', flyingJson),
  'bridge-of-poles': recordOf('bridge-of-poles', bridgeJson),
}
