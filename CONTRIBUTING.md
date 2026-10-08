# Contributing to Museum of Ages

How to help with the museum's code, its words and its records, and what a change needs before it can land. Most help needs no code at all. Everyone taking part agrees to the [code of conduct](CODE_OF_CONDUCT.md).

## Where to start

| You have | Where it goes |
|---|---|
| A wrong credit, date, sentence or label | The correction form in [the issue picker](https://github.com/chipmates/museumofages/issues/new/choose), with your source |
| Something that does not work | The bug report form in the same picker |
| A screen reader report: how far you got, where it stopped making sense | The bug report form in the same picker |
| A life and a place you would like to see as a wing | "A wing you'd like to see" in the same picker |
| A picture the museum should show | "Something else" in the same picker, with the work, its holder, the page that offers the file and its licence line |
| A third language | "Something else" in the same picker. The museum is built for English and German only today, so it needs work in the code first |
| A change to the code | A pull request, after the setup and the checks below |
| Anything else | "Something else" in the same picker |
| Your institution holds a work shown here | Mail to [contact@museumofages.org](mailto:contact@museumofages.org) |
| A security problem | [SECURITY.md](SECURITY.md), quietly first |

A correction with its source is the quickest way to change what the museum says. It needs no code.

## Setup

Node.js 22 and pnpm 8.15.5. The root's `.nvmrc` pins Node, and the `packageManager` field in `museum/package.json` pins pnpm. Vite 8 asks for Node 22.12 or newer.

```bash
git clone https://github.com/chipmates/museumofages.git
cd museumofages/museum
pnpm install
pnpm dev
```

The museum comes up on [localhost:5199](http://localhost:5199). The lobby is at the root and the Leonardo da Vinci wing at `/w/vinci`. Locally the wing runs its live engine, the same scenes its film is rendered from. An address with `?film=<release>` plays a film release instead, and the releases live outside this repository. `?tier=calm`, `?tier=standard` or `?tier=hero` sets the detail. A browser with no WebGPU adapter takes the WebGL2 path.

**The museum's pictures are not in `museum/`.** Reproductions, textures and the film's frames sit in an asset store outside the repository and are served from the media origin in production. A clone has the code and the records of what it builds, and not the pictures. Without a store, the dev server reads them from museumofages.org as you browse, read only, and says so in its first lines. `node forge/fetch-store.mjs` copies them into `asset-store/` beside the app for offline work, and `NA_ASSET_STORE` points the dev server and the checks at a store somewhere else on your disk:

```bash
NA_ASSET_STORE=/path/to/store pnpm dev
```

To name the store once for every checkout and worktree below a folder, put a `.museum-local.json` holding `{"store": "/path/to/store"}` there, a file git ignores and `.env.example` explains.

How a store is laid out is written at the top of `museum/forge/vite-na-assets.mjs`.

## The checks

From `museum/`:

```bash
pnpm typecheck                      # the strict type check
node forge/manifest-check.mjs --records-only   # every record and its licence line, no store needed
node --test forge/film/*.test.mjs   # the film's tests, about nine minutes on a ten-core laptop
```

`pnpm build` runs the full manifest check first. It stops the build when something the museum shows has no record, when a record has no licence line, or when a file does not match its hash. Matching the files needs a local store, so on a clean clone `pnpm build` stops and says so. The records-only check above is the part every clone can run.

Most of that time goes to five files that build the wing's world again and again (`film-check`, `global-key`, `library`, `motion`, `evening`). To try one change, run its own file: `node --test forge/film/keys.test.mjs`. CI runs the five in parallel jobs of their own.

Two of the film's tests compare today's code with the code of earlier commits, so they need the whole history. A plain `git clone` has it, a shallow clone does not. A few tests also read a film release when `FILM_RELEASE` names one, and skip that part without it. The encoder test needs `ffmpeg` on the PATH and skips without it.

From the repository's root:

```bash
python3 site/_src/tools/fetch.py    # once: the site's pictures and media
python3 site/_src/build.py          # the site, with every check
```

CI runs these on every pull request ([ci.yml](.github/workflows/ci.yml)), and checks that every link a built page has to its own site answers.

## The site

The pages of museumofages.org come from `site/_src/build.py`. It reads the registry (`site/_src/registry.json`), each wing's data files (`site/_src/wings/`), the word files and the templates, and writes the pages into `site/dist/`. It stops, and says why, when an open wing lacks a key, a picture or a word. Python 3 and its standard library are all the build needs.

`python3 site/_src/build.py --test` builds the test registries into `site/_test/` and leaves `site/dist/` alone. Any static file server shows the result, for example `python3 -m http.server -d site/dist`.

The tools in `site/_src/tools/` that cut the pictures and the fonts need more: Pillow, fontTools with brotli, and ImageMagick with AVIF. You need them only to remake a picture or a font.

Colours live in `site/_src/css/tokens.css`. The build stops on a colour written anywhere else.

## Words, in English and German

Every displayed sentence exists in both languages.

- On the site, the words live in `site/_src/words.en.json` and `site/_src/words.de.json` under identical keys, and a wing's own words in `site/_src/wings/<wing>.en.json` and `<wing>.de.json`. A change lands in both files under the same key. The build stops on a key that exists in one language only, on a dash or a semicolon in displayed text, and when one of the locked lines changes, such as the tagline or the trust line.
- In the wing, each text carries its English and its German side by side, as `en` and `de`.

German runs about a third longer than English. Check a change to what you see in German too.

A person reads, corrects and approves every English and German text before it is published. So for a wrong fact, the correction form is quicker than a pull request: we change the sentence in both languages and keep the house's voice. The voice is plain: short sentences, everyday words.

## The bar for a reconstruction

The house rule, written for the Leonardo da Vinci wing: a reconstruction says so, a type stays a type, nothing is his that is not.

- Everything built is modelled from plans, photographs and surveys, or from what a sheet or an old account gives, and it names its source.
- A dimension no source gives is a range, with its basis on the label.
- What a label says carries one of four grades, as the wing shows them:

| Grade | What it means |
|---|---|
| Documented | A source from the time says it, and we name the source. |
| Reconstructed | No source says it outright. We worked it out from what the sources give. |
| Conjectural | We think so, or a scholar does, and no source says it. Take it as a reasoned guess. |
| Not known | Nobody knows. We say that too, and we leave the gap open. |

- Every built thing has a record in `museum/assets/<scope>/manifest.json` with its licence line. Where it rests on someone else's data, the record names that data, as the house's shell names OpenStreetMap and IGN.

## A new picture

Pictures never go into this repository. To propose one, open an issue with the work, its holder, the page where the holder or the source offers the file, and the licence line word for word. We fetch it ourselves and add its record.

We admit a picture only when its licence allows our use and it was fetched by an allowed route.

The licences we take, in this order:

1. **Open at the source.** CC0, a public domain mark, CC BY or CC BY-SA with the attribution kept, or a printed facsimile from before 1930 that a library scanned and marked public domain. This is the default whenever such a copy exists.
2. **A faithful reproduction of a public domain work of visual art** (a painting, a drawing, a manuscript page) from Wikimedia Commons, where the holder claims image rights. Only when no copy of the first kind exists. Its label says so.
3. **A modern scan, model or photograph under a non-commercial Creative Commons licence**, kept with its own licence line. Where the licence allows no changes, the file is shown whole and unchanged.

Never: a modern photograph of a room, an object, a replica or a model without an open licence, a modern reconstruction or replica, a museum's own interpretive text, or a file whose chain of rights is unclear. The museum makes no commercial use of any picture.

The allowed route: the pages a site shows and the files they link, or an open service its owner publishes for reuse. We read the site's `robots.txt` first and keep to it, give our agent an honest name, use no login, key or cookie, and stop where a page refuses an automated reader.

## Pull requests

One concern per pull request, with the checks above green. A change to what you see is tried on a phone and on a desktop, in English and in German, and shows before and after. The [pull request template](.github/PULL_REQUEST_TEMPLATE.md) has the checklist.

By opening a pull request you agree that your change comes in under the terms of the files it changes, as [CONTENT-LICENSE.md](CONTENT-LICENSE.md) says, and that you have the right to offer it under them.

Commit messages: a subject in the imperative (`Fix`, `Add`, `Drop`), under 72 characters, with a capital first letter and no period at the end. A body, where one is needed, says why. The diff already shows what. No message names a person.

## Code

TypeScript strict, `pnpm typecheck` at zero errors. Every material is written in TSL, so the same node graph runs on WebGPU and on WebGL2. pnpm only: no `package-lock.json`, no `yarn.lock`. A comment says what the code cannot show, in a line or two, and names no person. Every control is at least 44 px on a side, above the 24 px that WCAG 2.2 AA asks.
