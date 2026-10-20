#!/bin/bash
# One step of the gate's round in one call, every render under the gate lock (slots C or D).
#   bash step.sh massing              grey stills of both cameras, an overview, fidelity, the crop boxes, looks/massing/SHEET.jpg and NUMBERS.md
#   bash step.sh sketch               the timed path of stops 2 to 4 on the grey massing: frames, 1 fps sheets per leg, the leg numbers
#   bash step.sh first-pass [--again] the flat state's stills, thumbnails and crops into first-pass/ (refuses to overwrite)
#   bash step.sh look <name> [state] [switch]   a look round: desktop and phone stills and the crops, looks/<name>/SHEET.jpg
#   bash step.sh switch <name>        both states at both framings (and 360x640), the id pass, the difference masks and shares, looks/<name>/
#   bash step.sh phone <name>         the phone camera's own look: plain and switch at 390x664, 360x640, 390x844, the box's outline, the legend
#   bash step.sh geometry             the offline geometry check, default and near (10 mm) passes, into checks/
#   bash step.sh final [--again]      the full set of section 6 into stills/, every check into checks/
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
OVERLAY="$WM/forge/babylon-gate/overlay.mjs"
overlays() { # <log name> <folder of stills> <hero json> <sizes...>: the legend in both languages over each switch still, the box's outline over the 664 and 640 plain stills
  local name="$1" dir="$2" hero="$3"; shift 3
  local script="$LOGS/$name.sh"
  { echo 'set -u'
    for S in "$@"; do
      for L in en de; do echo "node --no-warnings '$OVERLAY' --still '$dir/$S-switch.png' --lang $L --out '$dir/$S-switch-$L.png' --live '$HAND/checks/sheet-box.json' --hero '$hero'; echo \"overlay $S $L exit \$?\""; done
      case "$S" in *x664|*x640) echo "node --no-warnings '$OVERLAY' --still '$dir/$S-plain.png' --sheet --out '$dir/$S-sheet.png' --live '$HAND/checks/sheet-box.json' --hero '$hero'; echo \"overlay $S sheet exit \$?\"" ;; esac
    done
  } > "$script"
  locked "$name" bash "$script"
  grep -E '^(en|de|sheet):|^overlay ' "$LOGS/$name.log"
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
      $PY -I "$MEASURE" frames "$OUT" "$F-f" "$OUT/leg3-$F.jpg" --from 68 --to 139 --cols 10
      $PY -I "$MEASURE" frames "$OUT" "$F-f" "$OUT/leg4-$F.jpg" --from 139 --to 202 --cols 10
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
    locked crops node "$SHOOT" --port 5220 --data-port 5221 --crops "$HAND/checks/crop-boxes.json"
    shots "$OUT" "[{\"name\":\"desk\",\"framing\":\"desktop\",\"state\":\"$STATE\",\"switch\":$S,\"css\":[1600,900],\"ratio\":2,\"samples\":8},{\"name\":\"phone-390x664\",\"framing\":\"phone\",\"state\":\"$STATE\",\"switch\":$S,\"css\":[390,664],\"ratio\":3,\"samples\":8}]"
    $PY -I "$MEASURE" crops "$OUT/desk.png" "$HAND/checks/crop-boxes.json" desktop "$OUT"
    $PY -I "$MEASURE" crops "$OUT/phone-390x664.png" "$HAND/checks/crop-boxes.json" phone "$OUT"
    $PY -I "$MEASURE" thumb "$OUT/phone-390x664.png" 360 "$OUT/phone-360-thumb.png"
    $PY -I "$MEASURE" thumb "$OUT/desk.png" 400 "$OUT/desk-400-thumb.png"
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
  phone)
    NAME="${2:?look name}"; OUT="$HAND/looks/$NAME"; mkdir -p "$OUT"
    locked crops node "$SHOOT" --port 5220 --data-port 5221 --crops "$HAND/checks/crop-boxes.json"
    locked hero node "$SHOOT" --port 5220 --data-port 5221 --hero "$OUT/hero.json"
    shots "$OUT" '[{"name":"phone-390x664-plain","framing":"phone","state":"full","css":[390,664],"ratio":3,"samples":8},{"name":"phone-390x664-switch","framing":"phone","state":"full","switch":true,"css":[390,664],"ratio":3,"samples":8},{"name":"phone-360x640-plain","framing":"phone","state":"full","css":[360,640],"ratio":3,"samples":8},{"name":"phone-360x640-switch","framing":"phone","state":"full","switch":true,"css":[360,640],"ratio":3,"samples":8},{"name":"phone-390x844-plain","framing":"phone","state":"full","css":[390,844],"ratio":3,"samples":8},{"name":"phone-390x844-switch","framing":"phone","state":"full","switch":true,"css":[390,844],"ratio":3,"samples":8}]'
    overlays "overlay-$NAME" "$OUT" "$OUT/hero.json" phone-390x664 phone-360x640 phone-390x844
    $PY -I "$MEASURE" crops "$OUT/phone-390x664-plain.png" "$HAND/checks/crop-boxes.json" phone "$OUT"
    for S in 390x664 360x640 390x844; do $PY -I "$MEASURE" thumb "$OUT/phone-$S-plain.png" 360 "$OUT/thumb-$S-plain.png"; done
    $PY -I "$MEASURE" sheet "$OUT" --out "$OUT/SHEET.jpg" --only phone-390x664-sheet,phone-360x640-sheet,phone-390x664-switch-de,phone-360x640-switch-de,phone-390x844-switch-en
    $PY -I "$MEASURE" stats "$OUT" --boxes "$HAND/checks/crop-boxes.json" --md "$OUT/NUMBERS.md"
    ;;
  final)
    OUT="$HAND/stills"; CH="$HAND/checks"
    if ls "$OUT"/*.png > /dev/null 2>&1 && [ "${2:-}" != "--again" ]; then echo "refused: $OUT already holds stills (--again renders them again)"; exit 3; fi
    mkdir -p "$OUT" "$CH/ids" "$CH/corners"
    locked crops node "$SHOOT" --port 5220 --data-port 5221 --crops "$CH/crop-boxes.json"
    locked hero node "$SHOOT" --port 5220 --data-port 5221 --hero "$CH/hero.json"
    locked facts node "$SHOOT" --port 5220 --data-port 5221 --facts "$CH/facts.json"
    shots "$OUT" '[{"name":"desk-plain","framing":"desktop","state":"full","css":[1600,900],"ratio":2,"samples":16},{"name":"desk-switch","framing":"desktop","state":"full","switch":true,"css":[1600,900],"ratio":2,"samples":16},{"name":"desk-plain-r1","framing":"desktop","state":"full","css":[1600,900],"ratio":1,"samples":16},{"name":"desk-plain-brighter","framing":"desktop","state":"full","css":[1600,900],"ratio":2,"samples":16,"stops":0.5},{"name":"phone-390x664-plain","framing":"phone","state":"full","css":[390,664],"ratio":3,"samples":16},{"name":"phone-390x664-switch","framing":"phone","state":"full","switch":true,"css":[390,664],"ratio":3,"samples":16},{"name":"phone-390x664-plain-brighter","framing":"phone","state":"full","css":[390,664],"ratio":3,"samples":16,"stops":0.5},{"name":"phone-360x640-plain","framing":"phone","state":"full","css":[360,640],"ratio":3,"samples":16},{"name":"phone-360x640-switch","framing":"phone","state":"full","switch":true,"css":[360,640],"ratio":3,"samples":16},{"name":"phone-390x844-plain","framing":"phone","state":"full","css":[390,844],"ratio":3,"samples":16},{"name":"phone-390x844-switch","framing":"phone","state":"full","switch":true,"css":[390,844],"ratio":3,"samples":16}]'
    mv "$OUT/network.json" "$CH/network-stills.json"
    locked ids-final node "$SHOOT" --port 5220 --data-port 5221 --out "$CH/ids" --q 'ids=1&ao=0' --network "$CH/ids/network.json" --shots '[{"name":"desk-ids","framing":"desktop","state":"full","css":[1600,900],"ratio":2,"samples":1},{"name":"phone-390x664-ids","framing":"phone","state":"full","css":[390,664],"ratio":3,"samples":1},{"name":"phone-360x640-ids","framing":"phone","state":"full","css":[360,640],"ratio":3,"samples":1},{"name":"phone-390x844-ids","framing":"phone","state":"full","css":[390,844],"ratio":3,"samples":1}]'
    for F in desk phone-390x664 phone-360x640 phone-390x844; do
      $PY -I "$MEASURE" mask "$OUT/$F-plain.png" "$OUT/$F-switch.png" "$CH/mask-$F.png" --ids "$CH/ids/$F-ids.png"
      $PY -I "$MEASURE" shares "$CH/ids/$F-ids.png"
    done | tee "$CH/SWITCH.txt"
    overlays overlay-final "$OUT" "$CH/hero.json" desk phone-390x664 phone-360x640 phone-390x844 | tee "$CH/OVERLAY.txt"
    $PY -I "$MEASURE" thumb "$OUT/desk-plain.png" 400 "$OUT/thumb-desk-400.png"
    $PY -I "$MEASURE" thumb "$OUT/phone-390x664-plain.png" 390 "$OUT/thumb-phone-390.png"
    $PY -I "$MEASURE" crops "$OUT/desk-plain.png" "$CH/crop-boxes.json" desktop "$OUT" --checks "$CH/corners"
    $PY -I "$MEASURE" crops "$OUT/phone-390x664-plain.png" "$CH/crop-boxes.json" phone "$OUT" --checks "$CH/corners"
    $PY -I "$MEASURE" stats "$OUT" --boxes "$CH/crop-boxes.json" --md "$CH/NUMBERS.md" > /dev/null
    $PY -I "$MEASURE" settings "$OUT" --md "$CH/SETTINGS.md" > /dev/null
    rm -f "$CH/HUES.md"; for F in crop-door crop-far-courses crop-figure; do $PY -I "$MEASURE" hues "$OUT/$F.png" --md "$CH/HUES.md" > /dev/null; done
    $PY -I "$MEASURE" sheet "$OUT" --out "$CH/STILLS-SHEET.jpg" > /dev/null
    node --experimental-strip-types --no-warnings "$WM/forge/babylon-gate/fidelity.mjs" --facts "$CH/facts.json" --json "$CH/fidelity.json" > "$CH/fidelity.txt"; echo "fidelity exit $? ($(tail -1 "$CH/fidelity.txt"))"
    node --experimental-strip-types --no-warnings "$WM/forge/babylon-gate/colour-check.mjs" --md "$CH/colours.md" > /dev/null; echo "colour-check exit $?"
    G="$WM/forge/babylon-gate/geometry-check.mjs"
    node --experimental-strip-types --no-warnings "$G" --json "$CH/geometry.json" --eyes "$CH/facts.json" 2>&1 | grep -v toNonIndexed > "$CH/geometry.txt"; echo "geometry exit ${PIPESTATUS[0]} ($(tail -1 "$CH/geometry.txt"))"
    node --experimental-strip-types --no-warnings "$G" --near 10 --json "$CH/geometry-near10.json" --eyes "$CH/facts.json" 2>&1 | grep -v toNonIndexed > "$CH/geometry-near10.txt"; echo "geometry near 10 mm exit ${PIPESTATUS[0]} ($(tail -1 "$CH/geometry-near10.txt"))"
    # rights: every file the page loaded, against the folders whose files are eyes only; then the code itself
    $PY -I - "$CH" "$OUT" > "$CH/RIGHTS.txt" <<'RIGHTS'
import json, os, sys
ch, out = sys.argv[1], sys.argv[2]
lists = [os.path.join(ch, 'network-stills.json'), os.path.join(ch, 'ids', 'network.json')]
seen = set()
for f in lists:
    seen |= set(json.load(open(f)))
for f in sorted(os.listdir(out)):
    if f.endswith('.json'):
        d = json.load(open(os.path.join(out, f)))
        seen |= set(d.get('requests', []))
bad = [u for u in seen if any(k in u for k in ('/refs/', '/sources/', 'evidence-1019', 'research-1020', 'uppsala-maps-1020', 'PILOT'))]
print(f'files loaded by the page and the overlay: {len(seen)}; from an eyes-only folder: {len(bad)}')
for u in sorted(seen):
    print(u)
RIGHTS
    echo "rights: $(head -1 "$CH/RIGHTS.txt")"
    { echo; echo "grep of the gate's code and tools for the eyes-only folders (step.sh left out: it holds the pattern itself):"; grep -rnE --exclude=step.sh "PILOT/refs|PILOT/sources|evidence-1019|research-1020|uppsala-maps-1020|/refs/" "$WM/src/wings/babylon/gate" "$WM/forge/babylon-gate" || echo "none"; } >> "$CH/RIGHTS.txt"
    tail -1 "$CH/RIGHTS.txt"
    ;;
  geometry)
    G="$WM/forge/babylon-gate/geometry-check.mjs"
    node --experimental-strip-types --no-warnings "$G" --json "$HAND/checks/geometry.json" --eyes "$HAND/checks/facts-sketch.json" 2>&1 | grep -v toNonIndexed > "$HAND/checks/geometry.txt"; echo "geometry exit ${PIPESTATUS[0]} ($(tail -1 "$HAND/checks/geometry.txt"))"
    node --experimental-strip-types --no-warnings "$G" --near 10 --json "$HAND/checks/geometry-near10.json" --eyes "$HAND/checks/facts-sketch.json" 2>&1 | grep -v toNonIndexed > "$HAND/checks/geometry-near10.txt"; echo "geometry near 10 mm exit ${PIPESTATUS[0]} ($(tail -1 "$HAND/checks/geometry-near10.txt"))"
    ;;
  *)
    sed -n 2,11p "$0"; exit 2 ;;
esac
