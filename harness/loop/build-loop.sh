#!/usr/bin/env bash
# harness/loop/build-loop.sh — the shared ENGINE of an autonomous build loop.
#
# A project never runs this file directly. Its own `scripts/build-loop.sh` sets the project's
# settings and then `source`s this file, so there is ONE engine and many small project files. A fix
# here reaches every project, and no copy drifts. Template: build-loop.project.sh (same folder).
#
# Each cycle is one FRESH headless `claude -p` process: clean context, flat cost, and a crashed
# cycle can't take the run down. It does ONE unit of work and exits. This shell does everything
# a script can decide:
#   time box · per-cycle watchdog · pause switches · single-instance lock · dirty-tree refusal ·
#   idle backoff · the project's own check after every ship (red → STOP, fail closed) · a log.
#
# ── Project file: set what applies, then source this ──────────────────────────────────────────
#   CYCLE_PROMPT='…'             REQUIRED. What one cycle does; point it at the project's cycle doc.
#   loop_verify_ship() { …; }    optional. Runs after a cycle ships ($1 = new HEAD); non-zero → STOP.
#   loop_after_cycle() { …; }    optional. Cleanup after every cycle (e.g. kill a preview server).
#   DEADMAN=1                    optional. Interactive sessions hold PAUSE; a PAUSE older than
#                                PAUSE_STALE_MIN (120) on a tree quiet for QUIET_MIN (60) means the
#                                session died → the loop removes PAUSE and takes over.
#
# ── Switches: files in docs/loop/, all gitignored (the engine refuses to start otherwise) ────
#   PAUSE          soft pause: "someone is editing". `rm` it to resume within a minute.
#   STOP           hard pause: "a human must look". The engine writes it on a red check; its
#                  first line says why. Never removed automatically.
#   CUTOFF         change the stop time of a RUNNING loop: `echo 202610011800 > docs/loop/CUTOFF`
#                  (local YYYYMMDDHHMM). Anything else in the file stops the loop (fail closed).
#   CYCLE_RUNNING  exists while a cycle works. Before editing the repo: touch PAUSE, wait for it
#                  to disappear.
#   LOOP.pid       the running loop's pid. A second loop in the same repo refuses to start.
#
# ── Env overrides ──────────────────────────────────────────────────────────────────────────────
#   CUTOFF         local YYYYMMDDHHMM to stop at. Default: the next 08:00. 210001010000 = forever.
#   LOOP_TZ        e.g. Europe/London. Default: the machine's own clock.
#   MODEL EFFORT   default claude-opus-5-5 / high.   PERM  default bypassPermissions
#                  (a headless process can't answer prompts; the commit gate is the safety net).
#   CYCLE_TIMEOUT  seconds before a cycle is killed (5400 = 90 min).
#   SLEEP MAX_SLEEP  breather after a ship (10 s); an idle/errored cycle doubles it up to 1800 s.
#   MAX_CYCLES     0 = unlimited.   CLAUDE_BIN  the CLI (a stub for a dry run).
#
# Dry run (no model, no usage):  CLAUDE_BIN=true MAX_CYCLES=1 SLEEP=1 bash scripts/build-loop.sh
# macOS only: BSD `date -v` and `stat -f`.
set -uo pipefail   # NOT -e: one failing cycle must not kill the run.

: "${CYCLE_PROMPT:?set CYCLE_PROMPT in scripts/build-loop.sh before sourcing the engine}"
lt() { if [ -n "${LOOP_TZ:-}" ]; then TZ="$LOOP_TZ" date "$@"; else date "$@"; fi; }
if [ "$(lt +%H%M)" -lt 0800 ]; then next8="$(lt +%Y%m%d)0800"; else next8="$(lt -v+1d +%Y%m%d)0800"; fi
CUTOFF="${CUTOFF:-$next8}"
MODEL="${MODEL:-claude-opus-5-5}"
EFFORT="${EFFORT:-high}"
PERM="${PERM:-bypassPermissions}"
CYCLE_TIMEOUT="${CYCLE_TIMEOUT:-5400}"
SLEEP="${SLEEP:-10}"
MAX_SLEEP="${MAX_SLEEP:-1800}"
MAX_CYCLES="${MAX_CYCLES:-0}"
CLAUDE_BIN="${CLAUDE_BIN:-claude}"
DEADMAN="${DEADMAN:-0}"
PAUSE_STALE_MIN="${PAUSE_STALE_MIN:-120}"
QUIET_MIN="${QUIET_MIN:-60}"

