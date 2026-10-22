// node --test forge/store-lint.test.mjs
// One small manifest per rule, red and green; the painting rule against the
// app's own policy.ts; and the command over a store written for the test.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath } from 'node:url'
import {
  commonsFileOf, creditInLine, dashesIn, hyphenRanges, isItalianHolder, licenceOfUrl, licencesIn, lintRecords,
  noteClaims, paintingVerdict, readCommonsPage, resolveWork, rightsTier,
} from './store-lint.mjs'

const HERE = dirname(fileURLToPath(import.meta.url))
const APP = join(HERE, '..')
const SHA = 'a'.repeat(64)
const T2_EN = 'Public domain work. Reproduction from Wikimedia Commons. The museum labels the reproduction, not the painting. Non-profit cultural use.'
const T2_DE = 'Gemeinfreies Werk. Reproduktion aus Wikimedia Commons. Das Museum kennzeichnet die Reproduktion, nicht das Gemälde. Kulturelle Nutzung ohne Gewinnabsicht.'
const ART108_EN = ' Codice dei beni culturali, art. 108 comma 3-bis: exemption for non-profit study.'
const ART108_DE = ' Codice dei beni culturali, Art. 108 comma 3-bis: Ausnahme ohne Gewinnabsicht.'

/** a Tier 2 painting plate, its preview and its pyramid that the app admits */
const plate = (over = {}) => ({
  id: 'vinci/painting-plate/demo', path: 'paintings/demo/demo__1600x2000.jpg', class: 'PD-ART', tier: 'TIER2',
  licence: 'Public domain', honesty_en: `Demo. Leonardo da Vinci. ${T2_EN}`, honesty_de: `Demo. Leonardo da Vinci. ${T2_DE}`,
  holder: 'Musée du Louvre, Paris', source_url: 'https://commons.wikimedia.org/wiki/File:Demo_painting.jpg', sha256: SHA,
  bytes: 1, pixels: 3200000, width: 1600, height: 2000, wing: 'wing-vinci', display: true, role: 'painting-plate',
  plate_id: 'demo', work_id: 'demo', origin: 'store', ...over,
})
const preview = (over = {}) => plate({ id: 'vinci/painting-preview/demo', path: 'paintings/demo/demo__819x1024.jpg', pixels: 838656, width: 819, height: 1024, role: 'painting-preview', ...over })
const pyramid = (over = {}) => ({
  id: 'vinci/painting-tiles/demo', path: `paintings/demo/tiles/${SHA.slice(0, 12)}/`, class: 'PD-ART', licence: 'Public domain',
  holder: 'Musée du Louvre, Paris', source_url: 'https://commons.wikimedia.org/wiki/File:Demo_painting.jpg', wing: 'wing-vinci',
  display: true, role: 'painting-tiles', work_id: 'demo', plate_id: 'demo', derived_from: 'vinci/painting-plate/demo', origin: 'store', ...over,
})
/** a legacy face: no tier, no label, no plate_id */
const legacy = (role, over = {}) => {
  const p = role === 'painting-plate' ? plate() : preview()
  delete p.tier; delete p.plate_id; delete p.honesty_en; delete p.honesty_de; delete p.width; delete p.height
  return { ...p, id: `vinci/${role}/demo`, ...over }
}
/** a Tier 1 place photograph under CC BY-SA 3.0, labelled the house's way */
const place = (over = {}) => ({
  id: 'vinci/place-plate/clos-luce-05__chateau__4096x2672', path: 'place/clos-luce-05.jpg', class: 'CC-BY-SA', tier: 'TIER1',
  licence: 'Jean Exemple, CC BY-SA 3.0, via Wikimedia Commons', holder: 'Chateau du Clos Luce, Amboise',
  source_url: 'https://commons.wikimedia.org/wiki/File:Clos_luce_05.jpg', sha256: SHA, wing: 'wing-vinci', display: true, role: 'place-plate',
  honesty_en: 'Clos luce 05. Chateau du Clos Luce, Amboise. Jean Exemple, CC BY-SA 3.0, via Wikimedia Commons.',
  honesty_de: 'Clos luce 05. Chateau du Clos Luce, Amboise. Jean Exemple, CC BY-SA 3.0, via Wikimedia Commons.',
  licence_url: 'https://creativecommons.org/licenses/by-sa/3.0/', origin: 'store', ...over,
})

const lint = (records, options) => lintRecords(records, options)
const of = (findings, rule, level = 'error') => findings.filter((f) => f.rule === rule && f.level === level)
const ok = (records, rule, options) => assert.deepEqual(of(lint(records, options), rule).map((f) => `${f.id} ${f.field}: ${f.message}`), [])
const red = (records, rule, options, level = 'error') => {
  const found = of(lint(records, options), rule, level)
  assert.ok(found.length > 0, `expected a ${level} of ${rule}`)
  return found
}
const GOOD = [plate(), preview(), pyramid()]

