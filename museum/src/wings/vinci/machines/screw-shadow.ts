/** THE SCREW'S SHADOW EDGE. The low sun lays the upper whorl's shadow on the
 * lower whorl's near-flat cloth, stretched about 3.4 times along the cloth,
 * so the near cascade's texels read as steps where the edge crosses it. This
 * filter reads a five-texel tent instead of the stock three, so the edge is
 * a soft line at the width a sun of half a degree gives it from a whorl 1.25 m
 * above. Given only to the screw's own key on the bench.
 */
import * as TSL from 'three/tsl'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type N = any
const { Fn, fract, ivec2, reference, renderGroup, texture, vec2, float } = TSL as unknown as Record<string, N>

/** gathers at -2, 0 and 2 texels on each axis cover six texels; the outer two
 * columns and rows take the bilinear remainder, so the tent moves smoothly */
export const wideShadowFilter: N = Fn(({ depthTexture, shadowCoord, shadow, depthLayer }: Record<string, N>) => {
  const mapSize = reference('mapSize', 'vec2', shadow).setGroup(renderGroup)
  const texel = vec2(1).div(mapSize)
  const uv = shadowCoord.xy.toVar()
  const f = fract(uv.mul(mapSize).add(0.5)).toConst()
  uv.subAssign(f.sub(0.5).mul(texel))
  const gather = (ox: number, oy: number): N => {
    let t = texture(depthTexture, uv).offset(ivec2(ox, oy)).gather()
    if (depthTexture.isArrayTexture) t = t.depth(depthLayer)
    return t.compare(shadowCoord.z)
  }
  let sum: N = float(0)
  for (const oy of [2, 0, -2]) {
    for (const ox of [-2, 0, 2]) {
      const c = gather(ox, oy).toConst()
      const left = ox === -2 ? f.x.oneMinus() : float(1), right = ox === 2 ? f.x : float(1)
      const top = oy === 2 ? f.y : float(1), bottom = oy === -2 ? f.y.oneMinus() : float(1)
      sum = sum.add(c.x.mul(left).mul(top)).add(c.y.mul(right).mul(top))
        .add(c.z.mul(right).mul(bottom)).add(c.w.mul(left).mul(bottom))
    }
  }
  return sum.mul(1 / 25)
})
