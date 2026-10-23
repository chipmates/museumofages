import { Mesh, MeshStandardNodeMaterial, type Material, type Node } from 'three/webgpu'
import { vec3 } from 'three/tsl'
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
  const record = machineCatalog['aerial-screw']
  const machine = makeMachine(stack, record)
  const sail = record.dossier.parts.find(part => part.id === 'sail')?.shape
  const spiral = typeof sail === 'object' ? sail.helicoid : undefined
  const thinned: Material[] = []
  void machine.ready.then(() => {
    machine.object.traverse(child => {
      if (!(child instanceof Mesh) || Array.isArray(child.material)) return
      const own = child.material
      if (!(own instanceof MeshStandardNodeMaterial)) return
      // the rim's wire is black iron and its whippings tarred, so the edge reads as one dark wire "as thick as a cord"
      const dark = /tarred/.test(own.name) ? vec3(.3, .25, .2) : /forged wire/.test(own.name) ? vec3(.42, .42, .42) : null
      if (dark && own.colorNode && !own.userData['darkened']) {
        own.colorNode = (own.colorNode as Node<'vec3'>).mul(dark)
        own.userData['darkened'] = true
        own.needsUpdate = true
      }
      if (/starched linen/.test(own.name)) {
        child.material = thinStarchedLinen(own, child.geometry.hasAttribute('layers'), spiral)
        thinned.push(child.material)
      }
      // The bench's lamp on this machine is the figure's: the hour alone lights
      // the screw, so the turns keep the sun's shadow of one on the other.
      ;(child.material as Material).userData['benchLamp'] = false
    })
  }, () => undefined)
  const dispose = machine.dispose
  machine.dispose = () => {
    for (const material of thinned) material.dispose()
    dispose.call(machine)
  }
  return machine
}
