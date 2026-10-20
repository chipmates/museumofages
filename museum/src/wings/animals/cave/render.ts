/* THE LINEAR STILL: the frame before the print, the way a plate is kept.

   One pipeline draws the scene pass, the contact occlusion (GTAO, bright
   pixels guarded as post.ts does), and the haze the key's beam is seen
   through; its output is scene-linear light, written to a float target and
   read back. A still is the mean of jittered sub-frames (Halton 2, 3 at
   sub-pixel offsets), which is the anti-aliasing, as the film's export does.
   The mean is the plate (EXR, pre-grade); the still is that plate printed
   (`print.ts`). A Cycles render composited into the plate takes the same
   print, so the seam is one linear add and one curve. */

import {
  DataTexture,
  FloatType,
  NearestFilter,
  RGBAFormat,
  RenderPipeline,
  RenderTarget,
  type DirectionalLight,
  type PerspectiveCamera,
  type Scene,
  type WebGPURenderer,
} from 'three/webgpu'
import * as TSL from 'three/tsl'
import { ao as gtao } from 'three/addons/tsl/display/GTAONode.js'
import { denoise as denoiseNode } from 'three/addons/tsl/display/DenoiseNode.js'
import { EXRExporter, ZIPS_COMPRESSION } from 'three/addons/exporters/EXRExporter.js'
import type { HazeState } from './site'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const {
  Fn, Loop, cameraPosition, cameraProjectionMatrixInverse, cameraWorldMatrix, exp, float, getViewPosition,
  interleavedGradientNoise, luminance, min, mix, mx_noise_float, pass, screenCoordinate, screenUV, smoothstep, texture,
  uniform, vec2, vec3, vec4, int,
} = TSL as unknown as Record<string, N>

export interface LinearOptions {
  ao: { on: boolean; intensity: number; radius: number }
  haze: HazeState | null
  /** the key, its toward-the-sun direction and its linear colour times illuminance */
  sun: { light: DirectionalLight; dir: N; rgb: N; visibility: (p: N, taps: number) => N }
  /** the haze's march: steps and the farthest metre */
  steps: number
  reach: number
}

export interface LinearFrame {
  width: number
  height: number
  /** RGB, rows from the top */
  rgb: Float32Array
  /** 1 where the frame shows the given layer (the animal), from an id pass, else 0 */
  ms: number
}

function halton(i: number, b: number): number {
  let f = 1, r = 0
  while (i > 0) {
    f /= b
    r += f * (i % b)
    i = Math.floor(i / b)
  }
  return r
}