test('the good painting fixture is clean under every rule', () => {
  assert.deepEqual(lint(GOOD).filter((f) => f.level === 'error'), [])
})

/* ---------------------------------------------------------------- group 1 */

test('tier-form: the app reads TIER1 to TIER3, a likeness 1 or 2; render tiers are no rights tier', () => {
  red([place({ tier: 'Tier1' })], 'tier-form')
  ok([place()], 'tier-form')
  ok([{ id: 'vinci/crane', class: 'GENERATED', tier: 'calm', licence: 'ours', wing: 'wing-vinci', display: true }], 'tier-form')
  assert.equal(rightsTier({ class: 'Tier 2', tier: 2 }), 2)
  assert.equal(rightsTier({ class: 'PD-ART', tier: 2 }), 'bad')
})

test('tier-class: an open class is Tier 1, Tier 2 is PD-ART, a likeness says its tier twice', () => {
  red([place({ tier: 'TIER2' })], 'tier-class')
  ok([place()], 'tier-class')
  red([{ id: 'lobby/likeness-x', class: 'Tier 1', tier: 2, licence: 'Public domain', wing: 'lobby', display: true, label_en: T2_EN, label_de: T2_DE }], 'tier-class')
  ok([{ id: 'lobby/likeness-x', class: 'Tier 2', tier: 2, licence: 'Public domain', wing: 'lobby', display: true, label_en: T2_EN, label_de: T2_DE }], 'tier-class')
})

test('tier-licence: NC or ND is Tier 3; a Commons PD-Art tag is the Tier 2 basis', () => {
  const institut = { id: 'vinci/codex-page/institut-c__p0048', class: 'PD-ART', licence: 'CC BY-NC-ND 3.0 FR', wing: 'wing-vinci', display: true, role: 'codex-page',
    licence_url: 'https://creativecommons.org/licenses/by-nc-nd/3.0/fr/', honesty_en: 'Manuscrit C. CC BY-NC-ND 3.0 FR.', honesty_de: 'Manuscrit C. CC BY-NC-ND 3.0 FR.' }
  red([{ ...institut, tier: 'TIER1' }], 'tier-licence')
  ok([{ ...institut, tier: 'TIER3' }], 'tier-licence')
  red([{ ...institut, tier: 'TIER3', licence: 'Public domain' }], 'tier-licence')
  red([plate({ tier: 'TIER1', licence: 'PD-Art | PD-old-100-expired' })], 'tier-licence')
  ok([plate({ licence: 'PD-Art | PD-old-100-expired' })], 'tier-licence')
})

test('class-licence: an open class names its own licence family', () => {
  red([place({ class: 'CC-BY' })], 'class-licence')
  ok([place()], 'class-licence')
  const ign = place({ class: 'CC-BY', licence: 'IGN, Licence Ouverte 2.0', licence_url: undefined,
    honesty_en: 'Orthophoto. IGN, Licence Ouverte 2.0.', honesty_de: 'Orthophoto. IGN, Licence Ouverte 2.0.' })
  ok([ign], 'class-licence')
  red([ign], 'class-licence', undefined, 'warning')
})

test('tier-label: Tier 2 says the sentences, Tier 1 does not, Tier 3 names its licence', () => {
  ok(GOOD, 'tier-label')
  // a Tier 1 CC0 plate that says the Tier 2 sentences
  const ingres = place({ class: 'CC0', licence: 'CC0, via Wikimedia Commons', licence_url: 'https://creativecommons.org/publicdomain/zero/1.0/', honesty_en: T2_EN, honesty_de: T2_DE })
  assert.deepEqual(red([ingres], 'tier-label').map((f) => f.field), ['honesty_en', 'honesty_de'])
  ok([{ ...ingres, honesty_en: 'Ingres, 1818. Petit Palais. Image: CC0 Paris Musées.', honesty_de: 'Ingres, 1818. Petit Palais. Bild: CC0 Paris Musées.' }], 'tier-label')
  const found = red([plate({ honesty_en: 'Demo. Public domain work. Reproduction from Wikimedia Commons.' })], 'tier-label')
  assert.match(found[0].message, /non-profit/)
  red([plate({ honesty_en: undefined, honesty_de: undefined })], 'tier-label')
  // a label that credits the image and never says "reproduction": a warning
  const thek = plate({ honesty_en: 'Image: Leonardo//thek@. Public-domain work; non-profit cultural use.', honesty_de: 'Bild: Leonardo//thek@. Gemeinfreies Werk; kulturelle Nutzung ohne Gewinnabsicht.' })
  ok([thek], 'tier-label')
  red([thek], 'tier-label', undefined, 'warning')
  const nc = { id: 'vinci/codex-page/institut-c__p0048', class: 'PD-ART', tier: 'TIER3', licence: 'CC BY-NC-ND 3.0 FR', wing: 'wing-vinci', display: true, role: 'codex-page', licence_url: 'https://creativecommons.org/licenses/by-nc-nd/3.0/fr/' }
  red([{ ...nc, honesty_en: 'Manuscrit C.', honesty_de: 'Manuscrit C.' }], 'tier-label')
  ok([{ ...nc, honesty_en: 'Manuscrit C. CC BY-NC-ND 3.0 FR.', honesty_de: 'Manuscrit C. CC BY-NC-ND 3.0 FR.' }], 'tier-label')
})

