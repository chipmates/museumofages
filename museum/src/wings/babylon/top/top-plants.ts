/* Stop 15's plants, pure: the page (top.ts) and the node checks (forge/babylon/mounts.mjs) both take them. The builders
   come in as arguments, so this file imports types only and runs in node as it is. */
import type { Palm, Plain } from '../open/plain'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
export interface Make {
  buildPlain: (mapPlan: J, opts?: { palms?: boolean; reach?: number }) => Plain
}

/** the plain's plants outside the walls (open/plain.ts, from the map's own plan); its few palms by the canal inside them
    are left out here: they and their long evening shadows reach the street stops' stills (the stair's, Gate 5's), so the
    city's own green waits for a round that walks those stops */
export function topPlants(plan: J, tp: J, make: Make): { plain: Plain; all: Palm[] } {
  const plain = make.buildPlain(plan, { reach: Number(tp.plain.reach) })
  const inside = new Set<string>(tp.plain.inside as string[])
  return { plain, all: plain.palms.filter((p) => !inside.has(p.row)) }
}
