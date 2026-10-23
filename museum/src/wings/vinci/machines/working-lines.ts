/** A machine whose label is still a working line: the bench shows it in place
 * of the locked first line and marks it as working, until the words are
 * written. */
export const WORKING_LINES: Partial<Record<string, { en: string; de: string }>> = {
  'aerial-screw': {
    en: 'Our reconstruction from Manuscript B, folio 83 verso. Every size but the radius is ours.',
    de: 'Unsere Rekonstruktion nach Manuskript B, Blatt 83 verso. Alle Maße außer dem Radius sind unsere.',
  },
  'parachute': {
    en: 'Our reconstruction from the Codex Atlanticus, folio 1058 verso. Every size but the cloth\'s is ours.',
    de: 'Unsere Rekonstruktion nach dem Codex Atlanticus, Blatt 1058 verso. Alle Maße außer denen des Tuchs sind unsere.',
  },
  'mechanical-lion': {
    en: 'Our reconstruction from the old accounts. No drawing of it survives; its works are ours.',
    de: 'Unsere Rekonstruktion nach den alten Berichten. Keine Zeichnung des Löwen ist erhalten; sein Werk im Inneren ist unseres.',
  },
}