test('tier-label: a scope writes its German Tier 2 sentence one way', () => {
  const von = (n) => plate({ id: `vinci/painting-plate/v${n}`, honesty_de: T2_DE.replace('aus', 'von') })
  const aus = (n) => plate({ id: `vinci/painting-plate/a${n}` })
  const found = red([aus(1), aus(2), aus(3), von(1)], 'tier-label', undefined, 'warning')
  assert.deepEqual(found.map((f) => f.id), ['vinci/painting-plate/v1'])
})

test('note-tier: the rights decision a note records against the tier field', () => {
  // a note that says Tier 1 over a field that says Tier 2
  const carnation = plate({ note: 'Fetched whole. Tier 1 under RIGHTS-POLICY.md v1: The exact holder object page links its image and CC BY-SA 4.0. At 3,000 px it outranks the rest.' })
  red([carnation], 'note-tier')
  red([plate({ note: 'Selected by the rights reclassification of 14 September 2026 and its blind cross-check (tier 1, source_open_holder_or_library).' })], 'note-tier')
  ok([plate({ note: 'Tier 2 under RIGHTS-POLICY.md v1 by the owner\'s decision: the capture hangs, and the Tier 1 printed plate stays as evidence.' })], 'note-tier')
  ok([plate({ note: 'The codex register classifies this volume Tier 1; the owner places it under Tier 2.' })], 'note-tier')
  assert.deepEqual(noteClaims('Rights decision Q053: CC BY-SA 3.0 photograph by Jean Exemple; retain the credit. Stations: chamber.'),
    { tiers: [], words: ['CC BY-SA 3.0 photograph by Jean Exemple; retain the credit'] })
})

test('note-licence: a licence the rights decision names is on the record', () => {
  const note = 'Tier 1 under RIGHTS-POLICY.md v1: The exact holder object page links its image and CC BY-SA 4.0. Rest.'
  red([plate({ tier: 'TIER1', note })], 'note-licence')
  ok([plate({ tier: 'TIER1', note, licence: 'CC BY-SA 4.0, Bayerische Staatsgemäldesammlungen', licence_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    honesty_en: 'Public domain work. Image: Bayerische Staatsgemäldesammlungen, CC BY-SA 4.0.', honesty_de: 'Gemeinfreies Werk. Bild: Bayerische Staatsgemäldesammlungen, CC BY-SA 4.0.' })], 'note-licence')
  ok([place({ note: 'Rights decision Q053: CC BY-SA 3.0 photograph by Jean Exemple; retain the credit.' })], 'note-licence')
  red([place({ note: 'Rights decision Q053: CC BY 2.0 photograph by Jean Exemple; retain the credit.' })], 'note-licence')
})

/* ---------------------------------------------------------------- group 2 */

test('art-108: an Italian holder\'s Tier 2 label names the exemption, in both languages', () => {
  const uffizi = { holder: 'Gallerie degli Uffizi, Florence' }
  const found = red([plate(uffizi), preview(uffizi), pyramid(uffizi)], 'art-108')
  assert.deepEqual(found.map((f) => `${f.id} ${f.field}`), ['vinci/painting-plate/demo honesty_en', 'vinci/painting-plate/demo honesty_de', 'vinci/painting-preview/demo honesty_en', 'vinci/painting-preview/demo honesty_de'])
  const said = { ...uffizi, honesty_en: `Demo. ${T2_EN}${ART108_EN}`, honesty_de: `Demo. ${T2_DE}${ART108_DE}` }
  ok([plate(said), preview(said)], 'art-108')
  ok([plate({ holder: 'Pinacoteca Vaticana, Vatican City' })], 'art-108')
  // a likeness carries the code line in a field of its own
  ok([{ id: 'lobby/likeness-galilei', class: 'Tier 2', tier: 2, wing: 'lobby', display: true, licence: 'Public domain', holder: 'Gallerie degli Uffizi, Florence',
    label_en: `Galileo. ${T2_EN}`, label_de: `Galilei. ${T2_DE}`, italian_state_en: 'Italian state collection, under Article 108.', italian_state_de: 'Gemäß Artikel 108 des Codice.' }], 'art-108')
  assert.equal(isItalianHolder('Veneranda Biblioteca Ambrosiana, Milan'), true)
  assert.equal(isItalianHolder('Musée du Louvre, Paris'), false)
})

