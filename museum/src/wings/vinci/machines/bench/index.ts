import { Box3, type BufferGeometry, Color, Fog, Group, type Light, Mesh, MeshStandardNodeMaterial, PerspectiveCamera, type PlaneGeometry, Scene, SpotLight, Vector3 } from 'three/webgpu';
import { kelvinToColour } from '../../../../stack/light';
import type { Stack, KeyLight, MaterialSet } from '../../../../stack';
import { float, fog, lights, positionWorld, rangeFogFactor, smoothstep, uv, vec2, vec3 } from 'three/tsl';
import { IDENTITY } from '../../../../stack/grade';
import { loadManifest, type ManifestEntry } from '../../../../manifest';
import { assetAddress } from '../../../../stack/materials';
import { loadMachineMaterial, materialDressed, materialFailure } from '../parts';
import { buildBenchMachine, buildShowcase, type ReadyMachineBuild } from '..';
import { SHOWCASE_SLUGS, isShowcaseSlug, showcaseCatalog, type ShowcaseSlug } from '../showcase';
import { makeFigure, standingJoints, type Figure } from '../flying/figure';
import type { StoreCrane, StoreCraneReading } from '../crane-body';
import { BENCH_SLUGS as HALL_AND_COURT_SLUGS, isBenchSlug as isHallOrCourtSlug, benchCatalog, partialCatalog, type Language, type BenchSlug as HallOrCourtSlug, type EvidenceRecord } from '../catalog';
/** the fifteen and the court's, then the pieces built to showcase, which stand on the bench alone */
type BenchSlug = HallOrCourtSlug | ShowcaseSlug;
const BENCH_SLUGS: readonly BenchSlug[] = [...HALL_AND_COURT_SLUGS, ...SHOWCASE_SLUGS];
const isBenchSlug = (value: string): value is BenchSlug => isHallOrCourtSlug(value) || isShowcaseSlug(value);
const recordOf = (id: BenchSlug) => isShowcaseSlug(id) ? showcaseCatalog[id] : benchCatalog[id];
import { buildScaleFigure } from './scale-figure';
import { WORKING_LINES } from '../working-lines';
import { wideShadowFilter } from '../screw-shadow';
import benchCss from './bench.css?inline';
import titleSelectCss from './title-select.css?inline';
import evidenceCss from './evidence-dialog.css?inline';
import { createEvidenceDialog } from './evidence-dialog';
import { controlCopy, controlLanguage, addressWithLanguage, playbackOnReducedMotionChange } from './control-polish';
import { wrapTitleSelect } from './title-select';
import { applyRopeShadowExperiment } from './rope-shadow-proposal';
import { buildBenchSupports } from './supports';
import { createBenchMetrics } from './metrics';
import { createBenchBackdrop } from './backdrop';
import { BACK_PLANE_AIR, BACK_PLANE_METRES, BENCH_BACK_PLANE, backPlaneMaterial, buildBackPlane } from './back-plane';
import { createBenchHour, benchHourRecord, BENCH_SUN_AZIMUTH_DEGREES, BENCH_SUN_ELEVATION_DEGREES } from './hour';
import { BENCH_ABSENCE, holderName, setRegister, withoutCitations } from './registers';
import { setBenchKey } from '../key';
import { playbackSchedule, initialPlayback, advancePlayback, togglePlayback, restartPlayback, freezePlayback, playbackPresentation } from './playback';
// The eyes intentionally removes the Vite HMR client; inline CSS has no HMR imports.
const sheet = document.createElement('style');
sheet.dataset['vinciBench'] = '';
sheet.textContent = benchCss + '\n' + titleSelectCss + '\n' + evidenceCss;
document.head.append(sheet);
export interface BenchOptions {
  slug?: string;
  t?: number;
  /** frame the working end alone, for a state that proves a fitting reads */
  close?: boolean;
  lang?: Language;
  section?: boolean;
  evidence?: string;
  clothProbe?: 'no-shadow' | 'flat-normal';
  ropeProbe?: 'baseline' | 'no-shadow' | 'flat-normal' | 'offset-2mm';
  /** a fixed eye for a still, given by the rig: where it stands, what it
   * looks at, the picture's vertical field in degrees, and the picture's own
   * frame inside the canvas as fractions (left, top, width, height) */
  eye?: { at: [number, number, number]; look: [number, number, number]; fov?: number; frame?: [number, number, number, number] };
  /** a grey figure of 1.70 m for size, at (x, z) on the plinth or (x, y, z) on a lower floor, turned by yaw degrees; on a posed rig
   * (POSED_RIG) its feet at (x, y, z) and its turn about the vertical in radians */
  figure?: { at: [number, number] | [number, number, number]; yaw?: number; turn?: number };
  /** this jump's own lamps in place of the machine's (a probe) */
  lamp?: BenchLamp[] | null;
  /** this jump's own share of the sky on the machine's surfaces (a probe) */
  fill?: number;
  /** this jump's own strength of the hour's sun, in lux (a probe) */
  lux?: number;
  /** the hour's key switched off for this jump, its fill kept (a probe that separates the lights) */
  keyProbe?: 'off';
  /** this jump's own focus on the wall behind, 0 to 1, in place of the machine's (a probe) */
  wallFocus?: number;
}
/** An exhibition lamp on one machine, beside the hour's key: a spot in the
 * machine's metres, its illuminance in lux at its aim, its cone in radians.
 * It lights the machine and the figure beside it, not the room. */
export interface BenchLamp {
  at: [number, number, number]; aim: [number, number, number]; lux: number; kelvin: number; angle: number; penumbra: number;
  /** 2: a real lamp's inverse square, its lux read at the aim; 0 (the default): the same lux at every distance */
  decay?: 0 | 2;
  /** false: no shadow map; each shadowed lamp draws the scene again every frame */
  shadow?: false;
}
/** A machine whose rig eyes were fitted inside the dock's offset with the lens
 * as given, and whose size figure is its pilot's body standing. Every other
 * rig eye spans the picture's frame and stands the shared scale figure. */
const POSED_RIG: ReadonlySet<string> = new Set(['flying-machine']);
/** How far the wall behind falls out of focus for a machine seen from far off,
 * as a fast lens (about f/1.4) focused on the machine 18 m away would hold a
 * wall 12 m beyond it: its joints a few pixels soft. The machine is untouched. */
const BENCH_WALL_FOCUS: Partial<Record<string, number>> = {
  'flying-machine': .6,
};
/** What the wall keeps of the stone's value behind a machine whose own key is far above the hour's (the bridge's 360
 * against 185): scaled back by as much, so its wall stands at the value every other machine's has and the air reads
 * between the subject and the wall. */
const BENCH_WALL_VALUE: Partial<Record<string, number>> = {
  'bridge-of-poles': .3 * 185 / 360,
};
/** A machine's plinth and posts given their own finish (a modern powder coat in place of bare
 * iron): the bare iron's sheen under a low key outshines a dark machine at a close eye. */
const BENCH_FINISH: Partial<Record<string, { roughness: number; metalness: number; tone: number }>> = {
  'flying-machine': { roughness: .86, metalness: 0, tone: .8 },
};
/** A machine whose size line measures it standing, not the space its motion sweeps. Untagged: the tag marks a listed
 * working line alone. */
const BENCH_SIZE_WORD: Partial<Record<string, { en: string; de: string }>> = {
  'bridge-of-poles': { en: 'as it stands', de: 'stehend' },
};
const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls: string, text?: string): HTMLElementTagNameMap[K] => { const n = document.createElement(tag); n.className = cls; if (text !== undefined)
  n.textContent = text; return n; };
