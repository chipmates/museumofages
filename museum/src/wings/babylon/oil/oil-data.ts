/* FEATURE 2'S FACTS, each with its holder (TARGETS-W2A feature 2). The tablet
   is VAT 16378 in the holder's own photograph; the amounts are the lists'
   lines as ANET quotes them (lists 1 to 3), never this tablet's own; only
   their proportions follow the text, so the unit is a square, never a vessel,
   and no litre appears. The lands are the names the lists give. */

/** VAT 16378 as the holder measures it, in centimetres (the holder's numbers win over 9.2 by 10.5) */
export const TABLET = { h: 9.8, w: 10.6 } as const

/** THE HOLDER'S PHOTOGRAPH as a file: its pixel size, the tablet's box in it (measured on the black ground, the credit
    strip under y 1173 left out) and its scale, the mean of the tablet's width and height against the holder's numbers
    (96.1 and 92.8 px a centimetre; the two differ by 3.6 percent, a fragment photographed square on) */
export const PHOTO = {
  w: 1173, h: 1200,
  tablet: { l: 77, t: 155, r: 1096, b: 1064 },
  pxPerCm: (1019 / TABLET.w + 909 / TABLET.h) / 2,
  credit: 'Staatliche Museen zu Berlin, Vorderasiatisches Museum / Olaf M. Teßmer CC BY-SA 4.0',
} as const

/** a CSS centimetre: 96 px to the inch, the screen's own nominal size */
export const CSS_CM = 96 / 2.54

/** THE AMOUNTS in sila, as the lists name them; the sons' 2½ is one total, never split per son */
export const ROWS = [
  { id: 'king', sila: 10, land: 'judah' },
  { id: 'sons', sila: 2.5, land: 'judah' },
  { id: 'men', sila: 4, land: 'judah' },
  { id: 'carpenter', sila: 0.5, land: 'arvad' },
] as const
export type RowId = typeof ROWS[number]['id']

/** twenty of the carpenter's halves fill the king's row: our arithmetic on the text's numbers */
export const HALVES = 20

/** THE LANDS the lists name, and Babylon, where they were written; Lydia is restored ("Ly[dian]").
    Each dot stands at the land's chief place to the map's scale (about 0.2 degrees): Judah in Jerusalem's hills, the
    three cities of the coast where the towns stand today, Lydia at Sardis, Egypt at the head of the Nile's delta;
    Babylon at the walk's own centre (map-plan.json, UTM 38N, 445660 E, 3600400 N). Positions from general
    geography, not from a record row. */
export const LANDS = [
  { id: 'judah', lon: 35.2, lat: 31.75, restored: false },
  { id: 'tyre', lon: 35.2, lat: 33.27, restored: false },
  { id: 'byblos', lon: 35.65, lat: 34.12, restored: false },
  { id: 'arvad', lon: 35.86, lat: 34.86, restored: false },
  { id: 'lydia', lon: 28.04, lat: 38.49, restored: true },
  { id: 'egypt', lon: 31.2, lat: 30.1, restored: false },
  { id: 'babylon', lon: 44.42, lat: 32.54, restored: false },
] as const
export type LandId = typeof LANDS[number]['id']

/** the map's frame: the lands' box with room for their names, and the parallel its scale is true on */
export const MAP = { w: 26.6, s: 28.6, e: 46.4, n: 39.9, lat0: 34 } as const

export interface Coasts { coasts: [number, number][][]; rivers: { name: string; line: [number, number][] }[] }
