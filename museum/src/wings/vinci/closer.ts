/* A CLOSER LOOK AT A STOP: the room's own plate, flat and whole, in the deep
   viewer the paintings already open into. A stop carries one where its data
   holds one record; the record names the stop it belongs to, its states in
   order (each a plate in the store and its pyramid), the words per state and
   per depth, the card's sentences and the places worth framing.

   Every displayed word is the card data's (`cards.json`, controls.closer and
   one group per record). They are working lines until the writer seat words
   them; the one line a record holds itself is marked where it stands. */

import cardsRaw from './data/cards.json?raw'
import type { VinciCertainty, VinciText } from './content'

type Group = Record<string, VinciText>
const CONTROLS = (JSON.parse(cardsRaw) as { controls: Record<string, Group | undefined> }).controls
const word = (group: string, key: string): VinciText => CONTROLS[group]?.[key] ?? { en: '', de: '' }

/** what the view says for one state, by how deep it stands */
export interface CloserLines {
  /** while the view shows most of the plate's width (the deep plate's own band) */
  whole: VinciText
  /** nearer than that, short of the ceiling */
  near: VinciText
  /** at the source's own pixels, where the view goes no closer */
  ceiling: VinciText
}

/** ONE STATE OF THE PLACE: a plate in the store, cut into its own pyramid */
export interface CloserState {
  id: string
  /** the store's record of the plate, and of the pyramid cut from it */
  plate: string
  tiles: string
  /** the state's name where both stand side by side */
  word: VinciText
  /** the one toggle names the state it turns to, so this is said while the other stands */
  turn: VinciText
  /** in the clock's place of the name row */
  date: VinciText
  certainty: VinciCertainty
  lines: CloserLines
  /** the card's sentence that differs by state */
  sentence: VinciText
  /** the deepest the view goes, in screen pixels per pixel of the plate; absent, the plate's own pixels (1) */
  deepest?: number
}

/** A PLACE WORTH FRAMING, in fractions of the plate from its top left; a
    place whose words run sideways turns the view by `turn` degrees, clockwise */
export interface CloserPlace {
  id: string
  name: VinciText
  x: number
  y: number
  w: number
  h: number
  turn?: number
  /** the states whose picture shows the place as named; absent, every state */
  states?: readonly string[]
}

export interface CloserLook {
  /** the look's own id, which the film's close look answers by its kind */
  id: string
  /** the story stop it belongs to */
  stop: string
  /** the room the one step back returns to */
  room: VinciText
  /** the look's own name */
  name: VinciText
  /** the drawer's word */
  more: VinciText
  /** what the plate shows, for a visitor who cannot see it */
  describe: VinciText
  states: readonly CloserState[]
  /** the card's sentences in order; null is the standing state's own */
  card: readonly (VinciText | null)[]
  placesHead: VinciText
  places: readonly CloserPlace[]
  /** further reading, each with the language it is written in */
  reading: readonly { label: VinciText; href: string; lang: string }[]
  readingHead: VinciText
  /** true while every line above is a working line, before the writer seat */
  working: boolean
}

/** the words every closer look shares */
export const CLOSER_WORDS = {
  open: word('closer', 'open'),
  showing: word('closer', 'showing'),
  locator: word('closer', 'locator'),
  places: word('closer', 'places'),
}

const asse = (key: string): VinciText => word('closer_asse', key)
const ASSE_ROOM = 'sala-delle-asse'
/** A WORKING LINE THE RECORD HOLDS ITSELF, for the writer to word into the
    card data: the drawn rope does not follow the design up close, so the
    1498 near line claims the trees and the arms, and calls the rope ours */
const ASSE_NEAR_1498_HELD: VinciText = { en: 'Trees and arms as designed, the rope by us.', de: 'Bäume, Wappen nach Entwurf, Seil von uns.' }

/* THE SALA DELLE ASSE, the first. About 1498 is our drawing in code, after
   the layout the 1902 repaint keeps; 2012 is the photograph before the
   current restoration. Both plates stand in the same pixel frame, so a place
   is one rectangle in either. */
const ASSE: CloserLook = {
  id: `closer/${ASSE_ROOM}-vault`,
  // the castle route's stop id; the record attaches when that stop enters the story
  stop: 'asse',
  room: asse('room'),
  name: asse('name'),
  more: asse('more'),
  describe: asse('describe'),
  states: [
    { id: '1498', plate: `vinci/room-plate/${ASSE_ROOM}-vault-1498`, tiles: `vinci/room-tiles/${ASSE_ROOM}-vault-1498`,
      word: asse('state_1498'), turn: asse('turn_1498'), date: asse('date_1498'), certainty: 'reconstructed',
      lines: { whole: asse('whole_1498'), near: ASSE_NEAR_1498_HELD, ceiling: asse('ceiling_1498') }, sentence: asse('card_1498'),
      // one level short of the plate's own pixels, where the drawn rope loops: the plate that passes its 1:1 check lifts it to 1
      deepest: 0.5 },
    { id: '2012', plate: `vinci/room-plate/${ASSE_ROOM}-vault-2012`, tiles: `vinci/room-tiles/${ASSE_ROOM}-vault-2012`,
      word: asse('state_2012'), turn: asse('turn_2012'), date: asse('date_2012'), certainty: 'documented',
      lines: { whole: asse('whole_2012'), near: asse('near_2012'), ceiling: asse('ceiling_2012') }, sentence: asse('card_2012') },
  ],
  card: [asse('card_trees'), asse('card_rope'), asse('card_arms'), null, asse('card_finished')],
  placesHead: CLOSER_WORDS.places,
  places: [
    { id: 'arms', name: asse('look_arms'), x: 0.462, y: 0.462, w: 0.076, h: 0.076 },
    // the drawn rope frames no knot yet: held back from 1498 until its plate passes its 1:1 check
    { id: 'knot', name: asse('look_knot'), x: 0.465, y: 0.335, w: 0.06, h: 0.06, states: ['2012'] },
    // the east tablet's words run from its foot to its head on the flat plate
    { id: 'tablet', name: asse('look_tablet'), x: 0.72, y: 0.44, w: 0.15, h: 0.12, turn: 90 },
  ],
  reading: [{ label: asse('reading'), href: 'https://artsandculture.google.com/story/gQUBKyCtSfxSIw', lang: 'en' }],
  readingHead: asse('reading_head'),
  working: true,
}

const CLOSER_LOOKS: readonly CloserLook[] = [ASSE]

/** every closer look the wing carries */
export function closerLooks(): readonly CloserLook[] {
  return CLOSER_LOOKS
}

/** the closer look a stop carries, or null */
export function closerAtStop(stop: string): CloserLook | null {
  return CLOSER_LOOKS.find(look => look.stop === stop) ?? null
}

/** a closer look by its own id, or null */
export function closerById(id: string): CloserLook | null {
  return CLOSER_LOOKS.find(look => look.id === id) ?? null
}
