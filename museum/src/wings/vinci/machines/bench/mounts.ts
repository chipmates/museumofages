/** GENERATED modern exhibition hardware, in world metres.
 * These boxes belong to the bench support manifest record. They are never
 * added to a machine's dossier, joint hierarchy or declared bounds.
 */
export interface MountBox {
  size: [number, number, number]
  centre: [number, number, number]
}

export function mountBoxes(slug: string): MountBox[] {
  if (slug === 'parachute') {
    // The frame centre is Y=3.300 with radius .018: underside Y=3.282.
    // Forty-millimetre uprights sit .015 outward in X and Z, with aligned
    // feet. The top cap seats two .005 m runs of the wooden beam bottoms.
    // Minimum distance from a suspension centreline to an upright is
    // .012903691 m; subtracting the rope's full .007 radius leaves
    // .005903691 m clearance. No support passes through a suspension rope.
    const frameCorner = 3.5016
    const outward = 0.015
    const positions: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    return positions.flatMap(([sx, sz]): MountBox[] => {
      const x = sx * (frameCorner + outward)
      const z = sz * (frameCorner + outward)
      return [
        {size: [0.160, 0.025, 0.160], centre: [x, 0.0125, z]},
        {size: [0.040, 3.257, 0.040], centre: [x, 1.6535, z]},
      ]
    })
  }
  if (slug === 'flying-machine') {
    // Two posts carry the body: one under the big hoop's bottom bar (its
    // underside 1.145 m), one under both bottom rails before the feet (their
    // undersides 1.249 m); each saddle meets the cane, and nothing reaches a
    // wing, a cord or the pilot in any pose of the beat.
    const posts: [number, number, number][] = [[0.0, 1.145, 0.6], [-1.2, 1.249, 0.4]]
    return posts.flatMap(([z, top, saddle]): MountBox[] => [
      {size: [0.24, 0.02, 0.24], centre: [0, 0.01, z]},
      {size: [0.07, top - 0.02 - 0.03, 0.07], centre: [0, 0.02 + (top - 0.05) / 2, z]},
      {size: [saddle, 0.03, 0.06], centre: [0, top - 0.015, z]},
    ])
  }
  if (slug === 'proportional-compass') {
    // The fixed pivot is centred at [0,.45,0], radius .009, extending
    // along Z to +/-.0175. The neck ends flush against its rear face.
    // Its .008-square face fits inside the .009-radius pivot end.
    // Both blades rotate in fixed Z layers spanning -.010 to +.010:
    // the neck retains at least .0075 m clearance through the full cycle.
    // The stem stays behind Z=-.031; the foot remains below Y=.006,
    // at least .048492 m beneath the lowest moving tip.
    // A stand a visitor can see is still a stand: the plate is wider, the
    // stem is fourteen millimetres and set back so its front face stays at
    // Z=-.031, and the collar runs from that face to the pivot's rear face.
    return [
      {size: [0.110, 0.006, 0.060], centre: [0, 0.003, -0.030]},
      {size: [0.014, 0.440, 0.014], centre: [0, 0.226, -0.038]},
      {size: [0.012, 0.012, 0.0135], centre: [0, 0.450, -0.02425]},
    ]
  }
  return []
}
