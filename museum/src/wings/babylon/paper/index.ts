/* THE PAPER KIT: one visual language for every paper feature of the walk.
   Colour is the walk's afternoon; anything from another time, or an idea, is
   ink on warm paper. The marks (`marks.ts`), the two measures (`figure.ts`),
   the labels' placer (`placer.ts`), the notches and steps (`steps.ts`), the
   counted unit (`counter.ts`) and the sheet itself (`plate.ts`) are built
   once here and reused by every feature that draws on paper. */

export { PAPER_TOKENS, INK_SHARE, CONTRAST_FLOOR, contrast, hexRgb, luminance, mixRgb, paperStyle, shades, type Rgb } from './tokens'
export { MARKS, HATCH, fmt, grainTile, markAttrs, markDefs, markLine, markPath, markRect, svg, type MarkIds, type MarkStyle, type PaperMark } from './marks'
export { FIGURE_FORM, FIGURE_M, figureOutlines, figurePath, figuresFor, rulerPaths, stackPath } from './figure'
export { crosses, grown, meets, overlaps, placeElements, placeLabels, type Box, type LabelAsk, type Placed, type Seg, type Side, type Taken } from './placer'
export { createPaperSteps, type PaperStep, type PaperSteps, type PaperStepsOptions } from './steps'
export { gridBox, millions, poured, rangeRow, unitGrid, type UnitBox, type UnitGridOptions } from './counter'
export { createPaperPlate, framingOf, paperSheet, WIDE_LEAST, type PaperFraming, type PaperPlate } from './plate'
