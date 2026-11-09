/* STOP 15 IN CODE, THE CITY FROM THE TOP: the plain round the walls on the map page, as the arrival builds it. Canals,
   field strips, the river's grove belt and the outer city's garden plots painted into the ground's recipe; the groves'
   date palms, the reed and the bank trees instanced on it. Built from the map's own plan, so the banks follow the map's
   river and nothing stands inside the inner city but the palms in clumps by its canal and its moats (open/plain.ts).
   Kinds and mass are the record's, every line and place ours (bab.green.palm.plain, .field.plain, .water.channels,
   .outercity, .palm.city). Scene frame: x = E - E0, z = N0 - N. */
import { PhysicalLightingModel, type InstancedMesh, type Mesh, type MeshStandardNodeMaterial } from 'three/webgpu'
import { buildPlain } from '../open/plain'
import { topPlants } from './top-plants'
import { paintPlain, palmMesh } from '../open/green'
import * as TSL from 'three/tsl'
import { groundMaterial, palmMaterial } from '../open/earth'
import { PAL } from '../gate/gate-colours'
import { uView, type ClassTones } from '../map/mass'
import type { Built } from '../map/plan'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type J = any
const { dot, float, max, mix, smoothstep, vec3 } = TSL as unknown as Record<string, N>

/* The open ground in a body's shadow is lit by the sky alone, and a clear sky's light is the zenith's blue, so the map's
   shade read blue-grey beside the warm walls. Real ground in a sunlit city's shade also takes the light thrown off the
   sunlit walls and ground round it: the sky's light on the ground goes SHADE_WARM of the way to the dust's hue where
   the sun is shadowed (a guess). Only while a sun stands: the twilight's ground keeps its sky. */
const SHADE_WARM = 0.5
const Y3 = vec3(0.2126, 0.7152, 0.0722)
const hue = (v: N): N => v.div(max(dot(v, Y3), 1e-4))
/* A contact seat by a wall's foot, where the sky field leaves under SEAT of the open sky's light, keeps the plain light
   exactly: warmed there, the piers' feet sank into one brown mass at any brightness. SEAT from a probe of the field's
   share: S10's seat 0.63 to 0.68; S09's open shade 0.79 to 0.89 and its wall-foot ground 0.7 to 0.8, which a higher
   band leaves blue. The share's rise along a pier's side (0.66 to 0.84) overlaps both and keeps a faint warm trace. */
const SEAT: [number, number] = [0.7, 0.8]
class ShadeWarm extends PhysicalLightingModel {
  private sunLit: N = null
  private sunUp: N = null
  override start(builder: N): void {
    this.sunLit = float(0).toVar('groundSunLit')
    this.sunUp = float(0).toVar('groundSunUp')
    super.start(builder)
  }
  override direct(...[input, builder]: Parameters<PhysicalLightingModel['direct']>): void {
    const node = input.lightNode as unknown as { baseColorNode?: N | null; light?: { isDirectionalLight?: boolean } }
    if (node.light?.isDirectionalLight && node.baseColorNode) {
      const open = dot(node.baseColorNode, Y3)
      this.sunLit.assign(max(this.sunLit, dot(input.lightColor as N, Y3).div(max(open, 1e-6)).min(1)))
      this.sunUp.assign(max(this.sunUp, smoothstep(0, 0.3, open)))
    }
    super.direct(input, builder)
  }
  // the tint acts on the summed indirect diffuse (the environment's, the field's correction, the occlusion) and is
  // scaled back to that sum's luminance
  override indirect(builder: N): void {
    super.indirect(builder)
    const ibl = builder.context.iblIrradiance
    const share = dot(ibl.add(builder.context.irradiance), Y3).div(max(dot(ibl, Y3), 1e-6))
    const k = float(SHADE_WARM).mul(float(1).sub(this.sunLit)).mul(this.sunUp).mul(float(1).sub(uView))
      .mul(smoothstep(SEAT[0], SEAT[1], share))
    const ratio = hue(vec3(...PAL.dust)).div(max(hue(ibl), vec3(0.25)))
    const d = builder.context.reflectedLight.indirectDiffuse
    const warm = d.mul(mix(vec3(1), ratio, k)).toVar('groundWarm')
    // both sides held off zero, so k = 0 gives the sum unchanged
    const kept = max(dot(d, Y3), 1e-6).div(max(dot(warm, Y3), 1e-6))
    d.assign(warm.mul(kept))
  }
}

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
      ;(g as unknown as { setupLightingModel: () => PhysicalLightingModel }).setupLightingModel = () => new ShadeWarm()
      ground.material = g
    },
    facts: { plants: plain.palms.length, rows, fields: plain.fields.length, canals: plain.canals.length, groves: plain.groves.length, domain: plain.domain },
  }
}
