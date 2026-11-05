/* FEATURE 10'S FACTS, each with its holder. Positions are UTM 38N metres (E, N) as `map/map-plan.json` gives them and
   the stop's sizes as `bridge/bridge-plan.json` gives them; a test holds every copy here equal to its plan. Today's
   banks and the road come from `forge/babylon/river-today.py` (the 2004 ASTER picture, registered by two landmarks);
   they are one picture of one day, never a measured line, and no distance between the states is ever computed for a
   word. */

export type P2 = readonly [number, number]

/** THE BRIDGE (map-plan.json bridge): the axis from its east end at the quay to its west end, piers along it */
export const BRIDGE = {
  axis: [[445569.5, 3599843.1], [445398, 3599828]] as readonly P2[],
  piers: { count: 6, along: 9, across: 21, gap: 9, first: 57.64 },
  /** the land piers along the axis (t from the east end), across the axis in metres */
  abutments: { east: { from: -0.3, to: 40.64, across: 15 }, west: { from: 166.64, to: 174.24, across: 13.6 } },
  /** a pier's waterline outline: u along the axis, v toward the north (the bow faces the current) */
  outline: [[0.0, 10.5], [0.587, 9.869], [1.222, 9.099], [1.824, 8.266], [2.372, 7.39], [2.862, 6.481], [3.29, 5.543], [3.655, 4.582], [3.955, 3.599], [4.191, 2.598], [4.361, 1.581], [4.465, 0.547], [4.5, -0.5], [4.5, -6.45], [4.422, -8.951], [4.194, -9.416], [3.84, -9.801], [3.394, -10.072], [2.9, -10.208], [2.32, -10.313], [1.74, -10.395], [1.16, -10.453], [0.58, -10.488], [0.0, -10.5], [-0.58, -10.488], [-1.16, -10.453], [-1.74, -10.395], [-2.32, -10.313], [-2.9, -10.208], [-3.394, -10.072], [-3.84, -9.801], [-4.194, -9.416], [-4.422, -8.951], [-4.5, -6.45], [-4.5, -0.5], [-4.465, 0.547], [-4.361, 1.581], [-4.191, 2.598], [-3.955, 3.599], [-3.655, 4.582], [-3.29, 5.543], [-2.862, 6.481], [-2.372, 7.39], [-1.824, 8.266], [-1.222, 9.099], [-0.587, 9.869]] as readonly P2[],
} as const

/** THE DECK (bridge-plan.json deck.w): 9 m wide, from the quay to the west land pier's end; Guessed */
export const DECK_W = 9.0

/** THE QUAY of about 570 BC (map-plan.json walls arahtu-quay; arahtu-quay-2 and river-wall-south south of the bridge),
    each line the wall's middle, its water face to the west; its thickness (bridge-plan.json quay). The quay's two
    stairways stand 430 m north of the bridge, past the map's frame (at the scale that holds them they would be a
    pixel wide): the list may name them, the plate does not draw them */
export const QUAY = {
  north: [[445492.62, 3600585.01], [445492.92, 3600505.03], [445495.12, 3600405.04], [445496.72, 3600245.23], [445537.48, 3600005.49], [445566.47, 3599865.53], [445567.85, 3599858.84]] as readonly P2[],
  south: [[445574.15, 3599828.42], [445576.82, 3599815.53], [445590, 3599525], [445784, 3599262], [445934, 3599110]] as readonly P2[],
  thick: 5.25,
} as const

/** THE RIVER OF ABOUT 570 BC (map-plan.json water euphrates), its whole outline; its west side from the point after
    the southmost turn; the west bank is drawn there, never dug (bridge-plan.json westBank, from N to N) */