cd "$(dirname "$0")/.." || { echo "build-loop: cannot cd to the repo root" >&2; exit 1; }
L=docs/loop
mkdir -p "$L/logs"

# Every switch must be gitignored: a commit gate that runs `git add -A` would otherwise commit one,
# and the dirty-tree check would read the loop's own switch as someone's edit.
for f in PAUSE STOP CUTOFF CYCLE_RUNNING LOOP.pid logs/x.log; do
  git check-ignore -q "$L/$f" || {
    printf 'build-loop: %s is not gitignored. Add these two lines to .gitignore, commit, re-run:\n  docs/loop/*\n  !docs/loop/*.md\n' "$L/$f" >&2
    exit 1; }
done

# One loop per repo: two writers on one working tree corrupt each other.
if [ -f "$L/LOOP.pid" ] && kill -0 "$(cat "$L/LOOP.pid")" 2>/dev/null; then
  echo "build-loop: another loop (pid $(cat "$L/LOOP.pid")) is already running in this repo — not starting a second." >&2
  exit 1
fi
echo $$ > "$L/LOOP.pid"

LOG="$L/logs/loop-$(lt +%Y%m%d-%H%M).log"
exec > >(tee -a "$LOG") 2>&1

kill_tree() { local c; for c in $(pgrep -P "$1" 2>/dev/null); do kill_tree "$c"; done; kill -TERM "$1" 2>/dev/null; }
cycle_pid="" watchdog_pid="" nap_pid=""
# Every wait runs in the background + `wait`, so a kill is handled at once, not after a 60 s sleep.
zz() { sleep "$1" & nap_pid=$!; wait "$nap_pid"; nap_pid=""; }
cleanup() {
  [ -n "$nap_pid" ] && kill "$nap_pid" 2>/dev/null
  [ -n "$cycle_pid" ] && kill_tree "$cycle_pid"
  [ -n "$watchdog_pid" ] && kill_tree "$watchdog_pid"
  rm -f "$L/CYCLE_RUNNING"
  [ "$(cat "$L/LOOP.pid" 2>/dev/null)" = "$$" ] && rm -f "$L/LOOP.pid"
}
trap cleanup EXIT
trap 'exit 130' INT TERM

now() { lt +%Y%m%d%H%M; }
# The live cutoff: docs/loop/CUTOFF if present (12 digits), else CUTOFF. Malformed → returns 1.
current_cutoff() {
  [ -f "$L/CUTOFF" ] || { echo "$CUTOFF"; return 0; }
  local c; c="$(tr -d '[:space:]' < "$L/CUTOFF")"
  [[ "$c" =~ ^[0-9]{12}$ ]] && { echo "$c"; return 0; }
  return 1
}
# Sleep in ≤60 s slices so a new cutoff or a STOP is honoured within a minute, not after a 30-min backoff.
nap() {
  local left="$1" s c
  while [ "$left" -gt 0 ]; do
    c="$(current_cutoff)" || return 0
    [ "$(now)" -ge "$c" ] && return 0
    [ -f "$L/STOP" ] && return 0
    s=$(( left < 60 ? left : 60 )); zz "$s"; left=$(( left - s ))
  done
}
# Say a waiting state once, not every minute.
last_note=""
note_once() { [ "$1" = "$last_note" ] || { echo "──── $1 @ $(lt '+%a %H:%M') ────"; last_note="$1"; }; }
stop_loop() { printf '%s @ %s\n' "$1" "$(lt '+%F %H:%M')" > "$L/STOP"; echo "──── ✗ $1 — STOP set. A human must look; \`rm docs/loop/STOP\` resumes. ────"; }

# Dead-man helpers (DEADMAN=1). Quiet = no file changed in QUIET_MIN min, ignoring .git, node_modules,
# docs/loop and dist; a touch(1) reference file because BSD find has no "newer than N min".
pause_stale() {
  local mt; mt="$(stat -f %m "$L/PAUSE" 2>/dev/null)" || return 1
  [ $(( $(date +%s) - mt )) -gt $(( PAUSE_STALE_MIN * 60 )) ]
}
tree_active() {
  local ref; ref="$(mktemp)"
  touch -t "$(date -v-"${QUIET_MIN}"M +%Y%m%d%H%M.%S)" "$ref" || { rm -f "$ref"; return 0; }
  local hit; hit="$(find . \( -path ./.git -o -path ./node_modules -o -path ./docs/loop -o -path ./dist \) -prune \
    -o -type f -newer "$ref" -print -quit)"
  rm -f "$ref"; [ -n "$hit" ]
}

