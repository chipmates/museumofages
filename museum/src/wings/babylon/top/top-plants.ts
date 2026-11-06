/* Stop 15's plants, pure: the page (top.ts) and the node checks (forge/babylon/mounts.mjs) both take them. The builders
   come in as arguments, so this file imports types only and runs in node as it is. */
import type { Palm, Plain } from '../open/plain'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
export interface Make {
  buildPlain: (mapPlan: J, opts?: { palms?: boolean; reach?: number }) => Plain
}

/** the plain's plants (open/plain.ts, from the map's own plan), the palms inside the walls among them; a row named in
    top-plan.json `inside` is left off the map page */
export function topPlants(plan: J, tp: J, make: Make): { plain: Plain; all: Palm[] } {
  const plain = make.buildPlain(plan, { reach: Number(tp.plain.reach) })
  const inside = new Set<string>(tp.plain.inside as string[])
  return { plain, all: plain.palms.filter((p) => !inside.has(p.row)) }
}