export const RIVER_570 = {
  poly: [[445905, 3603800], [445905, 3602100], [445800, 3602045], [445695, 3601800], [445558, 3601450], [445454, 3601170], [445452, 3600905], [445349, 3600894], [445374, 3600598], [445489.5, 3600600], [445489.4, 3600607], [445497, 3600607], [445497, 3600587], [445490.0, 3600586], [445490.3, 3600505], [445492.5, 3600405], [445494.1, 3600245], [445534.9, 3600005], [445563.9, 3599865], [445568.9, 3599841], [445574.21, 3599815.2], [445587.41, 3599524.08], [445782.0, 3599260.29], [445932.13, 3599108.16], [445980, 3598900], [446120, 3598600], [446300, 3598300], [446100, 3598300], [445936, 3598701], [445612, 3599300], [445522, 3599525], [445404.5, 3599812], [445401.8, 3599846], [445343, 3600200], [445300, 3600400], [445275, 3600560], [445260, 3600750], [445248, 3600965], [445300, 3601150], [445420, 3601430], [445560, 3601780], [445670, 3602020], [445785, 3602100], [445785, 3603800]] as readonly P2[],
  westFrom: 27,
  westBank: { from: 3599380, to: 3600380 },
} as const

/** TODAY (river-today.py on the ASTER picture of 20 October 2004): the channel's two banks and the road in the old bed */
export const TODAY = {
  west: [[444895.6, 3600641.6], [444873.0, 3600584.9], [444859.5, 3600511.2], [444805.7, 3600384.1], [444789.5, 3600295.8], [444792.9, 3600264.7], [444823.3, 3600198.2], [444850.3, 3600162.8], [445014.0, 3600026.2], [445184.3, 3599842.7], [445217.4, 3599791.0], [445251.2, 3599693.4], [445248.7, 3599480.8], [445255.8, 3599403.4], [445247.7, 3599359.2]] as readonly P2[],
  east: [[444974.9, 3600642.3], [444907.1, 3600472.1], [444864.1, 3600403.8], [444847.2, 3600361.3], [444855.0, 3600238.1], [444876.1, 3600203.8], [444909.0, 3600167.3], [445036.8, 3600067.7], [445090.6, 3600012.1], [445182.8, 3599934.3], [445239.7, 3599863.0], [445281.9, 3599794.3], [445306.5, 3599728.9], [445312.8, 3599697.3], [445313.3, 3599666.8], [445305.2, 3599622.6], [445310.3, 3599484.7], [445308.8, 3599393.6], [445303.4, 3599364.2]] as readonly P2[],
  road: [[445435.6, 3600291.3], [445417.7, 3600104.3], [445407.6, 3599979.4], [445405.4, 3599878.2], [445416.0, 3599749.5], [445451.0, 3599628.9], [445482.0, 3599521.7], [445527.6, 3599424.5], [445575.5, 3599339.6], [445633.3, 3599240.1]] as readonly P2[],
} as const

/** THE DIG of August 1910 to February 1911: Koldewey's "seven river piers" (the six and the west land pier); the
    trench's outline is ours, a margin round the dug piers along the axis (t from, t to, half width across) */
export const DIG = { piers: 7, trench: { from: 48, to: 179, half: 16 } } as const

/** THE PHOTOGRAPH: Gadmer's autochrome A53931S of 18 April 1927 (a type of the water and banks), its file's size and
    the part shown (the town's 1927 bridge and the far masts at its right cut away), its credit as its record gives it */
export const PHOTO = {
  file: { w: 1280, h: 949 },
  crop: { l: 44, t: 150, r: 960, b: 905 },
  year: 1927,
  credit: 'Gadmer Frédéric, 18 April 1927, collections.albert-kahn.hauts-de-seine.fr, CC BY-SA 4.0',
} as const

/** THE MAP'S WINDOWS (UTM): north up, the bridge near the middle, as tight as lets a pier read on a phone; today's
    channel enters from the west (wide) or the left edge (upright) and passes the bridge's west end */
export const WINDOWS = {
  wide: { w: 444555, e: 445855, s: 3599600, n: 3600110 },
  upright: { w: 445090, e: 445650, s: 3599400, n: 3600310 },
} as const