echo "build-loop: repo=$(basename "$PWD") cutoff=$CUTOFF model=$MODEL/$EFFORT timeout=${CYCLE_TIMEOUT}s perm=$PERM deadman=$DEADMAN log=$LOG starting $(lt '+%a %H:%M')"
n=0; idle=0; cur_sleep="$SLEEP"
while true; do
  if ! cutoff="$(current_cutoff)"; then
    echo "════ STOP — docs/loop/CUTOFF holds '$(head -c 40 "$L/CUTOFF")', not YYYYMMDDHHMM. Stopping (fail closed); $n cycle(s) run ════"
    break
  fi
  if [ "$(now)" -ge "$cutoff" ]; then
    echo "════ RUN COMPLETE — cutoff $cutoff reached at $(lt '+%H:%M'); $n cycle(s) run ════"
    break
  fi
  if [ "$MAX_CYCLES" -gt 0 ] && [ "$n" -ge "$MAX_CYCLES" ]; then
    echo "════ STOP — MAX_CYCLES=$MAX_CYCLES reached; $n cycle(s) run ════"
    break
  fi
  if [ -f "$L/STOP" ]; then
    note_once "STOPPED: $(head -1 "$L/STOP"). \`rm docs/loop/STOP\` to resume"
    zz 60; continue
  fi
  if [ -f "$L/PAUSE" ]; then
    if [ "$DEADMAN" = 1 ] && pause_stale && ! tree_active; then
      echo "──── PAUSE stale >${PAUSE_STALE_MIN}m + tree quiet >${QUIET_MIN}m: the session is presumed dead. TAKING OVER. ────"
      rm -f "$L/PAUSE"
    else
      note_once "PAUSED (docs/loop/PAUSE present). \`rm docs/loop/PAUSE\` to resume"
      zz 60; continue
    fi
  fi
  last_note=""
  n=$((n + 1))
  echo ""
  echo "════════ cycle #$n @ $(lt '+%a %H:%M')  (cutoff $cutoff, idle-streak $idle) ════════"
  # A dirty tree means someone is editing without PAUSE; a cycle's commit could sweep their work in.
  if [ -n "$(git status --porcelain)" ]; then
    echo "──── ✗ working tree is not clean — PAUSING (commit or stash, then rm docs/loop/PAUSE) ────"
    git status --short | head -10
    touch "$L/PAUSE"
    continue
  fi
  head_before="$(git rev-parse HEAD 2>/dev/null || echo none)"
  touch "$L/CYCLE_RUNNING"
  "$CLAUDE_BIN" -p "$CYCLE_PROMPT" --model "$MODEL" --effort "$EFFORT" --permission-mode "$PERM" &
  cycle_pid=$!
  ( sleep "$CYCLE_TIMEOUT" && echo "──── ✗ cycle #$n passed ${CYCLE_TIMEOUT}s — killed ────" && kill_tree "$cycle_pid" ) &
  watchdog_pid=$!
  wait "$cycle_pid"; status=$?
  kill_tree "$watchdog_pid"; wait "$watchdog_pid" 2>/dev/null
  cycle_pid="" watchdog_pid=""
  rm -f "$L/CYCLE_RUNNING"
  declare -F loop_after_cycle >/dev/null && loop_after_cycle
  head_after="$(git rev-parse HEAD 2>/dev/null || echo none)"
  if [ "$status" -eq 0 ] && [ "$head_before" != "$head_after" ]; then
    idle=0; cur_sleep="$SLEEP"
    echo "──── cycle #$n SHIPPED $head_after (exit $status) @ $(lt '+%H:%M') ────"
    if declare -F loop_verify_ship >/dev/null; then
      if loop_verify_ship "$head_after"; then echo "──── ✓ post-ship check green for $head_after ────"
      else stop_loop "post-ship check RED for $head_after"; continue; fi
    fi
    nap "$cur_sleep"
  else
    idle=$((idle + 1))
    echo "──── cycle #$n no-op/err (exit $status, $idle in a row) @ $(lt '+%H:%M'); backing off ${cur_sleep}s ────"
    nap "$cur_sleep"
    cur_sleep=$((cur_sleep * 2)); [ "$cur_sleep" -gt "$MAX_SLEEP" ] && cur_sleep="$MAX_SLEEP"
  fi
done
