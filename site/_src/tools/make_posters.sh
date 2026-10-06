#!/bin/bash
# Renders the machine's two posters from the page's own model and cuts them to AVIF and WebP into _src/img/.
# Run again whenever _src/js/machine.js or the palette (css/tokens.css) changes:   bash _src/tools/make_posters.sh
# The posters carry the stage's ground and the line colour, so a new palette needs new posters.
# The render needs a headless browser's screenshot tool, named by MOA_SHOT and called as
#   <tool> <page> <out.png> --width W --height H --scale S --wait MS
# It is not part of the repository. If it answers "busy", call again later.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
SITE="$(cd "$HERE/../.." && pwd)"
SHOT="${MOA_SHOT:?set MOA_SHOT to a screenshot tool (it is not part of the repository); to build the site, _src/tools/fetch.py fetches the posters}"
WORK="$SITE/_work/posters"
OUT="$HERE/../img"
mkdir -p "$WORK" "$OUT"
# The wide stage is 690 px on a desktop, the square one up to 390 px on a phone: each poster is shot with its own camera.
bash "$SHOT" "$HERE/poster.html" "$WORK/poster-wide.png" --width 700 --height 630 --scale 2 --wait 900
bash "$SHOT" "$HERE/poster.html" "$WORK/poster-square.png" --width 540 --height 540 --scale 2 --wait 900
magick "$WORK/poster-wide.png" -resize 1200x1080! -quality 55 -define heic:speed=2 "$OUT/machine-poster-wide-1200.avif"
magick "$WORK/poster-wide.png" -resize 1200x1080! -quality 80 "$OUT/machine-poster-wide-1200.webp"
magick "$WORK/poster-square.png" -quality 55 -define heic:speed=2 "$OUT/machine-poster-square-1080.avif"
magick "$WORK/poster-square.png" -quality 80 "$OUT/machine-poster-square-1080.webp"
ls -l "$OUT"/machine-poster-*
echo "Then list the new posters' hashes: python3 _src/tools/fetch.py --record"
