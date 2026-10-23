import { InstancedMesh, Mesh, MeshStandardNodeMaterial, type Material, type Node, type Object3D } from 'three/webgpu'
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
  const machine = makeMachine(stack, machineCatalog['aerial-screw'])
  const thinned: Material[] = []
  const turns = (node: Object3D): boolean => {
    for (let at: Object3D | null = node; at && at !== machine.object; at = at.parent) if (at.name === 'mast') return true
    return false
  }
  void machine.ready.then(() => {
    const standing = new Map<Material, Material>()
    machine.object.traverse(child => {
      if (!(child instanceof Mesh) || Array.isArray(child.material)) return
      // The bench's lamp stands in the floor, under the deck's top: the deck and
      // the bearing block take none of it, or a grazing lamp finds every bump of
      // the planks' grain as a bright point. Their own copy says so.
      if (!(child instanceof InstancedMesh) && !turns(child) && child.material instanceof MeshStandardNodeMaterial) {
        let own = standing.get(child.material)
        if (!own) {
          own = child.material.clone()
          own.userData = { ...child.material.userData, benchLamp: false }
          standing.set(child.material, own)
          thinned.push(own)
        }
        child.material = own
      }
      const cloth = child.material
      // The bench's lamp is the cloth's and the frame's. The canes and the hemp
      // turns are thin and glassy, and seen edge on as the spiral turns they
      // would catch it as specks along their length; under it they stand as
      // the dark ribs the cloth is stretched on.
      const lit = ((globalThis as { __screwProbe?: Record<string, unknown> }).__screwProbe || {})['hempLamp']
      if (cloth instanceof MeshStandardNodeMaterial && /:cane:|hemp/.test(cloth.name)) { if (lit) delete cloth.userData['benchLamp']; else cloth.userData['benchLamp'] = false }
      // the rim's wire is black iron and its whippings tarred, so the edge reads as one dark wire "as thick as a cord"
      const probe = (globalThis as { __screwProbe?: Record<string, unknown> }).__screwProbe || {}
      const dark = !probe['bright'] && cloth instanceof MeshStandardNodeMaterial ? /tarred/.test(cloth.name) ? vec3(.3, .25, .2) : /forged wire/.test(cloth.name) ? vec3(.42, .42, .42) : null : null
      if (dark && cloth instanceof MeshStandardNodeMaterial && cloth.colorNode && !cloth.userData['darkened']) {
        cloth.colorNode = (cloth.colorNode as Node<'vec3'>).mul(dark)
        cloth.userData['darkened'] = true
        cloth.needsUpdate = true
      }
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
