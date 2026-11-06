/* STOP 15 IN CODE, THE CITY FROM THE TOP: the plain round the walls on the map page, as the arrival builds it. Canals,
   field strips, the river's grove belt and the outer city's garden plots painted into the ground's recipe; the groves'
   date palms, the reed and the bank trees instanced on it. Built from the map's own plan, so the banks follow the map's
   river and nothing stands inside the inner city but the palms in clumps by its canal and its moats (open/plain.ts).
   Kinds and mass are the record's, every line and place ours (bab.green.palm.plain, .field.plain, .water.channels,
   .outercity, .palm.city). Scene frame: x = E - E0, z = N0 - N. */
import type { InstancedMesh, Mesh, MeshStandardNodeMaterial } from 'three/webgpu'
import { buildPlain } from '../open/plain'
import { topPlants } from './top-plants'
import { paintPlain, palmMesh } from '../open/green'
import { groundMaterial, palmMaterial } from '../open/earth'
import type { ClassTones } from '../map/mass'
import type { Built } from '../map/plan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any

export interface TopMount {
  meshes: InstancedMesh[]
  /** the map's ground in the arrival's recipe with the plain's map; `chain` the stops' own paint over it, as paintCity takes it */
  paintGround: (ground: Mesh, sky: (d: N) => N, uPix: N, chain?: (b: N) => N) => void
  facts: Record<string, unknown>
}

export function mountTop(built: Built, plan: J, tp: J, tones: ClassTones): TopMount {
  const { plain, all } = topPlants(plan, tp, { buildPlain })
  const look = paintPlain(plain)
  const palms = palmMesh(all, built.ground, palmMaterial(tones))
  const rows: Record<string, number> = {}
  for (const p of all) rows[p.row] = (rows[p.row] ?? 0) + 1
  return {
    meshes: [palms],
    paintGround: (ground, sky, uPix, chain) => {
      const g = groundMaterial(-1, { ...look, x0: plain.domain.x0, z0: plain.domain.z0, size: plain.domain.size, uPix }, sky) as MeshStandardNodeMaterial
      if (chain) g.colorNode = chain(g.colorNode)
      ground.material = g
    },
    facts: { plants: plain.palms.length, rows, fields: plain.fields.length, canals: plain.canals.length, groves: plain.groves.length, domain: plain.domain },
  }
}
