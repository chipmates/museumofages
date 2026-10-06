# Workflows

`ci.yml` runs on every push to `main`, on every pull request into `main`, and by hand. It checks what a clean runner can check without the museum's asset store. A newer push to the same pull request cancels the older run. The actions are pinned to full commit SHAs, with their version beside each pin, and the workflow may only read the repository.

**Museum.** In `museum/`, with Node from `.nvmrc` and pnpm from the `packageManager` field in `museum/package.json`. It installs from the lockfile, type-checks the source, checks the records the repository carries (`node forge/manifest-check.mjs --records-only`), and runs the film's tests. The checkout holds the whole history, because some of those tests read the code of earlier commits. A test that needs the store, a film release or the star catalogue skips and says why.

**Site.** From the repository's root, on Python 3.9 and on 3.14. It fetches the site's pictures and music from museumofages.org (the repository keeps only their list, `site/_src/fetch-list.json`, and every file is checked against its hash), builds the site, builds the test registries and the other states of the build's switches, and runs the topic pages' tests. The pictures are cached by the hash of their list, so the live site is read only when the list changes. Two of the build's checks need files the repository does not hold, the wing's inventory and the museum's built record, and the build names each one it skips.

**What runs elsewhere.** `pnpm build`, the full manifest check and the film keys need the asset store, which lives outside this repository. A production build without it stops by design. A pull request that changes the engine or a dependency is merged only after those checks have run with the store.

`../dependabot.yml` proposes package updates for `museum/` every Monday and action updates once a month, each release a week after it is out. Updates of the packages that draw or write the film (three.js, Playwright, sharp) come in a pull request of their own, and a new three.js release is moved to by hand.
