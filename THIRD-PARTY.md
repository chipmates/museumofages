# Third-party code, fonts, data and music

What the museum and museumofages.org use from others, and under which licence. The reproductions of paintings, drawings and notebook pages are not listed here: each one carries its own record and licence line, as [CONTENT-LICENSE.md](CONTENT-LICENSE.md) explains.

## Code the museum ships

| What | Version | Licence | Copyright notice | Where |
|---|---|---|---|---|
| [three.js](https://threejs.org) | 0.185.1 | MIT | © 2010-2026 three.js authors | `museum/package.json`, the licence in the package's `LICENSE` |
| meshopt decoder, shipped with three.js and imported by the museum | as in three.js 0.185.1 | MIT | © 2016-2026 Arseny Kapoulkine | the header of `three/examples/jsm/libs/meshopt_decoder.module.js` |
| [zstddec](https://github.com/donmccurdy/zstddec), the zstd decoder shipped with three.js and loaded by its KTX2 loader | as in three.js 0.185.1 | MIT (the JavaScript wrapper) and BSD-3-Clause (the WebAssembly Zstandard decoder) | © 2020 Don McCurdy; © 2016-present, Yann Collet, Facebook, Inc. | `three/examples/jsm/libs/zstddec.module.js`; the terms read from the upstream package's `package.json` and `LICENSE` |
| [OpenSeadragon](https://openseadragon.github.io) | 6.1.1 | BSD-3-Clause | © 2009 CodePlex Foundation, © 2010-2025 OpenSeadragon contributors | `museum/package.json`, the licence in the package's `LICENSE.txt` |
| [Basis Universal](https://github.com/BinomialLLC/basis_universal) transcoder (`basis_transcoder.js`, `basis_transcoder.wasm`) | copied unchanged from three.js 0.185.1 | Apache License 2.0 | Binomial LLC | `museum/public/basis/`, notice in its `README.md` |

## Fonts museumofages.org ships

| Font | Licence | Copyright notice | Where |
|---|---|---|---|
| Cardo, the serif | SIL Open Font License 1.1 | © 2002-2011 David J. Perry | `site/_src/fonts/cardo-400.woff2`, licence in `LICENSE-Cardo.txt` beside it |
| Marcellus, the sans, with Reserved Font Name "Marcellus". The site serves a cut with added Polish letters, so the cut carries its own name, Ages Display, as the licence asks of a modified version | SIL Open Font License 1.1 | © 2012 Brian J. Bonislawsky DBA Astigmatic (AOETI) | `site/_src/fonts/marcellus-400.woff2`, licence in `LICENSE-Marcellus.txt` beside it |

The museum itself sets its words in the fonts of your system and ships no font file. The letters it builds in 3D are drawn in its own code.

## Music on museumofages.org

| Work | Licence | Where |
|---|---|---|
| "Adrift Among Infinite Stars" by [Scott Buckley](https://www.scottbuckley.com.au), shortened, under the film on the start page | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) | `site/_src/media/music.mp3`, credited on the page while the film runs |

## Data the museum builds from

| Data | What it gives the museum | Licence or terms | Where the museum names it |
|---|---|---|---|
| [OpenStreetMap](https://www.openstreetmap.org/copyright) | the outline of the manor and about a dozen mapped features around it | ODbL 1.0, © OpenStreetMap contributors | `museum/src/wings/vinci/data/closluce.json` (each value's `source` field), the shell's records in `museum/assets/wing-vinci/manifest.json`, and the credit of every picture of the house |
| IGN RGE ALTI® | the relief of the ground around the house, and how high the land around it rises against the sun | Licence Ouverte 2.0 | `terrain.json`, `light-rig.json` and `closluce.json` in `museum/src/wings/vinci/data/`, and the same records |
| [Yale Bright Star Catalogue](https://cdsarc.cds.unistra.fr/viz-bin/cat/V/50), 5th revised edition, catalogue V/50 of the CDS in Strasbourg | the stars over Clos Lucé in the wing, and the stars in the film on museumofages.org | Not confirmed: the CDS licence field and legal page are still to be read by a person. The catalogue's ReadMe states no licence. We use positions, magnitudes and colour indices, carried back to 1517. Credit: Hoffleit and Warren (1991), The Bright Star Catalogue, 5th revised ed., CDS catalogue V/50, via the VizieR catalogue access tool, CDS, Strasbourg, France (DOI: 10.26093/cds/vizier) | `museum/forge/night/real-sky.mjs`, `museum/src/wings/vinci/farewell-night-stars.ts` (with the file's sha256), `site/_src/js/sky-ages.js` |
| [Dutra and Bica (2002), A catalogue of dust clouds in the Galaxy](https://cdsarc.cds.unistra.fr/viz-bin/cat/J/A+A/383/631), A&A 383, 631, catalogue J/A+A/383/631 of the CDS, which includes the Lynds clouds | where the Milky Way's dark clouds lie in the wing's night sky | Not confirmed: the CDS licence field is still to be read by a person. We use a few cloud positions, not the catalogue's data. Credit: Dutra and Bica (2002), A&A 383, 631, via VizieR, CDS, Strasbourg, France (DOI: 10.26093/cds/vizier) | `museum/src/wings/vinci/farewell-night.ts`, and the record of the evening sky in `museum/src/wings/vinci/content.ts` |
| [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) | when the planets set that evening, as the record of the evening sky says | Computed facts (planet setting times). The Horizons manual states no licence. Cited as the manual asks: Giorgini, JD and JPL Solar System Dynamics Group, NASA/JPL Horizons On-Line Ephemeris System, https://ssd.jpl.nasa.gov/horizons/, data retrieved [date] | the record of the evening sky, in `museum/src/wings/vinci/content.ts` |

## Used to build, not shipped

| Tool | Version | Licence |
|---|---|---|
| [Vite](https://vite.dev) | 8.1.5 | MIT |
| [TypeScript](https://www.typescriptlang.org) | 5.9.3 | Apache License 2.0 |
| [Playwright](https://playwright.dev), for the film tools | 1.61.1 | Apache License 2.0 |
| [sharp](https://sharp.pixelplumbing.com), for the forge's picture tools, with its prebuilt libvips | 0.35.4 | Apache License 2.0, libvips LGPL-3.0-or-later |

Each licence above is read from the package's own licence file or field in `museum/node_modules`, or from the licence file shipped beside the font.