test('cc-address: a Creative Commons licence carries the address of that licence', () => {
  ok([place()], 'cc-address')
  red([place({ licence_url: undefined })], 'cc-address')
  red([place({ licence_url: 'https://creativecommons.org/licenses/by/3.0/' })], 'cc-address')
  red([place({ licence_url: 'https://creativecommons.org/licenses/by-sa/4.0/' })], 'cc-address')
  // a photographer's CC BY-SA 3.0 linked from a line that says "Public domain"
  red([plate({ licence_url: 'https://creativecommons.org/licenses/by-sa/3.0/', honesty_en: `Demo. ${T2_EN} Photo: Ann Example, CC BY-SA 3.0.`, honesty_de: `Demo. ${T2_DE} Foto: Ann Example, CC BY-SA 3.0.` })], 'cc-address')
  // public-domain tools beside a "Public domain" line: a CC0 deed, the Mark
  ok([plate({ licence_url: 'https://creativecommons.org/publicdomain/zero/1.0/deed.en' }), plate({ id: 'vinci/painting-plate/x', licence_url: 'https://creativecommons.org/publicdomain/mark/1.0/' })], 'cc-address')
  // a courtesy line that names CC0 and carries no address
  red([legacy('painting-plate', { licence: 'Public domain; Creative Commons Zero (CC0); Courtesy National Gallery of Art, Washington' })], 'cc-address')
  // a pyramid without a label shows no credit of its own
  ok([pyramid({ class: 'CC-BY', licence: 'Creative Commons Attribution 4.0 International or equivalent licence.' })], 'cc-address')
  assert.deepEqual(licenceOfUrl('https://creativecommons.org/share-your-work/public-domain/pdm/'), { type: 'mark', version: '1.0' })
  assert.equal(licenceOfUrl('https://www.nga.gov/artworks/1'), null)
})

test('cc-credit: an attribution licence is named on the label with the credit its line gives', () => {
  ok([place()], 'cc-credit')
  const noName = place({ honesty_en: 'Clos luce 05. CC BY-SA 3.0, via Wikimedia Commons.' })
  assert.match(red([noName], 'cc-credit')[0].message, /Jean Exemple/)
  red([place({ honesty_de: 'Clos luce 05. Jean Exemple, via Wikimedia Commons.' })], 'cc-credit')
  assert.equal(creditInLine('Photo: Ben Example, CC BY-SA 4.0'), 'Ben Example')
  assert.equal(creditInLine('Photo User92, CC BY-SA 4.0, via Wikimedia Commons.'), 'User92')
  assert.equal(creditInLine('CC BY-SA 4.0, Bayerische Staatsgemäldesammlungen, Alte Pinakothek München'), 'Bayerische Staatsgemäldesammlungen')
  assert.equal(creditInLine('Leonardo da Vinci. Line engraving by A. Engraver. Wellcome Collection. CC BY 4.0.'), 'Wellcome Collection')
  assert.equal(creditInLine('Public domain'), null)
})

test('photo-de: the German credit says Foto', () => {
  red([plate({ honesty_de: `Demo. ${T2_DE} Photo: Ben Example, CC BY-SA 4.0` })], 'photo-de')
  ok([plate({ honesty_de: `Demo. ${T2_DE} Foto: Ben Example, CC BY-SA 4.0` })], 'photo-de')
  // inside a Commons title the label quotes, it is the title's word: a warning
  const titled = place({ source_url: 'https://commons.wikimedia.org/wiki/File:Photo_of_Amboise.jpg', honesty_de: 'Photo of Amboise. Jean Exemple, CC BY-SA 3.0, via Wikimedia Commons.' })
  ok([titled], 'photo-de')
  red([titled], 'photo-de', undefined, 'warning')
})

