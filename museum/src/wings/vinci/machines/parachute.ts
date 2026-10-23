import { Mesh, type Material } from 'three/webgpu'
import type { Stack } from '../../../stack'
import { sealedLinen } from '../collection/court-linen'
import { machineCatalog } from './catalog'
import { makeMachine, type ReadyMachineBuild } from './runtime'

/** Exact dossier parts and schedule. Construction dimensions remain declared assumptions.
 * The canopy is the house's sealed linen wherever it stands (its making and the
 * light through it, the dossier's a-cloth-* assumptions); out of the court's
 * walls the key reaches all of its sun-facing cloth. The court dresses it again
 * with its own share. */
export function build(stack: Stack): ReadyMachineBuild {
  const machine = makeMachine(stack, machineCatalog['parachute'])
  const restore: (() => void)[] = []
  void machine.ready.then(() => {
    machine.object.traverse(child => {
      if (!(child instanceof Mesh) || child.userData['partId'] !== 'canopy') return
      const built = child.material as Material, cloth = sealedLinen('vinci/machine/parachute/sealed-linen', 1)
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
