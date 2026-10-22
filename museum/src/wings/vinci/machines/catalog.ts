/** Locked explanation copy is parsed from brief/pages, never retyped from dossier labels. */
import type { Dossier } from './types'
import recordsJson from './data/records.json?raw'
import aerial_screwJson from './data/aerial-screw.json?raw'
import parachuteJson from './data/parachute.json?raw'
import anemometerJson from './data/anemometer.json?raw'
import inclinometerJson from './data/inclinometer.json?raw'
import multi_barrel_gunJson from './data/multi-barrel-gun.json?raw'
import rolling_millJson from './data/rolling-mill.json?raw'
import ball_bearingJson from './data/ball-bearing.json?raw'
import flywheelJson from './data/flywheel.json?raw'
import revolving_craneJson from './data/revolving-crane.json?raw'
import latheJson from './data/lathe.json?raw'
import miter_lock_gatesJson from './data/miter-lock-gates.json?raw'
import water_lifting_screwJson from './data/water-lifting-screw.json?raw'
import proportional_compassJson from './data/proportional-compass.json?raw'
import camera_obscuraJson from './data/camera-obscura.json?raw'
import mechanical_lionJson from './data/mechanical-lion.json?raw'
import armoured_carJson from './data/armoured-car.json?raw'

export const MACHINE_SLUGS = [
  "aerial-screw",
  "parachute",
  "anemometer",
  "inclinometer",
  "multi-barrel-gun",
  "rolling-mill",
  "ball-bearing",
  "flywheel",
  "revolving-crane",
  "lathe",
  "miter-lock-gates",
  "water-lifting-screw",
  "proportional-compass",
  "camera-obscura",
  "mechanical-lion"
] as const
export type MachineSlug = (typeof MACHINE_SLUGS)[number]
export type Language = 'en' | 'de'
export type Bilingual<T = string> = { en: T; de: T }
export interface PageSection { title: string; body: string }
export interface EvidenceRecord {
  slug: string
  status: string
  title: Bilingual
  label: Bilingual
  arithmetic: Bilingual
  page: Bilingual
  sections: Bilingual<PageSection[]>
  folio: Dossier['folio']
  scope: string
  gaps: string[]
  sourcePath: string
  sourceSha256: string
  pageSourcePath: string
  pageSourceSha256: string
}
export interface MachineRecord extends EvidenceRecord { slug: MachineSlug; dossier: Dossier }

const records = JSON.parse(recordsJson) as { complete: Record<MachineSlug, EvidenceRecord>; partial: EvidenceRecord[] }
export const dossiers: Record<MachineSlug, Dossier> = {
  'aerial-screw': JSON.parse(aerial_screwJson) as Dossier,
  'parachute': JSON.parse(parachuteJson) as Dossier,
  'anemometer': JSON.parse(anemometerJson) as Dossier,
  'inclinometer': JSON.parse(inclinometerJson) as Dossier,
  'multi-barrel-gun': JSON.parse(multi_barrel_gunJson) as Dossier,
  'rolling-mill': JSON.parse(rolling_millJson) as Dossier,
  'ball-bearing': JSON.parse(ball_bearingJson) as Dossier,
  'flywheel': JSON.parse(flywheelJson) as Dossier,
  'revolving-crane': JSON.parse(revolving_craneJson) as Dossier,
  'lathe': JSON.parse(latheJson) as Dossier,
  'miter-lock-gates': JSON.parse(miter_lock_gatesJson) as Dossier,
  'water-lifting-screw': JSON.parse(water_lifting_screwJson) as Dossier,
  'proportional-compass': JSON.parse(proportional_compassJson) as Dossier,
  'camera-obscura': JSON.parse(camera_obscuraJson) as Dossier,
  'mechanical-lion': JSON.parse(mechanical_lionJson) as Dossier,
}
export const machineCatalog = Object.fromEntries(
  MACHINE_SLUGS.map((slug) => [slug, { ...records.complete[slug], slug, dossier: dossiers[slug] }])
) as Record<MachineSlug, MachineRecord>

/** These are sheets and gaps. No partial geometry is imported or constructed. */
export const partialCatalog: readonly EvidenceRecord[] = records.partial
export function isMachineSlug(value: string): value is MachineSlug {
  return (MACHINE_SLUGS as readonly string[]).includes(value)
}

/** THE COURT'S MACHINES, built to showcase. They stand on the machine bench
 * until their place in the ducal court is chosen; no hall lists them, so the
 * hall's fifteen above are untouched. */
export const COURT_SLUGS = ['armoured-car'] as const
export type CourtSlug = (typeof COURT_SLUGS)[number]
export type BenchSlug = MachineSlug | CourtSlug
export const BENCH_SLUGS: readonly BenchSlug[] = [...MACHINE_SLUGS, ...COURT_SLUGS]
export interface BenchRecord extends EvidenceRecord { slug: BenchSlug; dossier: Dossier }
const courtDossiers: Record<CourtSlug, Dossier> = {
  'armoured-car': JSON.parse(armoured_carJson) as Dossier,
}
/** A court machine's record: its locked page and sources as the partial
 * records hold them, with the build's own label, scope, gaps and sheet. */
function courtRecord(slug: CourtSlug): BenchRecord {
  const page = records.partial.find(record => record.slug === slug)
  if (!page) throw new Error(`No page record for ${slug}`)
  const dossier = courtDossiers[slug]
  return {
    ...page, slug, dossier, status: dossier.status,
    label: { en: dossier.label_en, de: dossier.label_de },
    scope: dossier.scope, gaps: [...dossier.gaps], folio: dossier.folio,
    sourcePath: `machines/data/${slug}.json`, sourceSha256: '',
  }
}
export const courtCatalog: Record<CourtSlug, BenchRecord> = {
  'armoured-car': courtRecord('armoured-car'),
}
export const benchCatalog: Record<BenchSlug, BenchRecord> = { ...machineCatalog, ...courtCatalog }
export function isBenchSlug(value: string): value is BenchSlug {
  return (BENCH_SLUGS as readonly string[]).includes(value)
}
