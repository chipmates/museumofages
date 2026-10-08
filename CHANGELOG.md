# Changelog

All notable changes to Museum of Ages are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.1.0] - YYYY-MM-DD

The first public version. One wing is open: Leonardo da Vinci's last house in Amboise, as it may have stood on 10 October 1517, rebuilt in code and walked in 17 stops.

### Added

- **The Leonardo da Vinci wing.** The house and its ground are rebuilt from plans, photographs and surveys, and you enter its great hall. Below the garden, the picture room, the mechanism hall, the reading table, the court and the grave court are a museum of our own century. At the last stop you look up at the stars over Clos Lucé that night.
- **The wing as a film.** The wing you walk is a film of its scenes, rendered in the museum's own engine, wide for the desktop and upright for the phone. `museum/forge/film/render-all.mjs` renders the stills and clips, and `museum/forge/film/pack.mjs` packs them into the release the player reads. One machine stands live on top of the film.
- **The lobby**, rendered live: WebGPU first, and the same node graph on WebGL2 where the browser has no adapter. It is in the code and opens at the dev server's root, and museumofages.org does not show it yet.
- **Labels with four grades.** Each stop has three layers of text: the line you read first, a drawer, and the record, which names the sources. The labels tell four grades apart: documented, reconstructed, conjectural and not known.
- **A record for everything shown.** Every reproduction and every built thing has a record with its licence line. `pnpm build` runs the manifest check first and stops when something shown has no record.
- **Working from a clone.** Without the museum's store, the dev server reads the pictures and the film from museumofages.org as you browse, read only. The build ships the licences of its bundled libraries as `third-party-licenses.md`.
- **museumofages.org.** The start page, the wing's page, the page about the museum and the legal pages, in English and German, built by `site/_src/build.py`.

[0.1.0]: https://github.com/chipmates/museumofages/releases/tag/v0.1.0
