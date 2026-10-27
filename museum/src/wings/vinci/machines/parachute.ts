import { Mesh, MeshStandardNodeMaterial, type Material, type Node } from 'three/webgpu'
import { float, vec3 } from 'three/tsl'
import type { Stack } from '../../../stack'
import { sealedLinen, type ClothHang } from '../collection/court-linen'
import { machineCatalog } from './catalog'
import { makeMachine, type ReadyMachineBuild } from './runtime'

/** Exact dossier parts and schedule. Construction dimensions remain declared assumptions.
 * The canopy is the house's sealed linen wherever it stands (its making and the
 * light through it, the dossier's a-cloth-* assumptions); out of the court's
 * walls the key reaches all of its sun-facing cloth. The court dresses it again
 * with its own share. */
/** How the canopy hangs on the bench (ours, a-cloth-make-up): a sized cloth laced taut, each cloth dished a
 * little between its seams, drawn from the pulled corners and sagging a little between the hem's eyelets. */
export const BENCH_HANG: ClothHang = { give: .32, belly: .025, draw: .018, scallop: .008 }

/** The tarred marline over the splices, against the pitched-hide set it is drawn with: lighter and warmer, matt. */
const SERVED = { r: 1.9, g: 1.75, b: 1.5, roughness: .8 }

export function build(stack: Stack): ReadyMachineBuild {
  const machine = makeMachine(stack, machineCatalog['parachute'])
  const restore: (() => void)[] = []
  void machine.ready.then(() => {
    machine.object.traverse(child => {
      // shaved fir is new work, paler and warmer than the library's weathered beams
      const wood = child instanceof Mesh ? child.material : null
      if (wood instanceof MeshStandardNodeMaterial && /:fir pole/.test(wood.name) && wood.colorNode && !wood.userData['fir']) {
        wood.colorNode = (wood.colorNode as Node<'vec3'>).mul(vec3(1.35, 1.16, .86))
        wood.userData['fir'] = true
        wood.needsUpdate = true
      }
      // the servings are marline wound on the cord and tarred: a dull brown a step above the hide set's black
      if (wood instanceof MeshStandardNodeMaterial && /:marline, pitched/.test(wood.name) && wood.colorNode && !wood.userData['served']) {
        wood.colorNode = (wood.colorNode as Node<'vec3'>).mul(vec3(SERVED.r, SERVED.g, SERVED.b))
        wood.roughnessNode = float(SERVED.roughness)
        wood.userData['served'] = true
        wood.needsUpdate = true
      }
      if (!(child instanceof Mesh) || child.userData['partId'] !== 'canopy') return
      const built = child.material as Material, cloth = sealedLinen('vinci/machine/parachute/sealed-linen', 1, BENCH_HANG)
      child.material = cloth
      restore.push(() => { child.material = built; cloth.dispose() })
    })
  }, () => undefined)
  const dispose = machine.dispose
  machine.dispose = () => {
    for (const undo of restore.splice(0)) undo()
    dispose.call(machine)
  }
  return machine
}
