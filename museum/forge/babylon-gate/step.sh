#!/bin/bash
# One step of the gate's round in one call, every render under the gate lock (slots C or D).
#   bash step.sh massing              grey stills of both cameras, an overview, fidelity, the crop boxes, looks/massing/SHEET.jpg and NUMBERS.md
#   bash step.sh sketch               the timed path of stops 2 to 4 on the grey massing: frames, 1 fps sheets per leg, the leg numbers
#   bash step.sh first-pass [--again] the flat state's stills, thumbnails and crops into first-pass/ (refuses to overwrite)
#   bash step.sh look <name> [state] [switch]   a look round: desktop and phone stills and the crops, looks/<name>/SHEET.jpg
#   bash step.sh switch <name>        both states at both framings (and 360x640), the id pass, the difference masks and shares, looks/<name>/
#   bash step.sh geometry             the offline geometry check, default and near (10 mm) passes, into checks/
#   bash step.sh final                the full set of section 6 into stills/, every check
set -u
WM="$(cd "$(dirname "$0")/../.." && pwd)"
# GATE_HAND names the hand-in folder of the round; GATE_LOCK a script that runs <log> <command...> under the render lock.
HAND="${GATE_HAND:?set GATE_HAND to the hand-in folder of the round}"
LOCK="${GATE_LOCK:?set GATE_LOCK to the render lock script}"
PY=/opt/homebrew/Caskroom/miniforge/base/bin/python3
SHOOT="$WM/forge/babylon-gate/shoot.mjs"
MEASURE="$WM/forge/babylon-gate/measure.py"
LOGS="$HAND/scratch/logs"
mkdir -p "$LOGS" "$HAND/checks"
[ -d "$HAND" ] || { echo "no hand-in folder $HAND"; exit 2; }

locked() { # <log name> <command...>
  local log="$LOGS/$1.log"; shift
  LOCK_OWNER=babylon-gate bash "$LOCK" "$log" "$@"
  local code=$?
  grep -E '^(ERROR|PAGEERROR|FAILED|exit [1-9])' "$log" | head -20
  echo "step $(basename "$log" .log): exit $code ($(grep -c '' "$log") log lines)"
  return $code
}
shots() { # <out> <json>
  locked "shots-$(basename "$1")" node "$SHOOT" --port 5220 --data-port 5221 --out "$1" --shots "$2" --network "$1/network.json"
}