/** one pipeline per scene and camera: the pass, the occlusion and the haze, output linear */
export function createLinear(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera, o: LinearOptions) {
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
    // the sunlit stays as it is: occlusion is the ambient's, and a bright pixel is the key's
    const bright = smoothstep(0.5, 1.15, luminance(frame.rgb).mul(0.08))
    frame = frame.mul(mix(float(1), mix(occ, float(1), bright), aoOn))
  }
  if (o.haze) {
    const h = o.haze
    const sigma = uniform(h.sigma)
    const g = uniform(h.g)
    const amb = uniform(vec3(...h.ambient))
    const bmin = vec3(...h.box.min)
    const bmax = vec3(...h.box.max)
    const key = o.sun.light
    const shadowMatrix = uniform(key.shadow.matrix)
    const map = key.shadow.map
    const depthTex = map?.depthTexture ?? null
    const march = Fn(() => {
      const viewPos = getViewPosition(screenUV, depth.r, cameraProjectionMatrixInverse)
      const world = cameraWorldMatrix.mul(vec4(viewPos, 1)).xyz
      const toP = world.sub(cameraPosition)
      const far = toP.length()
      const dir = toP.div(far)
      const len = min(far, float(o.reach))
      const stepLen = len.div(o.steps)
      const jitter = interleavedGradientNoise(screenCoordinate.xy)
      const cosT = dir.dot(o.sun.dir)
      // Henyey-Greenstein, normalised over the sphere
      const phase = float(1).sub(g.mul(g)).div(float(1).add(g.mul(g)).sub(g.mul(2).mul(cosT)).pow(1.5).mul(4 * Math.PI))
      const inscatter = vec3(0).toVar()
      const trans = float(1).toVar()
      Loop({ start: int(0), end: int(o.steps), type: 'int', condition: '<' }, ({ i }: { i: N }) => {
        const t = float(i).add(jitter).mul(stepLen)
        const p = cameraPosition.add(dir.mul(t))
        const inBox = smoothstep(bmin.sub(1), bmin.add(1), p).mul(smoothstep(bmax.add(1), bmax.sub(1), p))
        const box = inBox.x.mul(inBox.y).mul(inBox.z)
        // the air is never even: a slow drift metres across, denser low down
        const drift = mx_noise_float(p.mul(0.19)).mul(0.35).add(1)
        const low = float(1).sub(smoothstep(0, 30, p.y).mul(0.5))
        const s = sigma.mul(box).mul(drift).mul(low)
        let vis: N = o.sun.visibility(p, 2)
        if (depthTex) {
          const sp = shadowMatrix.mul(vec4(p, 1))
          const c = sp.xyz.div(sp.w)
          const inside = smoothstep(0, 0.01, c.x).mul(smoothstep(1, 0.99, c.x)).mul(smoothstep(0, 0.01, c.y)).mul(smoothstep(1, 0.99, c.y))
          const lit = texture(depthTex, vec2(c.x, c.y.oneMinus())).compare(c.z)
          vis = vis.mul(mix(float(1), lit, inside))
        }
        const li = o.sun.rgb.mul(vis).mul(phase).add(amb)
        inscatter.addAssign(li.mul(s).mul(stepLen).mul(trans))
        trans.mulAssign(exp(s.mul(stepLen).negate()))
      })
      return vec4(inscatter, trans)
    })
    const hz = march()
    frame = vec4(frame.rgb.mul(hz.w).add(hz.rgb), 1)
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

/** Draw `samples` jittered sub-frames of the pipeline at the stage's size and return their mean, linear. */
export async function accumulate(
  renderer: WebGPURenderer,
  camera: PerspectiveCamera,
  post: RenderPipeline,
  width: number,
  height: number,
  samples: number,
  each?: (i: number) => void
): Promise<Float32Array> {
  const was = { w: renderer.domElement.width, h: renderer.domElement.height, ratio: renderer.getPixelRatio() }
  renderer.setPixelRatio(1)
  renderer.setSize(width, height, false)
  const target = new RenderTarget(width, height, { type: FloatType, format: RGBAFormat, depthBuffer: false })
  target.texture.minFilter = NearestFilter
  target.texture.magFilter = NearestFilter
  const sum = new Float32Array(width * height * 3)
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  for (let s = 0; s < samples; s++) {
    const jx = samples > 1 ? halton(s + 1, 2) - 0.5 : 0
    const jy = samples > 1 ? halton(s + 1, 3) - 0.5 : 0
    camera.setViewOffset(width, height, jx, jy, width, height)
    each?.(s)
    renderer.setRenderTarget(target)
    post.render()
    renderer.setRenderTarget(null)
    camera.clearViewOffset()
    const px = (await renderer.readRenderTargetPixelsAsync(target, 0, 0, width, height)) as Float32Array
    // WebGPU pads each read-back row to 256 bytes: 780 float pixels come back 784 wide
    const stride = Math.round(px.length / height)
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = y * width + x
        const j = y * stride + x * 4
        sum[i * 3] = sum[i * 3]! + px[j]!
        sum[i * 3 + 1] = sum[i * 3 + 1]! + px[j + 1]!
        sum[i * 3 + 2] = sum[i * 3 + 2]! + px[j + 2]!
      }
    }
  }
  for (let i = 0; i < sum.length; i++) sum[i] = sum[i]! / samples
  target.dispose()
  renderer.setPixelRatio(was.ratio)
  renderer.setSize(was.w / was.ratio, was.h / was.ratio, false)
  return sum
}

/** an EXR of a linear RGB frame (half float, ZIP), rows from the top */
export async function toEXR(rgb: Float32Array, width: number, height: number): Promise<Uint8Array> {
  const rgba = new Float32Array(width * height * 4)
  for (let i = 0; i < width * height; i++) {
    rgba[i * 4] = rgb[i * 3]!
    rgba[i * 4 + 1] = rgb[i * 3 + 1]!
    rgba[i * 4 + 2] = rgb[i * 3 + 2]!
    rgba[i * 4 + 3] = 1
  }
  // the exporter writes its rows bottom-up from a texture's data; hand it the rows flipped so the file reads top-down
  const flipped = new Float32Array(rgba.length)
  const row = width * 4
  for (let y = 0; y < height; y++) flipped.set(rgba.subarray(y * row, (y + 1) * row), (height - 1 - y) * row)
  const tex = new DataTexture(flipped, width, height, RGBAFormat, FloatType)
  // one line a block: the exporter writes a height that is not a multiple of 16 with a full last ZIP block, which OpenEXR (Blender, python) refuses
  const out = await new EXRExporter().parse(tex as never, { compression: ZIPS_COMPRESSION } as never)
  return out as Uint8Array
}

/** a printed frame as PNG bytes */
export async function toPNG(bytes: Uint8ClampedArray, width: number, height: number): Promise<Uint8Array> {
  const c = document.createElement('canvas')
  c.width = width
  c.height = height
  const g = c.getContext('2d')!
  g.putImageData(new ImageData(bytes as unknown as Uint8ClampedArray<ArrayBuffer>, width, height), 0, 0)
  const blob: Blob = await new Promise((r) => c.toBlob((b) => r(b!), 'image/png'))
  return new Uint8Array(await blob.arrayBuffer())
}

/** hand bytes to the shooter's own server, which writes them under the bed's folder */
export async function upload(path: string, bytes: Uint8Array | string): Promise<void> {
  const base = new URLSearchParams(location.search).get('caveput') ?? 'http://127.0.0.1:5603/put'
  const res = await fetch(`${base}?path=${encodeURIComponent(path)}`, { method: 'POST', body: bytes as BodyInit })
  if (!res.ok) throw new Error(`upload ${path}: ${res.status}`)
}

