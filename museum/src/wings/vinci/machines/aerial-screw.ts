import { Mesh, MeshStandardNodeMaterial, type Material } from 'three/webgpu'
import type { Stack } from '../../../stack'
import { machineCatalog } from './catalog'
import { makeMachine, type ReadyMachineBuild } from './runtime'
import { thinStarchedLinen } from './screw-cloth'

/** Exact dossier parts and schedule. Construction dimensions remain declared assumptions.
 * The starched linen is a thin cloth wherever the screw stands: seen from
 * under the spiral, the light on its upper face comes through, and its
 * doubled seams and hems read darker against it. In the hall the hall's own
 * pass thins it again from the same nodes, with the hall's own measure. */
export function build(stack: Stack): ReadyMachineBuild {
  const machine = makeMachine(stack, machineCatalog['aerial-screw'])
  const thinned: Material[] = []
  void machine.ready.then(() => {
    machine.object.traverse(child => {
      if (!(child instanceof Mesh) || Array.isArray(child.material)) return
      const cloth = child.material
      if (!(cloth instanceof MeshStandardNodeMaterial) || !/starched linen/.test(cloth.name)) return
      child.material = thinStarchedLinen(cloth, child.geometry.hasAttribute('layers'))
      thinned.push(child.material)
    })
  }, () => undefined)
  const dispose = machine.dispose
  machine.dispose = () => {
    for (const material of thinned) material.dispose()
    dispose.call(machine)
  }
  return machine
}
