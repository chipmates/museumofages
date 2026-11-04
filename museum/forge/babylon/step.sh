#!/bin/bash
# One step of a Babylon round, by stop id, in one call; every render runs under the render lock.
#   bash step.sh smoke                          every Babylon page in Chromium and WebKit at 1440x900 and 390x844: smoke/SMOKE.md
#   bash step.sh stills <stop> <label> [view]   both framings of the stop into stills/<label>/, a contact sheet and NUMBERS.md
#   bash step.sh geometry <stop>                coplanar, sub-pixel and floating bodies of the stop's page: checks/geometry-<stop>.txt
#   bash step.sh change <label a> <label b>     the change measure between two still sets: checks/change-<a>-<b>.txt (exit 2: no judge)
#   bash step.sh crops <boxes.tsv> <label a> <label b> <out>   the fixed part boxes of two still sets beside their references
# <stop> is a number or an id (stops 1 to 14), map:<stop> for the map's grey blocks, or a page name (map, gate, open).
set -u
WM="$(cd "$(dirname "$0")/../.." && pwd)"
# BABYLON_HAND names the hand-in folder of the round; BABYLON_LOCK a script that runs <log> <command...> under the lock.
HAND="${BABYLON_HAND:?set BABYLON_HAND to the hand-in folder of the round}"
LOCK="${BABYLON_LOCK:?set BABYLON_LOCK to the render lock script}"
PORT="${BABYLON_PORT:-5214}"
PY="${BABYLON_PY:-python3}"
# BABYLON_SHOOT_ARGS: more flags for shoot.mjs (sizes, samples), e.g. "--desktop 800x450@1 --samples 4"
KIT="$WM/forge/babylon"
LOGS="$HAND/scratch/logs"
[ -d "$HAND" ] || { echo "no hand-in folder $HAND"; exit 2; }
mkdir -p "$LOGS" "$HAND/checks"

locked() { # <log name> <command...>
  local log="$LOGS/$1.log"; shift
  LOCK_OWNER="${LOCK_OWNER:-babylon}" bash "$LOCK" "$log" "$@"
  local code=$?
  grep -E '^(ERROR|PAGEERROR|FAILED|HTTP|RED|exit [1-9])' "$log" | head -20
  echo "step $(basename "$log" .log): exit $code ($(grep -c '' "$log") log lines)"
  return $code
}

case "${1:-}" in
  smoke)
    locked smoke node "$KIT/smoke.mjs" --out "$HAND/smoke" --port "$PORT"
    ;;
  stills)
    STOP="${2:?stop}"; LABEL="${3:?label}"; VIEW="${4:-grey}"
    OUT="$HAND/stills/$LABEL"; mkdir -p "$OUT"
    locked "stills-$LABEL-${STOP//:/-}" node "$KIT/shoot.mjs" --stop "$STOP" --out "$OUT" --view "$VIEW" --port "$PORT" ${BABYLON_SHOOT_ARGS:-}
    "$PY" -I "$KIT/stills.py" sheet "$OUT" --out "$OUT/SHEET.jpg"
    "$PY" -I "$KIT/stills.py" stats "$OUT" --md "$OUT/NUMBERS.md" > /dev/null
    ;;
  geometry)
    STOP="${2:?stop}"; F="$HAND/checks/geometry-${STOP//:/-}"
    node --experimental-strip-types --no-warnings "$KIT/geometry-check.mjs" --stop "$STOP" --json "$F.json" 2>&1 | grep -v toNonIndexed > "$F.txt"
    echo "geometry $STOP exit ${PIPESTATUS[0]} ($(tail -1 "$F.txt"))"
    ;;
  change)
    A="${2:?label a}"; B="${3:?label b}"; F="$HAND/checks/change-$A-$B"
    "$PY" -I "$KIT/change.py" "$HAND/stills/$A" "$HAND/stills/$B" --maps "$F-maps" > "$F.txt"
    CODE=$?; tail -1 "$F.txt"; exit $CODE
    ;;
  crops)
    BOXES="${2:?boxes tsv}"; A="${3:?label a}"; B="${4:?label b}"; OUT="${5:?out folder}"
    "$PY" -I "$KIT/part-crops.py" "$BOXES" "$HAND/stills/$A" "$HAND/stills/$B" "$OUT"
    ;;
  *)
    sed -n 2,8p "$0"; exit 2 ;;
esac