case "${1:-}" in
  massing)
    OUT="$HAND/looks/massing"; mkdir -p "$OUT"
    node --experimental-strip-types --no-warnings "$WM/forge/babylon-gate/fidelity.mjs" --plan-only --json "$HAND/checks/fidelity-plan.json" > "$OUT/fidelity.txt"; echo "fidelity exit $? ($(tail -1 "$OUT/fidelity.txt"))"
    locked crops node "$SHOOT" --port 5220 --data-port 5221 --crops "$HAND/checks/crop-boxes.json"
    shots "$OUT" '[{"name":"desk-grey","framing":"desktop","state":"grey","css":[1600,900],"ratio":1,"samples":4},{"name":"phone-390x664-grey","framing":"phone","state":"grey","css":[390,664],"ratio":2,"samples":4},{"name":"over-grey","framing":"desktop","state":"grey","css":[1600,900],"ratio":1,"samples":4,"look":{"pos":[-70,95,95],"look":[0,0,-8],"hfov":50}}]'
    $PY -I "$MEASURE" sheet "$OUT" --out "$OUT/SHEET.jpg"
    $PY -I "$MEASURE" stats "$OUT" --md "$OUT/NUMBERS.md" > /dev/null
    { echo; echo '## fidelity'; echo '```'; cat "$OUT/fidelity.txt"; echo '```'; } >> "$OUT/NUMBERS.md"
    ;;
  sketch)
    OUT="$HAND/sketch"; mkdir -p "$OUT"
    locked sketch-desktop node "$SHOOT" --port 5220 --data-port 5221 --clip "$OUT" --fps 1 --w 960 --h 540 --samples 1 --framing desktop --state grey --facts "$HAND/checks/facts-sketch.json"
    locked sketch-phone node "$SHOOT" --port 5220 --data-port 5221 --clip "$OUT" --fps 1 --w 360 --h 640 --samples 1 --framing phone --state grey
    node --experimental-strip-types --no-warnings "$WM/forge/babylon-gate/legs.mjs" "$HAND/checks/facts-sketch.json" > "$OUT/LEGS.md"; echo "legs exit $?"
    for F in desktop phone; do
      $PY -I "$MEASURE" frames "$OUT" "$F-f" "$OUT/leg2-$F.jpg" --from 0 --to 68 --cols 10
      $PY -I "$MEASURE" frames "$OUT" "$F-f" "$OUT/leg3-$F.jpg" --from 68 --to 136 --cols 10
      $PY -I "$MEASURE" frames "$OUT" "$F-f" "$OUT/leg4-$F.jpg" --from 136 --to 199 --cols 10
    done
    ;;
  first-pass)
    OUT="$HAND/first-pass"; [ "${2:-}" = "--again" ] && OUT="$HAND/first-pass/final-cams"
    if ls "$OUT"/*.png > /dev/null 2>&1; then echo "refused: $OUT already holds stills"; exit 3; fi
    mkdir -p "$OUT"
    shots "$OUT" '[{"name":"desk-plain","framing":"desktop","state":"flat","css":[1600,900],"ratio":2,"samples":16},{"name":"phone-390x664-plain","framing":"phone","state":"flat","css":[390,664],"ratio":3,"samples":16},{"name":"phone-360x640-plain","framing":"phone","state":"flat","css":[360,640],"ratio":3,"samples":16},{"name":"phone-390x844-plain","framing":"phone","state":"flat","css":[390,844],"ratio":3,"samples":16}]'
    $PY -I "$MEASURE" thumb "$OUT/desk-plain.png" 400 "$OUT/thumb-desk-400.png"
    $PY -I "$MEASURE" thumb "$OUT/phone-390x664-plain.png" 390 "$OUT/thumb-phone-390.png"
    $PY -I "$MEASURE" crops "$OUT/desk-plain.png" "$HAND/checks/crop-boxes.json" desktop "$OUT"
    $PY -I "$MEASURE" crops "$OUT/phone-390x664-plain.png" "$HAND/checks/crop-boxes.json" phone "$OUT"
    $PY -I "$MEASURE" sheet "$OUT" --out "$OUT/SHEET.jpg"
    ;;
  look)
    NAME="${2:?look name}"; STATE="${3:-full}"; SW="${4:-}"
    OUT="$HAND/looks/$NAME"; mkdir -p "$OUT"
    S=false; [ "$SW" = "switch" ] && S=true
    shots "$OUT" "[{\"name\":\"desk\",\"framing\":\"desktop\",\"state\":\"$STATE\",\"switch\":$S,\"css\":[1600,900],\"ratio\":2,\"samples\":8},{\"name\":\"phone-390x664\",\"framing\":\"phone\",\"state\":\"$STATE\",\"switch\":$S,\"css\":[390,664],\"ratio\":3,\"samples\":8}]"
    $PY -I "$MEASURE" crops "$OUT/desk.png" "$HAND/checks/crop-boxes.json" desktop "$OUT"
    $PY -I "$MEASURE" crops "$OUT/phone-390x664.png" "$HAND/checks/crop-boxes.json" phone "$OUT"
    $PY -I "$MEASURE" thumb "$OUT/phone-390x664.png" 360 "$OUT/phone-360-thumb.png"
    $PY -I "$MEASURE" sheet "$OUT" --out "$OUT/SHEET.jpg"
    $PY -I "$MEASURE" stats "$OUT" --boxes "$HAND/checks/crop-boxes.json" --md "$OUT/NUMBERS.md"
    ;;
  switch)
    NAME="${2:?look name}"; OUT="$HAND/looks/$NAME"; mkdir -p "$OUT"
    shots "$OUT" '[{"name":"desk-plain","framing":"desktop","state":"full","css":[1600,900],"ratio":2,"samples":8},{"name":"desk-switch","framing":"desktop","state":"full","switch":true,"css":[1600,900],"ratio":2,"samples":8},{"name":"phone-390x664-plain","framing":"phone","state":"full","css":[390,664],"ratio":3,"samples":8},{"name":"phone-390x664-switch","framing":"phone","state":"full","switch":true,"css":[390,664],"ratio":3,"samples":8},{"name":"phone-360x640-switch","framing":"phone","state":"full","switch":true,"css":[360,640],"ratio":3,"samples":8}]'
    locked "ids-$NAME" node "$SHOOT" --port 5220 --data-port 5221 --out "$OUT/ids" --q 'ids=1&ao=0' --shots '[{"name":"desk-ids","framing":"desktop","state":"full","css":[1600,900],"ratio":2,"samples":1},{"name":"phone-390x664-ids","framing":"phone","state":"full","css":[390,664],"ratio":3,"samples":1}]'
    for F in desk phone-390x664; do
      $PY -I "$MEASURE" mask "$OUT/$F-plain.png" "$OUT/$F-switch.png" "$OUT/mask-$F.png" --ids "$OUT/ids/$F-ids.png"
      $PY -I "$MEASURE" shares "$OUT/ids/$F-ids.png"
    done | tee "$OUT/SWITCH.txt"
    $PY -I "$MEASURE" crops "$OUT/phone-390x664-switch.png" "$HAND/checks/crop-boxes.json" phone "$OUT" --suffix -switch
    $PY -I "$MEASURE" thumb "$OUT/phone-360x640-switch.png" 360 "$OUT/phone-360-switch-thumb.png"
    $PY -I "$MEASURE" sheet "$OUT" --out "$OUT/SHEET.jpg"
    ;;
  geometry)
    G="$WM/forge/babylon-gate/geometry-check.mjs"
    node --experimental-strip-types --no-warnings "$G" --json "$HAND/checks/geometry.json" --eyes "$HAND/checks/facts-sketch.json" 2>&1 | grep -v toNonIndexed > "$HAND/checks/geometry.txt"; echo "geometry exit ${PIPESTATUS[0]} ($(tail -1 "$HAND/checks/geometry.txt"))"
    node --experimental-strip-types --no-warnings "$G" --near 10 --json "$HAND/checks/geometry-near10.json" --eyes "$HAND/checks/facts-sketch.json" 2>&1 | grep -v toNonIndexed > "$HAND/checks/geometry-near10.txt"; echo "geometry near 10 mm exit ${PIPESTATUS[0]} ($(tail -1 "$HAND/checks/geometry-near10.txt"))"
    ;;
  *)
    sed -n 2,10p "$0"; exit 2 ;;
esac
