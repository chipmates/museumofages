/** A machine whose label is still a working line: the bench shows it in place
 * of the locked first line and marks it as working, until the words are
 * written. */
export const WORKING_LINES: Partial<Record<string, { en: string; de: string }>> = {
  'aerial-screw': {
    en: 'Our reconstruction from Manuscript B, folio 83 verso. The sheet gives one size, the radius. Every other size is ours.',
    de: 'Unsere Rekonstruktion nach Manuskript B, Blatt 83 verso. Das Blatt nennt ein Maß, den Radius. Alle anderen stammen von uns.',
  },
  'mechanical-lion': {
    en: 'Our reconstruction from old accounts. No drawing survives, so its works are ours.',
    de: 'Unsere Rekonstruktion nach alten Berichten. Keine Zeichnung ist erhalten, darum stammt sein Räderwerk von uns.',
  },
}
