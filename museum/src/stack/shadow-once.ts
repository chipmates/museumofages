/* A SHADOW MAP IS DRAWN ONCE A FRAME. From r187 a shadow's update is keyed
   by the camera that renders, so every further camera in a frame (the
   mirror, a probe's cube faces, the air's own eye) draws every shadow map
   again. No light here aims its shadow by the viewing camera, so the second
   map is the first one again: the frame's first camera draws it, as up to
   r185, and the others read it. */
import { ShadowNode } from 'three/webgpu'

type Frame = { frameId: number; renderer: { _precompilationState: unknown } }
type Updating = { shadow: { needsUpdate: boolean; autoUpdate: boolean }; updateBefore(frame: Frame): void }

let held = false
export function drawShadowsOncePerFrame(): void {
  if (held) return
  held = true
  const proto = ShadowNode.prototype as unknown as Updating
  const update = proto.updateBefore
  const drawn = new WeakMap<object, number>()
  proto.updateBefore = function (this: Updating, frame: Frame) {
    const { shadow } = this
    if (frame.renderer._precompilationState === null && (shadow.needsUpdate || shadow.autoUpdate)) {
      if (drawn.get(this) === frame.frameId) return
      drawn.set(this, frame.frameId)
    }
    update.call(this, frame)
  }
}
