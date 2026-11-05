/* FEATURE 3'S FACTS (TARGETS-W2A feature 3). Every sketch on its paper is
   Guessed: no plan, size or planting of these gardens is known. The sketches
   draw the texts' nouns as things, never a plan of a found place, with no
   scale bar and no north arrow. The locator's outlines are the walk's own
   plan (`map/map-plan.json`, a test holds them equal); only the patch where
   Ea's temple lay is ours, inside the Esagila complex on the river bank. */

/** UTM 38N metres (E, N), as map-plan.json gives them */
export type Pt = readonly [number, number]

export const PLAN = {
  /** the Euphrates in its old bed (map-plan.json water euphrates) */
  river: [[445905, 3603800], [445905, 3602100], [445800, 3602045], [445695, 3601800], [445558, 3601450], [445454, 3601170], [445452, 3600905], [445349, 3600894], [445374, 3600598], [445489.5, 3600600], [445489.4, 3600607], [445497, 3600607], [445497, 3600587], [445490.0, 3600586], [445490.3, 3600505], [445492.5, 3600405], [445494.1, 3600245], [445534.9, 3600005], [445563.9, 3599865], [445568.9, 3599841], [445574.21, 3599815.2], [445587.41, 3599524.08], [445782.0, 3599260.29], [445932.13, 3599108.16], [445980, 3598900], [446120, 3598600], [446300, 3598300], [446100, 3598300], [445936, 3598701], [445612, 3599300], [445522, 3599525], [445404.5, 3599812], [445401.8, 3599846], [445343, 3600200], [445300, 3600400], [445275, 3600560], [445260, 3600750], [445248, 3600965], [445300, 3601150], [445420, 3601430], [445560, 3601780], [445670, 3602020], [445785, 3602100], [445785, 3603800]] as readonly Pt[],
  /** Esagila and its annex (map-plan.json blocks esagila, esagila-annex) */
  esagila: [[445620.01, 3599756.01], [445696.95, 3599774.34], [445717.3, 3599689.66], [445640.36, 3599671.28]] as readonly Pt[],
  annex: [[445697.19, 3599773.33], [445784.48, 3599793.55], [445810.06, 3599679.75], [445736.49, 3599662.86], [445717.3, 3599689.66]] as readonly Pt[],
  /** the South Palace (map-plan.json block south-palace) */
  palace: [[445516, 3600726], [445634, 3600760], [445700, 3600780], [445778, 3600802], [445812, 3600616], [445516, 3600610]] as readonly Pt[],
  /** this stop: the vaulted building's unit in the palace's north-east corner (gardens-plan.json vaulted.unit) */
  stop: [[445733.7, 3600786.0], [445766.0, 3600793.5], [445776.0, 3600751.0], [445733.7, 3600750.0]] as readonly Pt[],
} as const

/** THE LOCATOR'S WINDOW: from south of Esagila to north of the palace, river bank to the annex */
export const WINDOW = { w: 445470, e: 445830, s: 3599610, n: 3600840 } as const

/** WHERE EA'S TEMPLE LAY, as far as the text says: in the Esagila complex on the river bank (Tintir, P2021 p. 166).
    Ours: a patch between Esagila's west side and the bank, about 40 by 90 m; its spot and size are a guess */
export const EKARZAGINNA = { e: 445599, n: 3599722, w: 40, h: 90 } as const

/** the stop's colour panel: its share of the plate beside (wide) or above (upright) the paper; on a low upright plate
    (the sheet raised) less, so the sketches keep room for their names */
export const COLOUR = { wide: 0.4, upright: 0.36, low: 0.24, lowUnder: 300 } as const
