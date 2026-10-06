// LOCAL PATHS a checkout cannot know: the asset store, the gate lock's
// folder, a research folder. A `.museum-local.json` in the app's folder or
// any folder above it names them, so every worktree below that folder finds
// the same ones:
//
//   {"store": "/abs/path/assets", "lock": "/abs/path/forge", "best_of": "../best-of"}
//
// The nearest file is the only one read, and a key it does not name is not
// set. A relative path is read from the file's own folder. Git ignores the
// file; forge/blender/kit/paths.py reads it the same way.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

export const MARKER = '.museum-local.json'

/** the nearest marker at or above `from` and what it names, or null */
export function nearestMarker(from) {
  for (let dir = resolve(from); ; dir = dirname(dir)) {
    const file = join(dir, MARKER)
    if (existsSync(file)) {
      let values
      try {
        values = JSON.parse(readFileSync(file, 'utf8'))
      } catch (err) {
        throw new Error(`${file} is not readable JSON: ${err.message}`)
      }
      if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error(`${file} must hold one JSON object`)
      return { file, values }
    }
    if (dirname(dir) === dir) return null
  }
}

/** the absolute path the nearest marker names under `key`, or null */
export function localPath(key, from) {
  const marker = nearestMarker(from)
  const value = marker?.values[key]
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new Error(`${marker.file}: "${key}" must be a path`)
  return resolve(dirname(marker.file), value)
}
