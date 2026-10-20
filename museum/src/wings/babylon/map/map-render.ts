/* THE MAP'S LINEAR PIPELINE: the place kit's scene pass and contact
   occlusion (GTAO, bright pixels guarded), with the occlusion faded out by
   distance. At city scale the occlusion darkened the far plain under a
   grazing view into a dark band at the horizon; contact shadows matter
   only near. Output is scene-linear, for the kit's `accumulate`. */

import { RenderPipeline, type PerspectiveCamera, type Scene, type WebGPURenderer } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { ao as gtao } from 'three/addons/tsl/display/GTAONode.js'
import { denoise as denoiseNode } from 'three/addons/tsl/display/DenoiseNode.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { float, luminance, mix, pass, smoothstep, uniform, vec4 } = TSL as unknown as Record<string, N>

export interface MapLinearOptions {
  ao: { on: boolean; intensity: number; radius: number }
  /** metres from the eye where the occlusion starts to fade, and where it is gone */
  fade: [number, number]
}

export function createMapLinear(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera, o: MapLinearOptions) {
  const scenePass = pass(scene, camera, { samples: 0 })
  const colour = scenePass.getTextureNode('output')
  const depth = scenePass.getTextureNode('depth')
  let frame: N = colour
  const aoOn = uniform(o.ao.on ? o.ao.intensity : 0)
  if (o.ao.on) {
    const aoPass = (gtao as unknown as N)(depth, null, camera)
    aoPass.resolutionScale = 1
    aoPass.radius.value = o.ao.radius
    aoPass.thickness.value = 1
    const occ = (denoiseNode as unknown as N)(aoPass.getTextureNode(), depth, null, camera).r
    const bright = smoothstep(0.5, 1.15, luminance(frame.rgb).mul(0.08))
    const far = smoothstep(o.fade[0], o.fade[1], scenePass.getViewZNode().negate())
    frame = frame.mul(mix(float(1), mix(mix(occ, float(1), bright), float(1), far), aoOn))
  }
  const post = new RenderPipeline(renderer)
  post.outputColorTransform = false
  post.outputNode = vec4(frame.rgb, 1)
  return {
    post,
    dispose(): void {
      post.dispose()
    },
  }
}