test('dash: no dash in a label, a year range says to or bis, a quoted title only warns', () => {
  const found = red([plate({ honesty_en: `Demo. ${T2_EN} After the 2011–2012 restoration.`, honesty_de: `Demo. ${T2_DE} Nach der Restaurierung von 2011–2012.` })], 'dash')
  assert.match(found[0].message, /"to"/)
  assert.match(found[1].message, /"bis"/)
  ok([plate({ honesty_en: `Demo. ${T2_EN} After the 2011 to 2012 restoration.` })], 'dash')
  red([plate({ honesty_en: `Demo — ${T2_EN}` })], 'dash')
  red([plate({ honesty_en: `Demo - ${T2_EN}` })], 'dash')
  red([plate({ honesty_en: `A Library, Campus North – Campus South. ${T2_EN}` })], 'dash')
  const tomb = place({ source_url: 'https://commons.wikimedia.org/wiki/File:Ch%C3%A2teau_-_chapelle_Saint-Hubert_-_tombe_(Amboise).jpg',
    honesty_en: 'Château - chapelle Saint-Hubert - tombe (Amboise). Jean Exemple, CC BY-SA 3.0, via Wikimedia Commons.' })
  ok([tomb], 'dash')
  red([tomb], 'dash', undefined, 'warning')
  red([plate({ honesty_en: `Manuscrit C, vers 1490-1491. ${T2_EN}` })], 'dash', undefined, 'warning')
  ok([plate({ honesty_en: `Saint-Hubert, Paris-Louvre, see https://example.org/a-b-1490-1491. ${T2_EN}` })], 'dash')
  assert.deepEqual(hyphenRanges('Giunti Barbèra 1973-75; 2026-09-08; inv. 1890-12a'), ['1973-75'])
  assert.equal(dashesIn('a well-known word', null).length, 0)
  assert.equal(commonsFileOf({ source_url: 'https://commons.wikimedia.org/wiki/File:Clos_luce_05.jpg' }), 'Clos luce 05.jpg')
})

/* ---------------------------------------------------------------- group 3 */

test('painting-policy: a tier on a legacy face is refused as the app refuses it', () => {
  // a tier written on a legacy plate and its preview, and nothing else
  const variant = [legacy('painting-plate', { tier: 'TIER2' }), legacy('painting-preview', { tier: 'TIER2' })]
  const found = red(variant, 'painting-policy')
  assert.ok(found.every((f) => /Incomplete or mismatched painting policy/.test(f.message)))
  assert.ok(found.some((f) => /honesty_en: missing/.test(f.message) && /plate_id: missing/.test(f.message)))
  ok([legacy('painting-plate'), legacy('painting-preview')], 'painting-policy')
  ok(GOOD, 'painting-policy')
})

test('painting-policy: one matching preview per hanging plate, with the plate\'s labels', () => {
  assert.match(red([plate(), preview({ licence: 'Photo: X, CC BY 3.0' })], 'painting-policy')[0].message, /needs one matching preview.*licence/)
  assert.match(red([plate(), preview({ honesty_de: `Anders. ${T2_DE}` })], 'painting-policy')[0].message, /changes the source/)
  assert.match(red([plate()], 'painting-policy')[0].message, /no preview of this face/)
  red([plate({ supersedes: ['vinci/painting-plate/nowhere'] }), preview()], 'painting-policy')
  red([plate({ path: 'paintings/demo/other__1600x2000.jpg' }), preview()], 'painting-policy')
})

test('legacy-plate: a hanging legacy plate is owed its tier; the fix the app needs is named', () => {
  const works = new Map([['demo', 'DG']])
  const found = red([legacy('painting-plate'), legacy('painting-preview')], 'legacy-plate', { works })
  assert.equal(found.length, 1)
  ok([legacy('painting-plate'), legacy('painting-preview')], 'legacy-plate', { works: new Map([['demo', 'RC']]) })
  // superseded by a tiered plate: it no longer hangs
  ok([legacy('painting-plate'), legacy('painting-preview'), plate({ id: 'vinci/painting-plate/demo__1600x2000', supersedes: ['vinci/painting-plate/demo'] }),
    preview({ id: 'vinci/painting-preview/demo__819x1024' })], 'legacy-plate', { works })
  // a reverse whose file is named for the work: the app's rule needs a rename
  const reverse = legacy('painting-plate', { id: 'vinci/painting-plate/demo-reverse' })
  const said = red([reverse, legacy('painting-preview', { id: 'vinci/painting-preview/demo-reverse' })], 'legacy-plate', { works })
  assert.match(said[0].message, /file renamed to demo-reverse__WxH\.jpg/)
})

