"""Where a build script reads and writes.

Three roots: the asset STORE (the museum's bytes, outside the public
repository), the LIBRARY inside it (the CC0 sets a surface is dressed from),
and the WORK folder beside the store, which holds the authoring blend, the
atlases and the raw export. The store is found as forge/vite-na-assets.mjs
finds it, so a script runs the same from the main checkout and from a
worktree: NA_ASSET_STORE, else `asset-store/` beside the app, else the
`store` of the nearest `.museum-local.json` at or above the app (read as
forge/local-paths.mjs reads it).
Only the packed glb crosses into the store, and nothing at all crosses into
the repository: an atlas or a blend committed there would be the store moving
into public git, which the Manifest Law forbids.

Plain python, no bpy: record.py loads this file on its own.
"""

from pathlib import Path
import json
import os

MARKER = '.museum-local.json'


def app_root() -> Path:
    """the app the script was run from (the shell sets cwd, never the script)"""
    return Path(os.getcwd()).resolve()


def local(key: str, start):
    """the Path the nearest marker at or above start names under key, or None.
    Only the nearest file is read; a relative path is read from its folder.
    No `Path | None` annotation: record.py runs on the python3 macOS ships."""
    here = Path(start).resolve()
    while True:
        file = here / MARKER
        if file.exists():
            try:
                values = json.loads(file.read_text(encoding='utf-8'))
            except ValueError as err:
                raise SystemExit(f'{file} is not readable JSON: {err}')
            if not isinstance(values, dict):
                raise SystemExit(f'{file} must hold one JSON object')
            value = values.get(key)
            if value is None or value == '':
                return None
            if not isinstance(value, str):
                raise SystemExit(f'{file}: "{key}" must be a path')
            return (here / value).resolve()
        if here.parent == here:
            return None
        here = here.parent


def store_from(app) -> Path:
    """the asset store for the app at `app`. A build writes into it, so a
    store the marker names must be on disk."""
    named = os.getenv('NA_ASSET_STORE')
    if named:
        return Path(named).resolve()
    beside = Path(app).resolve().parent / 'asset-store'
    if beside.exists():
        return beside
    marked = local('store', app)
    if marked is None:
        raise SystemExit(f'no asset store for {app}: set NA_ASSET_STORE or name it as "store" in a {MARKER}')
    if not marked.is_dir():
        raise SystemExit(f'the asset store {marked} that {MARKER} names is not on disk')
    return marked


def store() -> Path:
    """the asset store, wherever the app stands"""
    return store_from(app_root())


def library() -> Path:
    return store() / 'library'


def work(object_id: str) -> Path:
    """the authoring folder: the blend, the atlases, the raw glb, the receipt"""
    out = store().parent / 'blender' / object_id
    out.mkdir(parents=True, exist_ok=True)
    return out


def models(scope: str, object_id: str) -> Path:
    """where the packed tiers stand in the store, one folder per object"""
    out = store() / scope / 'models' / object_id
    out.mkdir(parents=True, exist_ok=True)
    return out
