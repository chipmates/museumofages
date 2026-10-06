## What does this pull request change?

<!-- One to three sentences. Link the issue it closes, if there is one. -->

Closes #

## Checks

CI runs these on every pull request. Running them first saves a round trip.

- [ ] `pnpm typecheck` reports 0 errors (in `museum/`)
- [ ] `node forge/manifest-check.mjs --records-only` passes (in `museum/`)
- [ ] `node --test forge/film/*.test.mjs` passes (in `museum/`)
- [ ] `python3 site/_src/build.py` completes, if the site changed (from the root)

## Where it applies

- [ ] Words: the English and the German are both changed, under the same key
- [ ] A reconstruction: its sources are named in its record, and a dimension no source gives is a range with its basis on the label
- [ ] A new picture: no file is added to the repository, and the issue or the record names the holder, the source and the licence line word for word
- [ ] Something you can see: tried on a phone and on a desktop, in English and in German
- [ ] The commit subject is in the imperative and under 72 characters, and no message names a person

## Screenshots

<!-- For a change you can see, before and after, on a phone and on a desktop. Remove this section otherwise. -->