test('copy: a pyramid, a preview and a thumbnail repeat their source', () => {
  const cc = { licence: 'Photo: Ben Example, CC BY-SA 4.0', licence_url: 'https://creativecommons.org/licenses/by-sa/4.0/',
    honesty_en: `Demo. ${T2_EN} Photo: Ben Example, CC BY-SA 4.0`, honesty_de: `Demo. ${T2_DE} Foto: Ben Example, CC BY-SA 4.0` }
  ok([plate(cc), preview(cc), pyramid({ licence: cc.licence, licence_url: cc.licence_url })], 'copy')
  assert.deepEqual(red([plate(cc), preview(cc), pyramid({ licence: cc.licence })], 'copy').map((f) => `${f.id} ${f.field}`), ['vinci/painting-tiles/demo licence_url'])
  red([plate(cc), preview({ ...cc, licence_url: undefined })], 'copy')
  red([plate(), preview(), pyramid({ holder: 'Another holder' })], 'copy')
  red([plate(), preview(), pyramid({ honesty_en: 'An older label.' })], 'copy')
  const page = { id: 'vinci/codex-page/atlanticus__p0034', class: 'PD-ART', tier: 'TIER2', licence: 'Public domain', wing: 'wing-vinci', display: true, role: 'codex-page', honesty_en: T2_EN, honesty_de: T2_DE }
  const thumb = { ...page, id: 'vinci/codex-thumb/atlanticus', role: 'codex-thumb', of_page: page.id }
  ok([page, thumb], 'copy')
  red([page, { ...thumb, honesty_en: 'Codex Atlanticus. The old label.' }], 'copy')
  // a folio thumbnail finds its page by name
  const folio = { ...page, id: 'vinci/folio-page/ca-108r', role: 'folio-page' }
  red([folio, { ...folio, id: 'vinci/folio-thumb/ca-108r', role: 'folio-thumb', tier: 'TIER1' }], 'copy')
  // the hang strip's cell of a plate whose label changed
  const source = place({ honesty_en: 'Ingres. Image: CC0 Paris Musées.' })
  red([source, { id: 'vinci/exhibit-preview/picture/x', role: 'exhibit-preview', class: source.class, tier: 'TIER1', source: source.id, honesty_en: T2_EN, wing: 'wing-vinci', display: true, licence: source.licence }], 'copy')
})

/* ---------------------------------------------------------------- group 4 */

const PAGE = (spans, extra = '') => `<html><head><title>File:Demo painting.jpg - Wikimedia Commons</title>
<link rel="canonical" href="https://commons.wikimedia.org/wiki/File:Demo_painting.jpg"></head><body>
<table><tr><td id="fileinfotpl&#95;aut" class="fileinfo-paramfield">Artist</td><td>Leonardo da Vinci</td></tr>
<tr><td id="fileinfotpl&#95;aut" class="fileinfo-paramfield">Author</td><td><a href="/wiki/User:AE">Ada Example</a></td></tr></table>
${spans}${extra}</body></html>`
const LICENCE = (short, req) => `<span class="licensetpl&#95;short">${short}</span><span class="licensetpl&#95;attr&#95;req">${req}</span>`

test('source-credit: a page that asks for attribution against a label that credits nobody', () => {
  const asked = readCommonsPage(PAGE(LICENCE('CC BY-SA 4.0', 'true') + LICENCE('Public domain', 'false')))
  assert.equal(asked.file, 'Demo painting.jpg')
  assert.deepEqual(asked.authors, ['Ada Example'])
  assert.equal(asked.asks, true)
  const pages = new Map([[asked.file, { ...asked, saved: '/saved/f1.html' }]])
  // a page that asks, and a label with no credit
  const found = red([plate(), preview()], 'source-credit', { pages })
  assert.match(found[0].message, /Ada Example/)
  const credited = { honesty_en: `Demo. ${T2_EN} Photo: Ada Example, CC BY-SA 4.0.`, honesty_de: `Demo. ${T2_DE} Foto: Ada Example, CC BY-SA 4.0.`,
    licence: 'Photo: Ada Example, CC BY-SA 4.0', licence_url: 'https://creativecommons.org/licenses/by-sa/4.0/' }
  ok([plate(credited), preview(credited)], 'source-credit', { pages })
  // a public-domain page with no request asks nothing
  const free = readCommonsPage(PAGE(LICENCE('Public domain', 'false')))
  assert.equal(free.asks, false)
  ok([plate()], 'source-credit', { pages: new Map([[free.file, { ...free, saved: 'x' }]]) })
  // the photographer's own request on a public-domain page
  const request = readCommonsPage(PAGE(LICENCE('Public domain', 'false'), '<p>Please credit it with: Ann Example / https://example.org in the immediate vicinity of the image.</p>'))
  assert.equal(request.request, 'Ann Example / https://example.org')
  const byRequest = new Map([[request.file, { ...request, authors: [], saved: 'x' }]])
  red([plate()], 'source-credit', { pages: byRequest })
  ok([plate({ honesty_en: `Demo. ${T2_EN} Photo: Ann Example / https://example.org.`, honesty_de: `Demo. ${T2_DE} Foto: Ann Example / https://example.org.` })], 'source-credit', { pages: byRequest })
  // a legacy face shows its licence line, so the credit is sought there
  assert.deepEqual(red([legacy('painting-plate'), legacy('painting-preview')], 'source-credit', { pages }).map((f) => f.field), ['licence', 'licence'])
  ok([legacy('painting-plate', { licence: 'Photo: Ada Example, CC BY-SA 4.0' }), legacy('painting-preview', { licence: 'Photo: Ada Example, CC BY-SA 4.0' })], 'source-credit', { pages })
  // never without the pages
  ok([plate()], 'source-credit')
})

