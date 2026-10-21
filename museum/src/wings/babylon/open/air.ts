/* THE OPENING'S AIR AND SKY. One function gives the colour of the far air in
   any direction (warm toward the low sun, cool away from it, the sun's forward
   glow on top); the sky below its horizon is that colour, and every surface is
   hazed toward it by the air between it and the eye. The haze is a height
   layer, densest at the plain and thinning upward, integrated in closed form
   along each pixel's ray from the depth, so a far wall seen from 400 m loses
   its contrast while the roofs under the camera stay sharp. The pipeline: the
   scene pass, the contact occlusion (its reach and fade follow the camera's
   height), the haze; output scene-linear, for the kit's `accumulate`. */

import { RenderPipeline, Vector3, type PerspectiveCamera, type Scene, type WebGPURenderer } from 'three/webgpu'
import * as TSL from 'three/tsl'
import { ao as gtao } from 'three/addons/tsl/display/GTAONode.js'
import { denoise as denoiseNode } from 'three/addons/tsl/display/DenoiseNode.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const {
  abs, clamp, dot, exp, float, getViewPosition, luminance, max, mix,
  normalize, pass, pow, screenUV, select, smoothstep, step, uniform, vec3, vec4,
} = TSL as unknown as Record<string, N>

export interface AirUniforms {
  /** toward the sun, world */
  uSun: N
  /** the sky's strength: 1 by day, down to 0.18 after sunset */
  uDay: N
  /** extinction at the plain (per metre), the layer's scale height (m) and the plain's level */
  uSigma: N
  uScale: N
  uFloor: N
  /** extinction per channel relative to green: blue a little more, so the far city cools */
  uBeta: N
  /** the haze's own strength, 0 to switch the air off for a test */
  uOn: N
}

export function makeAirUniforms(o: { sigma?: number; scale?: number; floor?: number } = {}): AirUniforms {
  return {
    uSun: uniform(new Vector3(0, 1, 0)),
    uDay: uniform(1),
    uSigma: uniform(o.sigma ?? 0.0003),
    uScale: uniform(o.scale ?? 700),
    uFloor: uniform(o.floor ?? 3),
    uBeta: uniform(new Vector3(0.88, 1, 1.16)),
    uOn: uniform(1),
  }
}

/** the far air's colour seen along d: the horizon's tint by its bearing to the sun, the forward glow */
export function airColour(U: AirUniforms, d: N): N {
  const low = smoothstep(-0.04, 0.35, U.uSun.y)
  const flat = normalize(vec3(d.x, 0.0001, d.z))
  const sunFlat = normalize(vec3(U.uSun.x, 0.0001, U.uSun.z))
  const toward = smoothstep(-0.7, 1, dot(flat, sunFlat))
  const away = mix(vec3(0.3, 0.3, 0.35), vec3(0.42, 0.47, 0.55), low)
  const near = mix(vec3(0.82, 0.5, 0.3), vec3(0.86, 0.74, 0.58), low)
  const cosS = max(dot(normalize(d), U.uSun), 0)
  const glow = vec3(1.0, 0.7, 0.42).mul(pow(cosS, 6).mul(0.5).add(pow(cosS, 60).mul(0.9)))
  return mix(away, near, toward).add(glow).mul(U.uDay)
}

/** the sky dome: the far air at and below the horizon, the zenith's blue above, the sun's disc */
export function skyColour(U: AirUniforms, d: N): N {
  const up = clamp(d.y, 0, 1)
  const low = smoothstep(-0.04, 0.35, U.uSun.y)
  const zenith = mix(vec3(0.05, 0.08, 0.16), vec3(0.11, 0.23, 0.52), low)
  const air = airColour(U, d)
  const above = mix(air, zenith.mul(U.uDay), pow(up, 0.5))
  const cosS = max(dot(d, U.uSun), 0)
  const disc = smoothstep(0.99996, 0.99999, cosS).mul(60).mul(smoothstep(-0.03, 0.0, d.y)).mul(U.uDay)
  return mix(air, above, smoothstep(0.0, 0.14, d.y)).add(vec3(1, 0.9, 0.75).mul(disc))
}

/** transmittance along a ray of length len from height y0 to height y1 through the height layer, per channel */
export function transmittance(U: AirUniforms, len: N, y0: N, y1: N): N {
  const H = U.uScale
  const x = y1.sub(y0).div(H)
  // (1 - e^-x) / x, its limit 1 - x/2 near zero
  const ax = abs(x)
  const f = select(ax.lessThan(1e-3), float(1).sub(x.mul(0.5)), float(1).sub(exp(x.negate())).div(select(ax.lessThan(1e-3), float(1), x)))
  const tau = U.uSigma.mul(len).mul(exp(y0.sub(U.uFloor).div(H).negate())).mul(f)
  return exp(vec3(U.uBeta).mul(tau).negate())
}

export interface OpenLinearOptions {
  /** occlusion strength, reach (m) and fade (metres from the eye where it starts to fade and where it is gone) */
  ao: { on: boolean; intensity: N; radius: number; fadeNear: N; fadeFar: N }
}

export function createOpenLinear(renderer: WebGPURenderer, scene: Scene, camera: PerspectiveCamera, U: AirUniforms, o: OpenLinearOptions) {
  const scenePass = pass(scene, camera, { samples: 0 })
  const colour = scenePass.getTextureNode('output')
  const depth = scenePass.getTextureNode('depth')
  let frame: N = colour
  let aoPass: N = null
  if (o.ao.on) {
    aoPass = (gtao as unknown as N)(depth, null, camera)
    aoPass.resolutionScale = 1
    aoPass.radius.value = o.ao.radius
    aoPass.thickness.value = 1
    const occ = (denoiseNode as unknown as N)(aoPass.getTextureNode(), depth, null, camera).r
    const bright = smoothstep(0.5, 1.15, luminance(frame.rgb).mul(0.08))
    const far = smoothstep(o.ao.fadeNear, o.ao.fadeFar, scenePass.getViewZNode().negate())
    frame = frame.mul(mix(float(1), mix(mix(occ, float(1), bright), float(1), far), o.ao.intensity))
  }
  // the haze, from the pixel's world point; the sky's own pixels (nothing drawn into depth) keep the dome's colour.
  // The scene camera's matrices are bound by reference: inside the pipeline's quad the camera nodes are the quad's
  const projInv = uniform(camera.projectionMatrixInverse), camWorld = uniform(camera.matrixWorld), camPos = uniform(camera.position)
  const d = depth.r
  const viewPos = getViewPosition(screenUV, d, projInv)
  const world = camWorld.mul(vec4(viewPos, 1)).xyz
  const toP = world.sub(camPos)
  const len = toP.length()
  const dir = toP.div(max(len, 1e-3))
  const T = transmittance(U, len, camPos.y, world.y)
  const sky = step(0.9999999, d)
  const hazed = frame.rgb.mul(T).add(airColour(U, dir).mul(vec3(1).sub(T)))
  const out = mix(frame.rgb, mix(frame.rgb, hazed, U.uOn), float(1).sub(sky))
  const post = new RenderPipeline(renderer)
  post.outputColorTransform = false
  post.outputNode = vec4(out, 1)
  return {
    post,
    /** the occlusion's reach in metres */
    setRadius(r: number): void {
      if (aoPass) aoPass.radius.value = r
    },
    dispose(): void {
      post.dispose()
    },
  }
}
