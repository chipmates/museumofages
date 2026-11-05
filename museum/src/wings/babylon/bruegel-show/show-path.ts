/* The showpiece's own camera beat, pure (the page and the geometry check both use it): the keys map-cams.json keeps
   under `only` for a tower state join that state's walk alone, in place of the shared keys their span covers, and the
   shared key after the span cuts back to the walk, so no motion crosses from the vantage down to the stair. The shared
   `path` stays as it is, for every other state and every tool that reads it. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

/** the path's keys a tower state walks */
export function keysFor(cams: J, state: string): J[] {
  const shared: J[] = cams.path
  const own: J[] = cams.only?.[state] ?? []
  if (!own.length) return shared
  const t0 = Math.min(...own.map((k) => k.t as number)), t1 = Math.max(...own.map((k) => k.t as number))
  const keys = [...shared.filter((k) => k.t < t0 - 1e-6 || k.t > t1 + 1e-6), ...own].sort((a, b) => a.t - b.t)
  const after = keys.find((k) => k.t > t1 + 1e-6)
  return keys.map((k) => (k === after ? { ...k, cut: true } : k))
}

/** the second of a state's vantage (its own key marked `vantage`), if it has one */
export function vantageTime(cams: J, state: string): number | null {
  const k = (cams.only?.[state] ?? []).find((x: J) => x.vantage)
  return k ? (k.t as number) : null
}