/* ------------------------------------------------- licences in words */

test('the licences a text names', () => {
  const said = (t) => licencesIn(t).map((l) => `${l.type} ${l.version}`)
  assert.deepEqual(said('Jean Exemple, CC BY-SA 3.0, via Wikimedia Commons'), ['by-sa 3.0'])
  assert.deepEqual(said('CC BY-NC-ND 3.0 FR'), ['by-nc-nd 3.0'])
  assert.deepEqual(said('Creative Commons Attribution 4.0 International or equivalent licence.'), ['by 4.0'])
  assert.deepEqual(said('This file is licensed under the Creative Commons Attribution-Share Alike 4.0 International license.'), ['by-sa 4.0'])
  assert.deepEqual(said('Reconocimiento 4.0 Internacional de Creative Commons'), ['by 4.0'])
  assert.deepEqual(said('Public domain; Creative Commons Zero (CC0); Courtesy National Gallery of Art'), ['zero 1.0'])
  assert.deepEqual(said('Public Domain Mark'), ['mark 1.0'])
  assert.deepEqual(said('Public domain'), [])
})

/* ------------------------------------------ the app's own painting rule */

/** the app's policy.ts, its types stripped by Node itself, or null on a Node without that */
async function appPolicy() {
  const { stripTypeScriptTypes } = await import('node:module')
  if (typeof stripTypeScriptTypes !== 'function') return null
  const quiet = process.emitWarning
  process.emitWarning = () => {}
  try {
    const js = stripTypeScriptTypes(readFileSync(join(APP, 'src/wings/vinci/pictures/policy.ts'), 'utf8'))
    return await import(`data:text/javascript;base64,${Buffer.from(js).toString('base64')}`)
  } finally { process.emitWarning = quiet }
}
const appRefuses = (fn) => { try { fn(); return null } catch (err) { return err.message } }

/** each record and each work as the lint sees it and as the app does */
function bothVerdicts(app, records) {
  const index = { all: records, byId: new Map(records.map((r) => [r.id, r])), forPath: () => undefined }
  const painting = records.filter((r) => /^painting-(plate|preview)$/.test(r.role ?? ''))
  const rows = painting.map((r) => [r.id, appRefuses(() => app.validatePaintingRecord(r))?.split(':')[0] ?? null, paintingVerdict(r).refused ?? null])
  for (const workId of [...new Set(painting.map((r) => r.work_id))]) {
    const mine = painting.filter((r) => r.work_id === workId).map((entry) => ({ entry, verdict: paintingVerdict(entry) }))
    const lintSays = mine.some((m) => m.verdict.refused) || resolveWork(workId, mine, index.byId).problems.length > 0
    rows.push([`work ${workId}`, appRefuses(() => app.resolveManifestWorkPlates(workId, index)) ? 'throws' : null, lintSays ? 'throws' : null])
  }
  return rows
}

