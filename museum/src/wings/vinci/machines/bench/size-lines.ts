/** A machine whose sheet gives some of its sizes: the bench prints its own
 * badge and size line in place of the shared "assumed dimensions" badge and
 * the envelope's numbers, so the size he wrote is said to be his. Working
 * lines until the words are written. */
export const BENCH_SIZE_LINES: Partial<Record<string, { badge: { en: string; de: string }; size: { en: string; de: string } }>> = {
  'parachute': {
    badge: { en: 'Reconstructed · his size, our making', de: 'Rekonstruiert · Maß von ihm, Bau von uns' },
    size: {
      en: 'His note: the cloth 12 braccia a side and 12 high (about 7 m)',
      de: 'Seine Notiz: das Tuch 12 Braccia je Seite und 12 hoch (etwa 7 m)',
    },
  },
}