const localText = (lang: Language, en: string, de: string): string => lang === 'de' ? de : en;
/** Locked page markup supplies links, while the visitor reads its exact link text. */
function appendLinkedText(host: HTMLElement, text: string): void {
  const links = /\[([^\]]+)\]\(((?:https?:\/\/|\.\.?\/)[^\s)]+)\)/g;
  let at = 0;
  for (const match of text.matchAll(links)) {
    const start = match.index;
    host.append(document.createTextNode(text.slice(at, start)));
    const target = match[2] ?? '';
    if (/^https?:\/\//.test(target)) {
      const anchor = el('a', '', match[1]);
      anchor.href = target;
      anchor.target = '_blank';
      anchor.rel = 'noopener noreferrer';
      host.append(anchor);
    }
    else {
      const reference = el('span', 'bench-local-source', match[1]);
      reference.dataset['sourcePath'] = target;
      host.append(reference);
    }
    at = start + match[0].length;
  }
  host.append(document.createTextNode(text.slice(at)));
}
function appendPageBody(host: HTMLElement, text: string): void {
  for (const paragraph of text.split(/\n\s*\n/)) {
    const lines = paragraph.split('\n');
    if (lines.every(line => /^\d+\.\s/.test(line))) {
      const list = el('ol', 'bench-citations');
      for (const line of lines) {
        const item = el('li', '');
        appendLinkedText(item, line.replace(/^\d+\.\s/, ''));
        list.append(item);
      }
      host.append(list);
    }
    else {
      const p = el('p', '');
      appendLinkedText(p, paragraph);
      host.append(p);
    }
  }
}
/** A separate scene, reusing the application's renderer and material library. */
export function createBench(stack: Stack, onExit: () => void) {
  const scene = new Scene();
  scene.background = new Color('#1a2026');
  const backdrop = createBenchBackdrop();
  scene.backgroundNode = backdrop;
  const camera = new PerspectiveCamera(34, innerWidth / innerHeight, .001, 1000);
  const display = new Group();
  scene.add(display);
  const host = el('main', 'bench');
  host.hidden = true;
  host.setAttribute('aria-label', 'Leonardo da Vinci machine bench');
  document.body.append(host);
  const header = el('header', 'bench-header');
  // One persistent mark carries the brand, the wing and the count, so a
  // visitor is told where they stand without spending a second mark on it.
  const mark = el('div', 'bench-mark');
  mark.dataset['naPersistent'] = '';
  const brand = el('p', 'bench-brand', 'Night Agora');
  brand.dataset['naBrand'] = '';
  const kicker = el('p', 'bench-kicker');
  const kickerWing = el('span', 'bench-kicker-wing');
  const kickerHere = el('span', 'bench-kicker-here');
  kicker.append(kickerWing, kickerHere);
  mark.append(brand, kicker);
  const exit = el('a', '', 'The museum ↗');
  exit.href = '/w/vinci';
  exit.dataset['naPersistent'] = '';
  exit.addEventListener('click', e => { e.preventDefault(); onExit(); });
  header.append(mark, exit);
  const dock = el('aside', 'bench-dock');
  const textBlock = el('div', 'bench-text');
  const title = el('h1', 'bench-title');
  const certainty = el('div', 'bench-certainty');
  const dot = el('i', 'bench-dot');
  const certaintyWord = el('span', '');
  certainty.append(dot, certaintyWord);
  const label = el('p', 'bench-label');
  label.dataset['naClaim'] = 'inferred';
  label.dataset['naAnchorClass'] = 'GENERATED';
  const dimensions = el('p', 'bench-dim');
  textBlock.append(title, certainty, label, dimensions);
  const folio = el('figure', 'bench-folio');
  const scope = el('p', 'bench-scope');
  for (const spoken of [title, certainty, label, dimensions]) setRegister(spoken, 'label');
  for (const explained of [folio, scope]) setRegister(explained, 'drawer');
  const languages = el('div', 'bench-lang');
  const en = el('button', '', 'EN'), de = el('button', '', 'DE');
  languages.append(en, de);
  const read = el('button', 'bench-read', 'Read the evidence ↗');
  const holdNote = el('p', 'bench-hold');
  holdNote.hidden = true;
  const hour = createBenchHour(controlLanguage(location.search));
  dock.append(languages, textBlock, folio, holdNote, scope, hour.element, read);
  const footer = el('footer', 'bench-footer');
  footer.dataset['naPersistent'] = '';
  const nav = el('nav', 'bench-nav');
  nav.setAttribute('aria-label', 'Machines');
  const previous = el('button', '', '←');
  previous.setAttribute('aria-label', 'Previous machine');
  const next = el('button', '', '→');
  next.setAttribute('aria-label', 'Next machine');
  const select = el('select', '');
  select.setAttribute('aria-label', 'Machine');
  const chooser = wrapTitleSelect(select);
  nav.append(previous, chooser.element, next);
  const section = el('button', 'bench-section', 'Open section');
  section.hidden = true;
  const sectionNote = el('p', 'bench-section-note');
  sectionNote.hidden = true;
  const actions = el('div', 'bench-actions');
  actions.append(read, section);
  dock.append(actions, sectionNote);
  const playback = el('div', 'bench-playback');
  const play = el('button', '', 'Pause');
  const restart = el('button', '', 'Restart');
  const timeLabel = el('output', 'bench-time');
  playback.append(play, restart, timeLabel);
  footer.append(nav, playback);
  const source = el('section', 'bench-source');
  source.hidden = true;
  source.setAttribute('aria-label', 'Evidence');
  source.setAttribute('role', 'dialog');
  source.setAttribute('aria-modal', 'true');
  const sourceClose = el('button', 'bench-source-close', '×');
  sourceClose.setAttribute('aria-label', 'Close evidence');
  const page = el('article', 'bench-page');
  setRegister(page, 'record');
  source.append(sourceClose, page);
  const loading = el('p', 'bench-loading', 'Preparing the object');
  loading.hidden = true;
  host.append(header, dock, footer, source, loading);
  const metrics = createBenchMetrics(stack, host);
  let metricsTier = metrics ? stack.tierName() : null;
  let closeUp = false;
  let eye: BenchOptions['eye'] | null = null, figure: BenchOptions['figure'] | null = null, figureGroup: Group | null = null;
  let wallFocus: number | undefined;
  // the posed rig's figure: its pilot's body standing, one grey shared by every open
  let sizeFigure: Figure | null = null;
  const figureMaterial = new MeshStandardNodeMaterial({ metalness: 0, roughness: .82 });
  figureMaterial.name = 'vinci/bench/size-figure';
  figureMaterial.colorNode = vec3(.205, .205, .198);
  let active = false, serial = 0, slug: BenchSlug = 'aerial-screw', lang: Language = controlLanguage(location.search), machine: ReadyMachineBuild | null = null, key: KeyLight | null = null, ready = false, lastWall = performance.now(), folioEntry: ManifestEntry | undefined, evidenceRecord: EvidenceRecord | null = null, sectionEnabled = false, lastPlaybackPaint = 0;
  let schedule = playbackSchedule(recordOf(slug).dossier);
  let playbackState = initialPlayback(schedule, { fixed: true });
  const supportGeometries: BufferGeometry[] = [], supportMaterials: MeshStandardNodeMaterial[] = [], supportSets: MaterialSet[] = [];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const evidence = createEvidenceDialog({
    host, source, page, closeButton: sourceClose, partialRecords: partialCatalog,
    completeRecord: () => recordOf(slug), language: () => lang,
    render: reading, changeLanguage, onClose: () => metrics?.reset(),
  });
  const stamp = () => { document.body.dataset['forge'] = 'bench'; document.body.dataset['phase'] = 'bench'; };
  let ropeExperiment: ReturnType<typeof applyRopeShadowExperiment> | null = null;
  let storeCrane: StoreCraneReading | null = null;
  function clearDisplay() { dropLamps(); sizeFigure?.dispose(); sizeFigure = null; figureGroup = null; storeCrane = null; ropeExperiment?.restore(); ropeExperiment = null; metrics?.close(); machine?.dispose(); machine = null; display.clear(); for (const g of supportGeometries)
    g.dispose(); for (const m of supportMaterials)
    m.dispose(); supportGeometries.length = 0; supportMaterials.length = 0; supportSets.length = 0; }
  function reading(record: EvidenceRecord) {
    evidenceRecord = record;
    page.replaceChildren();
    page.append(el('h1', 'bench-title', record.title[lang]), el('p', '', record.label[lang]));
    // The hour is the first thing the label sends a visitor here for, so the
    // record answers it before the folio's own sections begin.
    const computed = benchHourRecord(lang);
    const hourSection = el('section', 'bench-hour-record');
    hourSection.append(el('h2', '', computed.title));
    for (const line of computed.lines) hourSection.append(el('p', line.figure ? 'bench-hour-figure' : '', line.text));
    setRegister(hourSection, 'record');
    page.append(hourSection);
    for (const section of record.sections[lang]) {
      page.append(el('h2', '', section.title));
      appendPageBody(page, section.body);
    }
    if (record.slug === slug && folioEntry) {
      page.append(el('h2', '', localText(lang, 'Plate record', 'Bildnachweis')), el('p', '', folioEntry.licence), el('p', '', folioEntry.note ?? ''));
    }
    if (record.status !== 'complete') {
      const limits = el('section', 'bench-limitations');
      limits.append(el('h2', '', localText(lang, 'Unresolved', 'Ungeklärt')));
      const languagePattern = lang === 'de' ? /unbekannt|ungeklärt|offen|fehl|nicht|keine?\b|unvollständig/i : /unknown|unresolved|missing|incomplete|not\b|no\b/i;
      const mechanism = record.sections[lang][1]?.body ?? record.label[lang];
      const paragraphs = mechanism.split(/\n\s*\n/).filter(paragraph => languagePattern.test(paragraph));
      for (const paragraph of paragraphs.length ? paragraphs : [mechanism])
        appendPageBody(limits, paragraph);
      const original = el('details', 'bench-original-gaps');
      original.append(el('summary', '', localText(lang, 'Engineering gaps · original English record', 'Technische Lücken · englischer Originaltext')));
      const gaps = el('div', '');
      gaps.lang = 'en';
      for (const gap of record.gaps)
        gaps.append(el('p', '', gap));
      original.append(gaps);
      limits.append(original);
      page.append(limits);
    }
    const records = el('div', 'bench-records');
    records.append(el('h2', '', localText(lang, 'Partial and documentary records', 'Teilweise und dokumentarische Aufzeichnungen')));
    for (const rec of partialCatalog) {
      const b = el('button', '', rec.title[lang]);
      b.setAttribute('aria-current', String(rec.slug === record.slug));
      b.onclick = () => evidence.select(rec);
      records.append(b);
    }
    page.append(records);
    evidence.rendered(record);
  }
  function paint() {
    const copy = controlCopy[lang];
    hour.setLanguage(lang);
    host.dataset['section'] = String(sectionEnabled);
    host.setAttribute('aria-label', copy.host);
    nav.setAttribute('aria-label', copy.navigation);
    previous.setAttribute('aria-label', copy.previous);
    next.setAttribute('aria-label', copy.next);
    select.setAttribute('aria-label', copy.chooser);
    // The wing's name goes with the brand on the wide frame; the phone keeps
    // the bench and the count, which is the half that says how far along.
    const [wing, bench] = copy.subtitle.split(' · ');
    kickerWing.textContent = `${wing} · `;
    kickerHere.textContent = `${bench} · ${String(BENCH_SLUGS.indexOf(slug) + 1).padStart(2, '0')} / ${BENCH_SLUGS.length}`;
    exit.textContent = copy.exitText;
    exit.setAttribute('aria-label', copy.exitLabel);
    exit.href = `/w/vinci${location.search}`;
    languages.setAttribute('role', 'group');
    languages.setAttribute('aria-label', copy.languageGroup);
    en.setAttribute('aria-label', copy.english);
    de.setAttribute('aria-label', copy.german);
    loading.textContent = copy.loading;
    const record = recordOf(slug); host.lang = lang; host.dataset['slug'] = slug; title.textContent = record.title[lang]; label.textContent = record.label[lang]; label.dataset['naAnchor'] = `vinci/machine/${slug}`; certaintyWord.textContent = localText(lang, 'Reconstructed · assumed dimensions', 'Rekonstruiert · angenommene Maße'); const s = record.dossier.scale_m; const sizeWord = BENCH_SIZE_WORD[slug]; dimensions.textContent = `${s.x.toFixed(2)} × ${s.y.toFixed(2)} × ${s.z.toFixed(2)} m · ${sizeWord ? localText(lang, sizeWord.en, sizeWord.de) : localText(lang, 'swept envelope', 'Bewegungsraum')}`; select.setAttribute('aria-label', `${localText(lang, 'Machine', 'Maschine')} ${BENCH_SLUGS.indexOf(slug) + 1} / ${BENCH_SLUGS.length}`); scope.textContent = withoutCitations(record.sections[lang][1]?.body ?? ''); en.setAttribute('aria-pressed', String(lang === 'en')); de.setAttribute('aria-pressed', String(lang === 'de')); read.textContent = localText(lang, 'Read the evidence ↗', 'Die Quellen lesen ↗'); select.replaceChildren(); for (const id of BENCH_SLUGS) {
    const option = el('option', '', recordOf(id).title[lang]);
    option.value = id;
    select.append(option);
  } const absence = BENCH_ABSENCE[slug]; if (absence) dimensions.textContent += '\n' + localText(lang, absence.en, absence.de); select.value = slug; chooser.refresh(); const lion = slug === 'mechanical-lion', car = slug === 'armoured-car', bridge = slug === 'bridge-of-poles'; section.hidden = slug !== 'camera-obscura' && !lion && !car && !bridge; section.textContent = bridge ? localText(lang, sectionEnabled ? 'Tie the lashings' : 'Take the lashings off', sectionEnabled ? 'Bünde anlegen' : 'Bünde abnehmen') : car ? localText(lang, sectionEnabled ? 'Put the cover on' : 'Lift the cover off', sectionEnabled ? 'Deckel aufsetzen' : 'Deckel abnehmen') : lion ? localText(lang, sectionEnabled ? 'Close the flank' : 'Open the flank', sectionEnabled ? 'Flanke schließen' : 'Flanke öffnen') : localText(lang, sectionEnabled ? 'Close chamber' : 'Open section', sectionEnabled ? 'Kammer schließen' : 'Schnitt öffnen'); section.setAttribute('aria-pressed', String(sectionEnabled)); sectionNote.hidden = !sectionEnabled; sectionNote.textContent = bridge ? localText(lang, 'Without its lashings: the same poles held by the weave alone, as most builds of it today stand. The one engineering reading of his sketch lashes them.', 'Ohne Bünde: dieselben Stangen, nur vom Geflecht gehalten, wie die meisten heutigen Nachbauten stehen. Die eine ingenieurwissenschaftliche Lesart seiner Skizze bindet sie.') : car ? localText(lang, 'Opened, as on his sheet: the cover and the guns are lifted off so you can see the drive. The car itself is closed. The red band on each wheel is our mark, so you can see it turn.', 'Geöffnet wie auf seinem Blatt: Deckel und Geschütze sind abgenommen, damit du den Antrieb siehst. Der Wagen selbst ist geschlossen. Das rote Band an jedem Rad ist unsere Markierung, damit du siehst, wie es sich dreht.') : lion ? localText(lang, 'Section: the near flank panel is taken off so you can see the works. On the lion itself the panel is shut.', 'Schnitt: Die vordere Flankenplatte ist abgenommen, damit du das Werk siehst. Am Löwen selbst ist sie geschlossen.') : localText(lang, 'Section: one corner and the back wall are taken off so you can see in. In the real experiment the chamber is closed and dark.', 'Schnitt: Eine Ecke und die Rückwand sind abgenommen, damit du hineinsehen kannst. Im echten Versuch ist die Kammer geschlossen und dunkel.'); paintPlayback(); if (!source.hidden)
    reading(evidenceRecord ?? record);
    // a label that is still a working line says so under it
    const working = WORKING_LINES[slug]; if (working) { label.textContent = working[lang]; label.append(el('small', 'bench-working', localText(lang, 'working line', 'Arbeitszeile'))); } }
  function paintPlayback() {
    const view = playbackPresentation(schedule, playbackState, lang);
    play.textContent = view.playText;
    play.setAttribute('aria-pressed', String(view.pressed));
    play.disabled = view.motionDisabled;
    restart.disabled = view.motionDisabled;
    restart.textContent = view.restartText;
    timeLabel.textContent = view.timeText;
    holdNote.textContent = view.holdDetail;
    holdNote.hidden = !view.holdDetail;
  }
  async function plateFor(mine: number) { let imageReady = Promise.resolve(); const record = recordOf(slug); const id: Partial<Record<BenchSlug, string>> = { 'flying-machine': 'vinci/folio-page/paris-b-74v', 'armoured-car': 'vinci/folio-page/bm-1860-0616-99-recto', 'bridge-of-poles': 'vinci/codex-page/atlanticus__p0029', 'aerial-screw': 'vinci/ms-page/lesmanuscritsdel02lo__n0340', 'revolving-crane': 'vinci/ms-page/lesmanuscritsdel02lo__n0202', 'camera-obscura': 'vinci/ms-page/lesmanuscritsdel02lo__n0386' }; const manifest = await loadManifest(); if (mine !== serial)
    return; const entry = manifest.byId.get(id[slug] ?? ''); folioEntry = entry?.display && entry.class !== 'REFERENCE-ONLY' ? entry : undefined; folio.replaceChildren(); const cap = el('figcaption', ''); const folioName = record.folio.map(f => `${f.codex} ${localText(lang, 'f.', 'Blatt')} ${f.folio}`).join(', '); if (folioEntry) {
    const img = el('img', '');
    img.alt = folioName;
    img.src = assetAddress(folioEntry);
    folio.append(img);
    imageReady = img.decode().catch(() => { });
    cap.textContent = slug === 'armoured-car' ? `${localText(lang, 'His sheet', 'Sein Blatt')}, British Museum 1860,0616.99\n${localText(lang, 'Photograph of the sheet', 'Fotografie des Blatts')}` : slug === 'bridge-of-poles' ? `${localText(lang, 'His sheet', 'Sein Blatt')}, ${folioName}, Biblioteca Ambrosiana\n${localText(lang, 'Photograph of the sheet', 'Fotografie des Blatts')}` : `${folioName}\n${localText(lang, '1883 historical facsimile', 'Historisches Faksimile von 1883')}`;
    img.onerror = () => { if (mine !== serial)
      return; img.remove(); folio.prepend(el('div', 'bench-absence', localText(lang, 'Plate unavailable', 'Blatt nicht verfügbar'))); };
  }
  else {
    folio.append(el('div', 'bench-absence', localText(lang, 'Image absent', 'Bild fehlt')));
    cap.textContent = `${folioName}\n${holderName(String(record.dossier.folio[0]?.holder ?? ''))}\n${localText(lang, 'No displayable plate in the store.', 'Kein freigegebenes Blatt im Speicher.')}`;
  } folio.append(cap); if (!source.hidden && evidenceRecord?.slug === slug)
    reading(evidenceRecord); await imageReady; }
  // The crane does not slew in its admitted schedule. Its measured swept body
  // has this smaller footprint; the returned dossier allocation is unchanged.
  function displayBounds(){
    return slug==='revolving-crane' ? new Box3(new Vector3(-1,-.05,-1),new Vector3(1,2.705,1.75)) : machine!.bounds;
  }
  /** What the camera frames, where the dossier's rounded envelope is bigger
   * than the body that moves inside it. The compass is the smallest of the
   * fourteen: framed on a box a hand's width larger than itself, its pivot is
   * nine millimetres of nothing. The support keeps the envelope. */
  function frameBounds(){
    return slug==='proportional-compass'
      ? new Box3(new Vector3(-.19,.046,-.042),new Vector3(.19,.652,.042))
      : slug==='bridge-of-poles'
        // the bridge standing, not its bank and the paths of its building
        ? new Box3(new Vector3(-4.5,-.3,-2),new Vector3(4.5,3,2))
        : displayBounds();
  }
  /** The working end of the machine: the part of the object where its
   * fittings are, framed alone so a 9 mm boss is not a 9 px boss. The pair
   * is (height from the top as a fraction of the object, box as a fraction
   * of its span); each one is where that machine's own fitting sits. */
  const FOCUS: Partial<Record<BenchSlug, [number, number]>> = {
    'proportional-compass': [.33, .26], 'camera-obscura': [.5, .3],
    'ball-bearing': [.42, .62], 'revolving-crane': [.52, .3], 'lathe': [.33, .34],
  };
  function focusBounds() {
    const full = displayBounds(), size = full.getSize(new Vector3()), centre = full.getCenter(new Vector3());
    const [drop, part] = FOCUS[slug] ?? [.24, .34];
    const span = Math.max(size.x, size.y, size.z) * part;
    const middle = new Vector3(centre.x, full.max.y - size.y * drop, centre.z);
    const half = new Vector3(span / 2, span / 2, span / 2);
    return new Box3(middle.clone().sub(half), middle.clone().add(half));
  }
  /** the bearing the eye stands on for this machine. The wall behind it is
   * placed off the same vector, so the second plane is always the plane the
   * frame is looking at. */
  function viewDirection(): Vector3 {
    const direction = new Vector3(1.05, .68, 1.6).normalize();
    if (slug === 'camera-obscura')
      direction.set(sectionEnabled ? 1.5 : 1.25, sectionEnabled ? .8 : .5, sectionEnabled ? -.35 : -1.6).normalize();
    if (slug === 'aerial-screw') direction.set(-1.6,.4,.7).normalize();
    if (slug === 'flying-machine') direction.set(1.15,.22,1.6).normalize();
    if (slug === 'bridge-of-poles') direction.set(-.75,.32,1.6).normalize();
    if (slug === 'armoured-car') direction.set(sectionEnabled ? .9 : 1.25, sectionEnabled ? 1.05 : .5, 1.3).normalize();
    if (eye) direction.set(eye.at[0], eye.at[1], eye.at[2]).sub(frameBounds().getCenter(new Vector3())).normalize();
    if (slug === 'flywheel') direction.set(.8,1.2,1.7).normalize();
    if (slug === 'ball-bearing') direction.set(.82,.62,1.66).normalize();
    if (slug === 'rolling-mill') direction.set(-1.5,.75,1.5).normalize();
    if (slug === 'lathe') direction.set(.65,.42,1.9).normalize();
    if (slug === 'parachute') direction.set(1.05,.27,1.6).normalize();
    if (slug === 'revolving-crane') direction.set(2.6,.85,.8).normalize();
    if (slug === 'water-lifting-screw') direction.set(-2.3,1.1,-.3).normalize();
    if (slug === 'proportional-compass') direction.set(1.2,.3,1.75).normalize();
    return direction;
  }
  /** how far the eye stands off a box on that bearing, at this frame's shape */
  function eyeDistance(box: Box3, direction: Vector3, mobile: boolean): number {
    const size = box.getSize(new Vector3()), centre = box.getCenter(new Vector3());
    const span = Math.max(size.x, size.y, size.z);
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), direction).normalize(), up = new Vector3().crossVectors(direction, right).normalize();
    const tanY = Math.tan(17 * Math.PI / 180), tanX = tanY * innerWidth / innerHeight, width = mobile ? .84 : .7, height = slug === 'proportional-compass' ? (mobile ? .38 : .95) : (mobile ? .31 : .8);
    let distance = span;
    for (const x of [box.min.x, box.max.x])
      for (const y of [box.min.y, box.max.y])
        for (const z of [box.min.z, box.max.z]) {
          const p = new Vector3(x, y, z).sub(centre), depth = p.dot(direction);
          distance = Math.max(distance, depth + Math.abs(p.dot(right)) / (tanX * width), depth + Math.abs(p.dot(up)) / (tanY * height));
        }
    return distance;
  }
  function compose() {
    if (!machine)
      return;
    if (eye && POSED_RIG.has(slug)) { composeEye(eye); return; }
    const box = closeUp ? focusBounds() : frameBounds(), size = box.getSize(new Vector3()), centre = box.getCenter(new Vector3()), span = Math.max(size.x, size.y, size.z), mobile = innerWidth <= 1280;
    const direction = viewDirection();
    const right = new Vector3().crossVectors(new Vector3(0, 1, 0), direction).normalize(), up = new Vector3().crossVectors(direction, right).normalize();
    const distance = eye ? new Vector3(...eye.at).distanceTo(centre) : eyeDistance(box, direction, mobile);
    camera.aspect = innerWidth / innerHeight;
    camera.fov = 34;
    camera.near = Math.max(.001, span / 1000);
    camera.far = span * 50;
    camera.position.copy(centre).addScaledVector(direction, distance);
    camera.lookAt(centre);
    camera.setViewOffset(innerWidth, innerHeight, mobile ? 0 : innerWidth * .12, mobile ? innerHeight * .295 : slug === 'proportional-compass' ? innerHeight * .035 : 0, innerWidth, innerHeight);
    if (eye) {
      // the rig's own eye: its field spans the picture's frame, centred in it
      const [, top, , tall] = eye.frame ?? [0, 0, 1, 1];
      camera.fov = 2 * Math.atan(Math.tan(((eye.fov ?? 34) * Math.PI / 180) / 2) / tall) * 180 / Math.PI;
      camera.position.set(...eye.at);
      camera.lookAt(...eye.look);
      camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * (.5 - (top + tall / 2)), innerWidth, innerHeight);
    }
    camera.updateProjectionMatrix();
    // The far cascade is a box around the origin, so the floor beyond it took
    // no shadow at all and stood there as a hard edged dark quad. The air
    // now closes inside that box, and the ground hands itself to the air.
    // THE AIR IS WHAT MAKES THE WALL THE SAME WALL ON EVERY MACHINE. Its own
    // lit value swings with the bearing: the crane's wall turns away from the
    // key and the aerial screw's stands nearly square to it. So the air is
    // fitted to the wall rather than to the machine, and the wall is always
    // read through the same depth of it, whatever the sun is doing to it.
    const near = distance + span * .5;
    const far = BENCH_BACK_PLANE
      ? near + (distance + BACK_PLANE_METRES - near) / BACK_PLANE_AIR
      : distance + span * 1.9;
    scene.fog=new Fog('#1a2026',near,far);
    scene.fogNode = fog(backdrop, rangeFogFactor(float(near), float(far)));
  }
  /** the posed rig's fixed eye: the bench's lens, its dock offset and its air, from a given place */
  function composeEye(fixed: NonNullable<BenchOptions['eye']>) {
    const box = frameBounds(), centre = box.getCenter(new Vector3()), span = Math.max(...box.getSize(new Vector3()).toArray()), mobile = innerWidth <= 1280;
    camera.aspect = innerWidth / innerHeight;
    camera.fov = fixed.fov ?? 34;
    camera.near = .02;
    camera.far = span * 50;
    camera.position.set(...fixed.at);
    camera.lookAt(new Vector3(...fixed.look));
    camera.setViewOffset(innerWidth, innerHeight, mobile ? 0 : innerWidth * .12, mobile ? innerHeight * .295 : 0, innerWidth, innerHeight);
    camera.updateProjectionMatrix();
    const distance = camera.position.distanceTo(centre);
    const near = distance + span * .5;
    const far = BENCH_BACK_PLANE ? near + (distance + BACK_PLANE_METRES - near) / BACK_PLANE_AIR : distance + span * 1.9;
    scene.fog = new Fog('#1a2026', near, far);
    scene.fogNode = fog(backdrop, rangeFogFactor(float(near), float(far)));
  }
  async function supports(mine: number) {
    if (!machine) return;
    const [stone, iron] = await Promise.all([
      loadMachineMaterial(stack, 'limestone-pale'),
      loadMachineMaterial(stack, 'iron-forged'),
    ]);
    if (mine !== serial) return;
    supportSets.push(stone, iron);
    const groundMat = new MeshStandardNodeMaterial({ roughness: stone.roughness, metalness: stone.metalness });
    groundMat.colorNode = vec3(stone.albedo.r * .025, stone.albedo.g * .025, stone.albedo.b * .025);
    // A metre-scale band was tried here when the air began to reach the wall
    // and it read as water: a low frequency on a horizontal plane seen at a
    // grazing angle stretches into ripples whatever its contrast. The floor
    // keeps the three scales it had.
    const groundDetail = stack.detail(groundMat, stone, { count: 3, mid: .06, maps: .4, macro: .4 });
    groundMat.roughnessNode = groundDetail.roughness.max(.94);
    // WHERE THE PLATE MEETS THE FLOOR. A cast shadow says where the sun is; it
    // does not say that two surfaces touch. Without the dark line an edge
    // holds against the floor it stands on, the plate reads as a card laid on
    // the air, which is what the phone frame showed. The line is the plate's
    // own footprint, closing over a hand's width.
    {
      const box = displayBounds(), size = box.getSize(new Vector3()), middle = box.getCenter(new Vector3());
      const reach = Math.max(.06, Math.max(size.x, size.z) * .05);
      const dx = positionWorld.x.sub(middle.x).abs().sub(size.x * .54).max(0);
      const dz = positionWorld.z.sub(middle.z).abs().sub(size.z * .54).max(0);
      const outside = dx.mul(dx).add(dz.mul(dz)).sqrt();
      groundMat.aoNode = float(1).sub(float(1).sub(smoothstep(0, reach, outside)).mul(.62));
    }
    // The platform is read from twice as far away on the phone as on the
    // wide frame, so its coarsest band is the one that has to survive: a
    // metre-scale variation the minified maps cannot average away.
    const supportMat = iron.material({
      count: 3, uv: uv(), scales: [.9, .16, .004], macro: .5, mid: .95, micro: .7,
      fade: [26, 150],
    });
    // The parachute's harness ring is a dark iron loop hanging over the deck.
    // At the deck's inherited value the two were the same colour.
    if (slug === 'parachute') supportMat.colorNode = supportMat.colorNode!.mul(1.45)
    // The smallest object on the bench stands on a plate the key barely
    // grazes, so the compass reads as an outline against nothing. The plate
    // is given the light its top face is standing in.
    if (slug === 'proportional-compass') supportMat.colorNode = supportMat.colorNode!.mul(1.7);
    const finish = BENCH_FINISH[slug];
    if (finish) { supportMat.roughnessNode = float(finish.roughness); supportMat.metalnessNode = float(finish.metalness); supportMat.colorNode = supportMat.colorNode!.mul(finish.tone); }
    if (slug === 'multi-barrel-gun') {
      // GENERATED indirect-contact approximation of the two exact wheel
      // cylinders. Shared GTAO is off; the existing key shadow remains.
      const gap = positionWorld.z.pow(2).add(.25).sqrt().sub(.5);
      const onTop = float(1).sub(smoothstep(.001, .004, positionWorld.y.abs()));
      const contact = (centreX: number) => {
        const dx = positionWorld.x.sub(centreX).abs().sub(.04).max(0);
        const distance = dx.pow(2).add(gap.pow(2)).sqrt();
        return float(1).sub(smoothstep(0, .06, distance)).mul(onTop);
      };
      supportMat.aoNode = float(1).sub(contact(-1.08).max(contact(1.08)).mul(.75));
    }
    // GENERATED contact shade under the size figure, for a machine whose
    // figure stands where no sun reaches the floor
    const contact = OWN_LIGHT[slug]?.contact;
    if (figure && contact) {
      const away = positionWorld.xz.sub(vec2(figure.at[0], figure.at[1])).length();
      const shade = float(1).sub(float(1).sub(smoothstep(.1, .55, away)).mul(contact));
      supportMat.aoNode = supportMat.aoNode ? (supportMat.aoNode as unknown as ReturnType<typeof float>).mul(shade) : shade;
    }
    supportMaterials.push(groundMat, supportMat);
    const made = buildBenchSupports({
      slug,
      machineBounds: machine.bounds,
      displayBounds: displayBounds(),
      ironMaterial: supportMat,
      groundMaterial: groundMat,
    });
    display.add(...made.meshes);
    supportGeometries.push(...made.geometries);
    if (figure) {
      const scale = buildScaleFigure();
      figureGroup = scale.group;
      const [fx, fy, fz] = figure.at.length === 3 ? figure.at : [figure.at[0], machine.bounds.min.y, figure.at[1]];
      scale.group.position.set(fx, fy, fz);
      scale.group.rotation.y = (figure.yaw ?? 0) * Math.PI / 180;
      display.add(scale.group);
      supportGeometries.push(scale.geometry);
      supportMaterials.push(scale.material);
    }
    if (BENCH_BACK_PLANE) {
      const box = displayBounds(), mobile = innerWidth <= 1280;
      const wall = buildBackPlane({
        centre: box.getCenter(new Vector3()),
        toward: viewDirection(),
        floorY: machine.bounds.min.y - Math.max(...box.getSize(new Vector3()).toArray()) * .034,
        cameraDistance: eye ? new Vector3(...eye.at).distanceTo(box.getCenter(new Vector3())) : eyeDistance(closeUp ? focusBounds() : frameBounds(), viewDirection(), mobile),
      });
      const tuffeau = await loadMachineMaterial(stack, 'stone-tuffeau');
      if (mine !== serial) { wall.geometry.dispose(); return; }
      supportSets.push(tuffeau);
      const wallMaterial = backPlaneMaterial(stack, tuffeau, (wall.geometry as PlaneGeometry).parameters.height, wallFocus ?? BENCH_WALL_FOCUS[slug] ?? 0, BENCH_WALL_VALUE[slug]);
      wall.mesh.material = wallMaterial;
      supportMaterials.push(wallMaterial);
      supportGeometries.push(wall.geometry);
      display.add(wall.mesh);
    }
  }
  /** The standing machine and its supports: mounted, and dressed with their own sets. */
  function parts() {
    const state = machine?.standing?.() ?? { mounted: ready, dressed: ready, error: null };
    const bare = supportSets.filter(set => !materialDressed(set)).map(set => `${set.name} undressed (${materialFailure(set) ?? 'no maps yet'})`);
    return { mounted: state.mounted, dressed: state.dressed && bare.length === 0, error: [state.error, ...bare].filter(Boolean).join('; ') || null };
  }
  /** A machine whose working faces turn down or away from the hour's sun
   * (the car's skirt, ports and the underside of its eave) takes more of the
   * sky and a paler bounce off the stone it stands on. The hour, the sun's
   * place and every other machine's light stay as they are.
   * The screw's cloth and frame are seen from below at eye height. Its near-flat
   * cloth under a 17 degree sun needs its shadow looked up 15 cm toward the key
   * (at 3 cm the texel's depth slope made acne that read as moire) and a wider
   * filter, or the upper whorl's edge on the lower steps. A machine may also
   * carry its own exhibition lamps. */
  // lux, ambient and ground left out keep the hour's own (185, .72, #343532)
  const OWN_LIGHT: Partial<Record<BenchSlug, { lux?: number; ambient?: number; ground?: string; lift?: number; wide?: boolean; lamps?: { closed?: BenchLamp[]; section?: BenchLamp[] }; fill?: { closed?: number; section?: number }; sectionLux?: number; contact?: number }>> = {
    'aerial-screw': { lux: 210, ambient: 1.0, ground: '#5e5546', lift: .15, wide: true, contact: .9, lamps: {
      // the grey figure stands in the canopy's shade with the low sun behind it: a lamp from the visitor's side lights
      // the figure alone (the screw's own surfaces refuse it), and its contact shade holds it to the floor
      closed: [{ at: [9, 4.5, 13], aim: [2.35, .95, .9], lux: 330, kelvin: 5200, angle: .25, penumbra: .9, shadow: false }],
    } },
    'flying-machine': { lamps: { closed: [
      // the wash, high on the visitor's side: falling off with distance, it
      // lights the near wing more than the far one, as a lamp in a hall does
      { at: [7, 10, 7], aim: [1, 2.6, -0.4], lux: 260, kelvin: 4300, angle: .62, penumbra: .6, decay: 2 },
      // a narrow spot from high over the feet end onto the trough, where the man
      // works the wings: from there the pivot's hubs, pin and spars throw their
      // shadow ahead of his head, not across his back (kept low: the root cloth
      // in its cone would otherwise be the brightest thing in view)
      { at: [2.5, 10.5, -3], aim: [0, 1.5, -0.6], lux: 450, kelvin: 4000, angle: .10, penumbra: .55, decay: 2 },
      // a low spot from the front, under the wings, onto the man
      { at: [1.2, 3.0, 6.5], aim: [0, 1.45, -0.5], lux: 450, kelvin: 4000, angle: .13, penumbra: .55, decay: 2, shadow: false },
      // a low fill on the visitor's side for the faces the high lamps cannot reach,
      // two thirds of a stop under the lit face, so the cloth still turns under one light
      { at: [6.5, 0.6, 6.5], aim: [1.8, 3.4, -0.6], lux: 200, kelvin: 3800, angle: .5, penumbra: .6, decay: 2, shadow: false },
    ] } },
    // the hour's sun takes the lion's right; one lamp high on its left front models the carving and the gilt mane,
    // and with the flank off a second one, lower and casting no shadow (a second pass of every part), reaches in on the works
    'mechanical-lion': { lux: 185, ambient: .72, ground: '#343532', lamps: {
      closed: [{ at: [2.6, 3.4, 3.4], aim: [.1, .7, .4], lux: 140, kelvin: 4000, angle: .6, penumbra: .9, decay: 2 }],
      section: [{ at: [2.6, 3.4, 3.4], aim: [.1, .7, .4], lux: 140, kelvin: 4000, angle: .6, penumbra: .9, decay: 2 },
        { at: [2, 1.7, 1], aim: [.1, .78, .55], lux: 200, kelvin: 4000, angle: .5, penumbra: .7, decay: 2, shadow: false }],
    } },
    // the bridge on its bank: the low sun from the near bank's side is its key, stronger, the sky's share on its own
    // surfaces cut so each pole turns from lit to shade across its round; the bank's earth in the bounce; and one broad
    // lamp high over the far bank's back, falling off with distance, for the tops of the poles and their far edges
    'bridge-of-poles': { lux: 360, ambient: .55, ground: '#5a5040', wide: true, fill: { closed: .5, section: .5 }, lamps: { closed: [
      { at: [4, 10, -6], aim: [0, 1.4, 0], lux: 130, kelvin: 4300, angle: .6, penumbra: .8, decay: 2 },
    ], section: [
      { at: [4, 10, -6], aim: [0, 1.4, 0], lux: 130, kelvin: 4300, angle: .6, penumbra: .8, decay: 2 },
    ] } },
    'armoured-car': { lux: 240, ambient: 1.15, ground: '#6a604f', sectionLux: 140, fill: { closed: .4 }, lamps: {
      // low on the sun's side of the visitor: the near skirt and eave take the most, the cone turns away from it
      // into shade and its far side falls off, as under one lamp in a hall
      closed: [{ at: [-5, 3.6, 4.6], aim: [.2, .8, 1.2], lux: 280, kelvin: 4300, angle: .7, penumbra: .8, decay: 2 },
        // and one low under the eave on the same side, so the skirt turns from lit to shade across the front; low enough
        // to pass under the eave, it needs no shadow map
        { at: [-3.5, 1.2, 5.5], aim: [.5, .35, 2.2], lux: 170, kelvin: 4300, angle: .5, penumbra: .9, decay: 2, shadow: false }],
      // opened, a narrow lamp high over each far lantern, steep enough to reach between the drum and its wheel, where
      // the pegs enter the staves and the drive binds; the floor round them stays dim
      section: [
        { at: [.6, 3.9, .7], aim: [.68, .74, -.8], lux: 320, kelvin: 4300, angle: .16, penumbra: .6, decay: 2 },
        { at: [-.6, 3.9, .7], aim: [-.68, .74, -.8], lux: 320, kelvin: 4300, angle: .16, penumbra: .6, decay: 2 },
        // and a broad soft one over the near rim, so the tub's floor, the near wheels and both cranks read from above;
        // soft enough that the floor stays quiet under the phone's dock
        { at: [0, 4.8, 3.2], aim: [0, .15, .2], lux: 40, kelvin: 4300, angle: .75, penumbra: 1, decay: 2, shadow: false },
      ],
    } },
  };
  let lamps: SpotLight[] = [], lampProbe: BenchLamp[] | null | undefined, fillProbe: number | undefined, luxProbe: number | undefined;
  const lampLit = new Set<MeshStandardNodeMaterial>(), filled = new Set<MeshStandardNodeMaterial>();
  function dropLamps() { for (const m of lampLit) { m.lightsNode = null; m.needsUpdate = true; } lampLit.clear(); for (const m of filled) { m.envMap = null; m.envMapIntensity = 1; m.needsUpdate = true; } filled.clear(); for (const lamp of lamps) lamp.dispose(); lamps = []; }
  /** A machine's own lamps for the state it stands in: given to its own surfaces and the figure's, so the room
   * keeps the hour's key alone. */
  function lampMachine() {
    const state = sectionEnabled ? 'section' : 'closed';
    const specs = lampProbe !== undefined ? lampProbe ?? [] : OWN_LIGHT[slug]?.lamps?.[state] ?? [];
    const fill = fillProbe ?? OWN_LIGHT[slug]?.fill?.[state];
    const own = OWN_LIGHT[slug], lux = luxProbe ?? (sectionEnabled ? own?.sectionLux : undefined) ?? own?.lux;
    // the hour's sun at this machine's own strength for the state it stands in
    if (key && own && lux !== undefined) key.light.intensity = lux / 100;
    if (!specs.length && !lamps.length && fill === undefined && !filled.size) return;
    dropLamps();
    if (!machine) return;
    // the sky's share on the machine's own surfaces: less of it lets the one light model a form's turn
    if (fill !== undefined && scene.environment) machine.object.traverse(node => {
      if (!(node instanceof Mesh)) return;
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
        if (!(m instanceof MeshStandardNodeMaterial) || filled.has(m)) continue;
        m.envMap = scene.environment; m.envMapIntensity = fill; m.needsUpdate = true; filled.add(m);
      }
    });
    if (!specs.length) return;
    for (const spec of specs) {
      const at = new Vector3(...spec.at), aim = new Vector3(...spec.aim), reach = at.distanceTo(aim), decay = spec.decay ?? 0;
      const lamp = new SpotLight(kelvinToColour(spec.kelvin), spec.lux / 100 * (decay === 2 ? reach * reach : 1), 0, spec.angle, spec.penumbra, decay);
      lamp.position.copy(at);
      lamp.target.position.copy(aim);
      lamp.castShadow = spec.shadow !== false;
      lamp.shadow.mapSize.set(2048, 2048);
      lamp.shadow.camera.near = Math.max(.5, reach - 9);
      lamp.shadow.camera.far = reach + 12;
      lamp.shadow.bias = -.0002;
      lamp.shadow.normalBias = .01;
      lamp.updateMatrixWorld(true);
      lamp.target.updateMatrixWorld(true);
      lamps.push(lamp);
    }
    const hour: Light[] = [];
    scene.traverse(node => { if ((node as Light).isLight) hour.push(node as Light); });
    const lit = lights([...hour, ...lamps]);
    for (const root of [machine.object, figureGroup]) root?.traverse(node => {
      if (!(node instanceof Mesh)) return;
      for (const m of Array.isArray(node.material) ? node.material : [node.material]) {
        // a surface the lamp cannot reach says so in its own copy
        if (!(m instanceof MeshStandardNodeMaterial) || lampLit.has(m) || m.userData['benchLamp'] === false) continue;
        m.lightsNode = lit; m.needsUpdate = true; lampLit.add(m);
      }
    });
  }
  /** how far toward the key a cloth looks up its shadow */
  let clothLift = .03;
  function lightBench() {
    const scale = recordOf(slug).dossier.scale_m, span = Math.max(scale.x, scale.y, scale.z);
    const own = OWN_LIGHT[slug];
    clothLift = own?.lift ?? .03;
    key?.dispose();
    // The far cascade is a box around the origin. It has to contain the wall
    // as well as the machine, or the floor between them takes no shadow
    // lookup at all and draws as a hard edged quad.
    const reach = BENCH_BACK_PLANE ? Math.max(span * 3.4, BACK_PLANE_METRES * 1.45) : span * 3.4;
    key = stack.light({ azimuth: BENCH_SUN_AZIMUTH_DEGREES, elevation: BENCH_SUN_ELEVATION_DEGREES, kelvin: 4800, lux: own?.lux ?? 185, ambient: own?.ambient ?? .72, reach: Math.max(24, span * 6, reach * 2.2), cascades: [span * 1.25, reach], sky: { zenith: '#707579', horizon: '#b1a895', ground: own?.ground ?? '#343532', stars: 0 } });
    key.light.shadow.normalBias = span * .0002;
    key.light.shadow.bias = -span * .00001;
    if (own?.wide) (key.light.shadow as unknown as { filterNode: unknown }).filterNode = wideShadowFilter;
    // the surfaces that give an edge its rim answer to the light that is
    // actually standing here, not to a second copy of the hour
    setBenchKey(key.direction);
  }
  async function open(opts: BenchOptions = {}) { const requested = opts.slug ?? 'aerial-screw'; if (!isBenchSlug(requested))
    throw new Error(`No complete machine: ${requested}`);
    const requestedEvidence = opts.evidence === undefined ? null : opts.evidence === requested ? recordOf(requested) : partialCatalog.find(record => record.slug === opts.evidence);
    if (opts.evidence !== undefined && !requestedEvidence) throw new Error(`No evidence record for ${requested}: ${opts.evidence}`);
    evidence.close(false);
    const mine = ++serial; active = true; host.hidden = false; ready = false; loading.hidden = false; clearDisplay(); folioEntry = undefined; folio.replaceChildren(); slug = requested; evidenceRecord = recordOf(slug); lang = controlLanguage(location.search, opts.lang); schedule = playbackSchedule(recordOf(slug).dossier); playbackState = initialPlayback(schedule, { t: opts.t, fixed: document.body.classList.contains('forge'), reducedMotion: reduced.matches }); lastWall = performance.now(); stamp(); stack.setScene(scene, camera, { ...IDENTITY, name: 'vinci-machine-bench', exposure: .95, grain: .004, ao: { intensity: 1, distance: Math.max(...Object.values(recordOf(slug).dossier.scale_m).filter((v): v is number => typeof v === 'number')) * .025, thickness: 1 } }); lightBench(); if (opts.keyProbe === 'off' && key) key.light.intensity = 0; machine = isShowcaseSlug(slug) ? buildShowcase(slug, stack) : buildBenchMachine(slug, stack); closeUp = opts.close ?? false; eye = opts.eye ?? null; wallFocus = opts.wallFocus; figure = POSED_RIG.has(slug) ? null : opts.figure ?? null; lampProbe = opts.lamp; fillProbe = opts.fill; luxProbe = opts.lux;
    if (opts.figure && POSED_RIG.has(slug)) { sizeFigure = makeFigure(figureMaterial, 'size-figure'); sizeFigure.pose(standingJoints(opts.figure.turn ?? 0, opts.figure.at as [number, number, number])); sizeFigure.group.userData['assetClass'] = 'GENERATED'; figureGroup = sizeFigure.group; display.add(sizeFigure.group); } sectionEnabled = (slug === 'camera-obscura' || slug === 'mechanical-lion' || slug === 'armoured-car' || slug === 'bridge-of-poles') && (opts.section ?? false); machine.section(sectionEnabled); display.add(machine.object); compose(); paint(); await Promise.all([machine.ready, supports(mine), plateFor(mine)]); if (mine !== serial)
    return; machine.animate(playbackState.clock, 0); lampMachine();
    if(key){
      const towardKey=vec3(key.direction.x,key.direction.y,key.direction.z).mul(clothLift);
      machine.object.traverse(node=>{
        if(!(node instanceof Mesh))return;
        const materials=Array.isArray(node.material)?node.material:[node.material];
        if(!materials.some(mat=>{const family=mat.name.split(':')[1]??'';return /linen/.test(family)&&!/thread/.test(family);}))return;
        for(const material of materials){if(material instanceof MeshStandardNodeMaterial){material.receivedShadowPositionNode=positionWorld.add(towardKey);material.needsUpdate=true;}}
        if(opts.clothProbe==='no-shadow')node.receiveShadow=false;
        if(opts.clothProbe==='flat-normal')for(const material of materials){if(material instanceof MeshStandardNodeMaterial){material.normalNode=null;material.needsUpdate=true;}}
      });
    }
    // The crane out of the store carries its rope inside the baked body, and
    // the parts the experiment names belong to the built one.
    storeCrane = slug === 'revolving-crane' && machine && 'reading' in machine ? (machine as StoreCrane).reading() : null;
    const ropeParts = storeCrane?.standing === 'store' ? ['lathe', 'parachute'] : ['revolving-crane', 'lathe', 'parachute'];
    const ropeMode = opts.ropeProbe ?? (ropeParts.includes(slug) ? 'offset-2mm' : undefined);
    if (ropeMode && key && ropeParts.includes(slug)) {
      if (slug !== 'lathe' && slug !== 'revolving-crane' && slug !== 'parachute') throw new Error(`No rope experiment for ${slug}`);
      ropeExperiment = applyRopeShadowExperiment(machine.object, slug, ropeMode, key.direction);
    }
    if (requestedEvidence) evidence.open(requestedEvidence, read);
    ready = true; loading.hidden = true; metrics?.reset(); stamp(); lastWall = performance.now(); console.log(`[bench] mounted ${slug} period=${recordOf(slug).dossier.motion.period_s} tier=${stack.tierName()}`); }
  function close() { if (!active)
    return; setBenchKey(null); serial++; evidence.close(false); active = false; host.hidden = true; ready = false; clearDisplay(); key?.dispose(); key = null; }
  function navigate(delta: number) { const id = BENCH_SLUGS[(BENCH_SLUGS.indexOf(slug) + delta + BENCH_SLUGS.length) % BENCH_SLUGS.length]; if (id) {
    history.pushState({}, '', `/bench/vinci/machines/${id}${location.search}`);
    void open({ slug: id });
  } }
  section.onclick = () => { sectionEnabled = !sectionEnabled; machine?.section(sectionEnabled); lampMachine(); compose(); paint(); metrics?.reset(); };
  previous.onclick = () => navigate(-1);
  next.onclick = () => navigate(1);
  select.onchange = () => { history.pushState({}, '', `/bench/vinci/machines/${select.value}${location.search}`); void open({ slug: select.value }); };
  play.onclick = () => { playbackState = togglePlayback(schedule, playbackState); machine?.animate(playbackState.clock, 0); lastWall = performance.now(); paintPlayback(); metrics?.reset(); };
  restart.onclick = () => { playbackState = restartPlayback(schedule, reduced.matches); machine?.animate(0, 0); lastWall = performance.now(); paintPlayback(); metrics?.reset(); };
  function changeLanguage(nextLanguage: Language) {
    lang = nextLanguage;
    history.replaceState(history.state, '', addressWithLanguage(location.href, lang));
    paint();
    const mine = serial, selectedLanguage = lang, plate = plateFor(mine);
    if (metrics) {
      metrics.close();
      void plate.then(() => { if (active && mine === serial && selectedLanguage === lang) metrics.reset(); });
    }
  }
  reduced.addEventListener('change', event => {
    if (!active) return;
    const nextState = playbackOnReducedMotionChange(schedule, playbackState, event.matches);
    if (nextState === playbackState) return;
    playbackState = nextState;
    lastWall = performance.now();
    machine?.animate(playbackState.clock, 0);
    paintPlayback();
    metrics?.reset();
  });
  en.onclick = () => changeLanguage('en');
  de.onclick = () => changeLanguage('de');
  read.onclick = () => { evidence.open(recordOf(slug), read); metrics?.reset(); };
  let wheelAt = 0;
  host.addEventListener('wheel', e => { if (!active || !source.hidden || e.target instanceof HTMLElement && e.target.closest('.bench-dock,.bench-footer,.bench-header'))
    return; if (Math.abs(e.deltaY) > 30 && performance.now() - wheelAt > 800) {
    wheelAt = performance.now();
    navigate(Math.sign(e.deltaY));
  } }, { passive: true });
  host.style.pointerEvents = 'auto';
  addEventListener('keydown', e => {
    if (!active)
      return;
    if (evidence.isOpen()) return;
    if (e.target instanceof HTMLElement && e.target.closest('button,a,input,select,textarea,summary'))
      return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      navigate(1);
    }
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      navigate(-1);
    }
    if (e.code === 'Space') {
      e.preventDefault();
      play.click();
    }
  });
  addEventListener('resize', () => { if (active) {
    compose(); metrics?.reset(); } });
  // a rig's moving eye for a still machine's clip: only an eye a rig set moves; the air stays as the first eye set it,
  // since a new fog node recompiles every surface
  (window as unknown as Record<string, unknown>)['__benchEye'] = (next: BenchOptions['eye']): boolean => {
    if (!active || !eye || !next) return false;
    eye = next;
    const [, top, , tall] = eye.frame ?? [0, 0, 1, 1];
    camera.fov = 2 * Math.atan(Math.tan(((eye.fov ?? 34) * Math.PI / 180) / 2) / tall) * 180 / Math.PI;
    camera.position.set(...eye.at);
    camera.lookAt(...eye.look);
    camera.setViewOffset(innerWidth, innerHeight, 0, innerHeight * (.5 - (top + tall / 2)), innerWidth, innerHeight);
    camera.updateProjectionMatrix();
    return true;
  };
  return { open, close, active: () => active, frame(dt: number) { if (!active)
      return; const now = performance.now(); if (ready)
      playbackState = advancePlayback(schedule, playbackState, (now - lastWall) / 1000); lastWall = now; if (ready) {
      machine?.animate(playbackState.clock, dt);
      if (now - lastPlaybackPaint >= 100) {
        paintPlayback();
        lastPlaybackPaint = now;
      }
    }
    stack.render(dt);
    if (metrics) {
      const tier = stack.tierName();
      if (tier !== metricsTier) { metricsTier = tier; metrics.reset(); }
      metrics.afterRender({ slug, t: playbackState.clock, ready, playing: playbackState.playing && !playbackState.fixed, section: sectionEnabled, period_s: recordOf(slug).dossier.motion.period_s });
    }
  }, machine() {
    if (!machine) return null;
    const snapshot = { slug, body: storeCrane ?? undefined, period: recordOf(slug).dossier.motion.period_s, period_s: recordOf(slug).dossier.motion.period_s, t: playbackState.clock, joints: machine.joints(), bounds: machine.bounds.getSize(new Vector3()).toArray(), occupied: new Box3().setFromObject(machine.object).getSize(new Vector3()).toArray(), ready: ready && parts().dressed && (metrics?.ready() ?? true), parts: parts(), playing: playbackState.playing, section: sectionEnabled, evidence: { open: evidence.isOpen(), recordSlug: evidence.isOpen() ? evidenceRecord?.slug ?? null : null } };
    return metrics ? { ...snapshot, metrics: metrics.reading() } : snapshot;
  }, slug: () => slug, ids: () => BENCH_SLUGS, station(id: string) { if (!isBenchSlug(id))
      return false; void open({ slug: id }); return true; }, manifest() { return [folioEntry, storeCrane?.entry].filter((entry): entry is ManifestEntry => Boolean(entry)); }, relight() { if (active) {
      lightBench(); metrics?.reset(); } }, freeze(t: number) { playbackState = freezePlayback(t); machine?.animate(playbackState.clock, 0); paintPlayback(); if (active) metrics?.reset(); }, ready: () => ready && parts().dressed && (metrics?.ready() ?? true) };
}