test('the lint\'s painting rule is the app\'s, record by record and work by work', async (t) => {
  const app = await appPolicy()
  if (!app) return t.skip('this Node cannot strip TypeScript types (22.13 or later)')
  const base = [plate(), preview(), pyramid()]
  const mutants = [
    base,
    [legacy('painting-plate'), legacy('painting-preview')],
    [legacy('painting-plate', { tier: 'TIER2' }), legacy('painting-preview', { tier: 'TIER2' })],
    [legacy('painting-plate', { id: 'vinci/painting-plate/demo-reverse' }), legacy('painting-preview', { id: 'vinci/painting-preview/demo-reverse' })],
    [legacy('painting-plate', { id: 'vinci/painting-plate/demo-reverse', tier: 'TIER2', plate_id: 'demo:reverse', honesty_en: T2_EN, honesty_de: T2_DE }), legacy('painting-preview')],
    [legacy('painting-plate', { id: 'vinci/painting-plate/demo-obverse' }), legacy('painting-preview', { id: 'vinci/painting-preview/demo-obverse' })],
    [legacy('painting-plate', { path: 'paintings/demo/demo-reverse__1600x2000.jpg' }), legacy('painting-preview')],
    [legacy('painting-plate', { id: 'vinci/painting-plate/demo__1600x2000' }), legacy('painting-preview')],
    [plate({ id: 'vinci/painting-plate/demo-copy' }), preview()],
    [plate({ tier: 'TIER3' }), preview({ tier: 'TIER3' })],
    [plate({ plate_id: 'other' }), preview()],
    [plate({ plate_id: 'demo:restored' }), preview()],
    [plate({ pixels: 1 }), preview()],
    [plate({ display: false }), preview()],
    [plate({ class: 'GENERATED' }), preview()],
    [plate({ sha256: 'x' }), preview()],
    [plate(), preview({ licence: 'Other' })],
    [plate(), preview({ honesty_en: 'Other' })],
    [plate(), preview({ id: 'vinci/painting-preview/demo__10x10', path: 'paintings/demo/demo__10x10.jpg', pixels: 100, width: 10, height: 10 })],
    [plate(), preview(), plate({ id: 'vinci/painting-plate/demo__1600x2000', supersedes: ['vinci/painting-plate/demo'] })],
    [plate({ supersedes: ['vinci/painting-plate/demo'] }), preview()],
    [plate({ chosen_over: ['vinci/painting-plate/nowhere'] }), preview()],
    [plate(), preview(), preview({ id: 'vinci/painting-preview/demo__819x1024' })],
  ]
  for (const [i, records] of mutants.entries()) {
    for (const [id, appSays, lintSays] of bothVerdicts(app, records)) assert.equal(lintSays, appSays, `mutant ${i}, ${id}: the app says ${appSays}, the lint ${lintSays}`)
  }
})

test('the lint\'s painting rule is the app\'s over the store itself, when this machine has it', async (t) => {
  const app = await appPolicy()
  if (!app) return t.skip('this Node cannot strip TypeScript types (22.13 or later)')
  const { mergeManifests, storeKind } = await import('./vite-na-assets.mjs')
  if (storeKind() !== 'own') return t.skip('no asset store here')
  const rows = bothVerdicts(app, mergeManifests().assets)
  assert.ok(rows.length > 100, `${rows.length} painting records and works`)
  for (const [id, appSays, lintSays] of rows) assert.equal(lintSays, appSays, `${id}: the app says ${appSays}, the lint ${lintSays}`)
})

/* ------------------------------------------------------------ the command */

test('the command: red exits 1, warnings alone exit 0, --sources reads saved pages', () => {
  const dir = mkdtempSync(join(tmpdir(), 'store-lint-'))
  try {
    const store = join(dir, 'store'), appAssets = join(dir, 'app-assets'), pages = join(dir, 'pages')
    for (const d of [join(store, 'wing-vinci'), appAssets, pages]) mkdirSync(d, { recursive: true })
    const run = (records, ...args) => {
      writeFileSync(join(store, 'wing-vinci', 'manifest.json'), JSON.stringify(records))
      const out = spawnSync(process.execPath, [join(HERE, 'store-lint.mjs'), '--json', ...args], { cwd: APP, encoding: 'utf8',
        env: { ...process.env, NA_ASSET_STORE: store, NA_APP_ASSETS: appAssets, NA_PUBLIC_ORIGIN: 'off' } })
      return { status: out.status, report: JSON.parse(out.stdout) }
    }
    const green = run(GOOD)
    assert.equal(green.status, 0)
    assert.equal(green.report.ok, true)
    const warned = run([plate({ honesty_en: `Manuscrit C, vers 1490-1491. ${T2_EN}` }), preview({ honesty_en: `Manuscrit C, vers 1490-1491. ${T2_EN}` }), pyramid()])
    assert.equal(warned.status, 0)
    assert.ok(warned.report.warnings > 0)
    const redRun = run([plate({ tier: 'TIER1' }), preview({ tier: 'TIER1' }), pyramid()])
    assert.equal(redRun.status, 1)
    assert.deepEqual(redRun.report.counts['tier-label'], { group: 1, errors: 4, warnings: 0 })
    writeFileSync(join(pages, 'f1.html'), PAGE(LICENCE('CC BY-SA 4.0', 'true')))
    const sourced = run(GOOD, '--sources', pages)
    assert.equal(sourced.status, 1)
    assert.equal(sourced.report.sources.pages, 1)
    assert.equal(sourced.report.counts['source-credit'].errors, 4)
  } finally { rmSync(dir, { recursive: true, force: true }) }
})
