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
    // Each 40 mm upright stands under its Z pole 0.25 m in from the corner,
    // its cap against the 48 mm pole's underside (Y=3.276): the corner's
    // lashing and the cord's eye on the X pole stand clear of it, and the
    // hem's lacing ends 0.35 m from the corner. Its nearest suspension
    // passes about 0.24 m away.
    const frameCorner = 3.5016
    const underside = 3.3 - 0.024
    const inset = 0.25
    const positions: [number, number][] = [[-1, -1], [1, -1], [1, 1], [-1, 1]]
    return positions.flatMap(([sx, sz]): MountBox[] => {
      const x = sx * frameCorner
      const z = sz * (frameCorner - inset)
      return [
        {size: [0.160, 0.025, 0.160], centre: [x, 0.0125, z]},
        {size: [0.040, underside - 0.025, 0.040], centre: [x, (underside + 0.025) / 2, z]},
      ]
    })
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
