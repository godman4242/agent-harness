#!/usr/bin/env bash
# test-build-loop.sh — adversarial tests for the loop engine, in throwaway repos. No model, no usage.
# Run: bash harness/loop/test-build-loop.sh   (~2.5 min: two cases wait out a real minute on purpose)
# Exit 0 only when every case passes. Run it after ANY edit to build-loop.sh.
HERE="$(cd "$(dirname "$0")" && pwd)"
S="$(mktemp -d "${TMPDIR:-/tmp}/loop-test.XXXX")"; trap 'rm -rf "$S"' EXIT
export LOOP_ENGINE="${LOOP_ENGINE:-$HERE/build-loop.sh}"
# A stand-in for `claude -p`: FAKE_MODE picks what the "cycle" does.
cat > "$S/fakeclaude.sh" <<'FAKE'
#!/usr/bin/env bash
case "${FAKE_MODE:-noop}" in
  ship) echo "$RANDOM" >> shipped.txt && git add shipped.txt && git commit -qm "fake ship" && echo "fake: shipped" ;;
  hang) echo "fake: hanging"; sleep 1000 ;;
  dirty) echo "$RANDOM" >> half.txt && echo edit >> docs/loop/GOAL.md && echo "fake: left dirt" ;;
  hangdirty) echo wip > half.txt; echo "fake: hanging dirty"; sleep 1000 ;;
  fail) echo "fake: failing"; exit 1 ;;
  *)    echo "fake: no gap above bar" ;;
esac
FAKE
chmod +x "$S/fakeclaude.sh"
export CLAUDE_BIN="$S/fakeclaude.sh"
pass=0; fail=0
ok()  { echo "PASS  $1"; pass=$((pass+1)); }
bad() { echo "FAIL  $1"; fail=$((fail+1)); }
mkrepo() {  # $1 = verify behaviour: none|green|red ; $2 = gitignore yes|no
  local d; d="$(mktemp -d "$S/engtest.XXXX")"; cd "$d" || exit 1
  git init -q; git config user.email t@t; git config user.name t
  mkdir -p scripts docs/loop
  sed -e 's|^# loop_verify_ship.*||' "$HERE/build-loop.project.sh" > scripts/build-loop.sh
  case "$1" in
    green) sed -i '' 's|^source |loop_verify_ship() { echo verify-green; }\nsource |' scripts/build-loop.sh ;;
    red)   sed -i '' 's|^source |loop_verify_ship() { echo verify-red; return 1; }\nsource |' scripts/build-loop.sh ;;
  esac
  [ "$2" = yes ] && printf 'docs/loop/*\n!docs/loop/*.md\n' > .gitignore
  echo "# goal" > docs/loop/GOAL.md
  git add -A; git commit -qm init
}
# Output lives OUTSIDE the repo (an untracked file would read as a dirty tree). perl alarm = a portable timeout.
run() { MAX_CYCLES="${MAX_CYCLES:-1}" SLEEP="${SLEEP:-1}" perl -e 'alarm shift; exec @ARGV' "${T:-30}" bash scripts/build-loop.sh > "$PWD.out" 2>&1; echo $? > "$PWD.rc"; }

# T1 switches not gitignored → refuses to start
mkrepo none no; run; grep -q 'is not gitignored' "$PWD.out" && [ "$(cat "$PWD.rc")" = 1 ] && ok "T1 refuses without gitignore" || bad "T1 $(tail -2 "$PWD.out")"

# T2 ship + green check
mkrepo green yes; FAKE_MODE=ship run
grep -q 'SHIPPED' "$PWD.out" && grep -q 'post-ship check green' "$PWD.out" && grep -q 'MAX_CYCLES=1 reached' "$PWD.out" && [ ! -f docs/loop/STOP ] && [ ! -f docs/loop/LOOP.pid ] && [ ! -f docs/loop/CYCLE_RUNNING ] \
  && ok "T2 ship → green check → clean exit, lock + marker removed" || bad "T2 $(tail -5 "$PWD.out")"

# T2b the CYCLE_RUNNING marker stays up through the post-ship check (it can rewrite files, e.g. chaos)
mkrepo none yes; sed -i '' 's|^source |loop_verify_ship() { [ -f docs/loop/CYCLE_RUNNING ] \&\& echo marker-during-verify; }\nsource |' scripts/build-loop.sh; git commit -qam v
FAKE_MODE=ship run
grep -q 'marker-during-verify' "$PWD.out" && [ ! -f docs/loop/CYCLE_RUNNING ] && ok "T2b CYCLE_RUNNING held through the post-ship check, then removed" || bad "T2b $(tail -4 "$PWD.out")"

# T3 ship + red check → STOP written with the reason
mkrepo red yes; FAKE_MODE=ship run
grep -q 'post-ship check RED' docs/loop/STOP 2>/dev/null && [ -z "$(git status --porcelain)" ] && ok "T3 red check → STOP file says why; tree clean" || bad "T3 $(tail -5 "$PWD.out")"

# T4 dirty tree → PAUSE, no cycle
mkrepo none yes; echo edit >> docs/loop/GOAL.md; FAKE_MODE=ship run
[ -f docs/loop/PAUSE ] && ! grep -q 'fake:' "$PWD.out" && ok "T4 dirty tree → PAUSE, cycle never ran" || bad "T4 $(tail -5 "$PWD.out")"

# T5a CUTOFF file in the past → run complete before any cycle
mkrepo none yes; echo 202001010000 > docs/loop/CUTOFF; FAKE_MODE=ship run
grep -q 'RUN COMPLETE — cutoff 202001010000' "$PWD.out" && ! grep -q 'fake:' "$PWD.out" && ok "T5a CUTOFF file honoured" || bad "T5a $(tail -3 "$PWD.out")"
# T5b malformed CUTOFF → fail closed
mkrepo none yes; echo 2120 > docs/loop/CUTOFF; FAKE_MODE=ship run
grep -q "holds '2120'" "$PWD.out" && ! grep -q 'fake:' "$PWD.out" && ok "T5b malformed CUTOFF → stops" || bad "T5b $(tail -3 "$PWD.out")"

# T6 + T8 second instance refused; SIGTERM mid-cycle cleans up the cycle, marker and lock
mkrepo none yes; FAKE_MODE=hang MAX_CYCLES=0 bash scripts/build-loop.sh > "$PWD.out" 2>&1 & lp=$!; sleep 3
FAKE_MODE=noop bash scripts/build-loop.sh > "$PWD.out2" 2>&1; rc2=$?
grep -q 'already running' "$PWD.out2" && [ "$rc2" = 1 ] && ok "T6 second loop in same repo refused" || bad "T6 $(cat "$PWD.out2")"
[ -f docs/loop/CYCLE_RUNNING ] && ok "T8a CYCLE_RUNNING present mid-cycle" || bad "T8a no marker mid-cycle"
kill -TERM $lp; sleep 2
! pgrep -f 'sleep 1000' >/dev/null && [ ! -f docs/loop/CYCLE_RUNNING ] && [ ! -f docs/loop/LOOP.pid ] && ok "T8b SIGTERM → hung cycle killed, marker + lock removed" || { bad "T8b $(pgrep -fl 'sleep 1000') $(ls docs/loop)"; pkill -f 'sleep 1000'; }

# T8c kill while PAUSED → exits at once (was: up to 60 s), lock removed
mkrepo none yes; touch docs/loop/PAUSE; bash scripts/build-loop.sh > "$PWD.out" 2>&1 & lp=$!; sleep 3; t0=$(date +%s); kill -TERM $lp
for i in 1 2 3 4 5 6 7 8 9 10; do kill -0 $lp 2>/dev/null || break; sleep 0.5; done
took=$(( $(date +%s) - t0 )); ! kill -0 $lp 2>/dev/null && [ ! -f docs/loop/LOOP.pid ] && ok "T8c kill while paused → gone in ${took}s, lock removed" || { bad "T8c still alive after ${took}s"; kill -9 $lp; }

# T7 watchdog kills a hung cycle, no orphans
mkrepo none yes; FAKE_MODE=hang CYCLE_TIMEOUT=3 run
grep -q 'passed 3s — killed' "$PWD.out" && grep -q 'no-op/err' "$PWD.out" && ! pgrep -f 'sleep 1000' >/dev/null && ok "T7 watchdog killed hung cycle, no orphans" || { bad "T7 $(tail -4 "$PWD.out")"; pkill -f 'sleep 1000'; }

# T11 a cycle that leaves uncommitted work → stashed, and the NEXT cycle still runs (was: PAUSE, and the
# dead-man re-paused on the same dirt every 2 h — one unshipped cycle idled the rest of the night)
mkrepo none yes; FAKE_MODE=dirty MAX_CYCLES=2 run
[ "$(grep -c 'fake: left dirt' "$PWD.out")" = 2 ] && [ ! -f docs/loop/PAUSE ] && [ -z "$(git status --porcelain)" ] && [ "$(git stash list | wc -l | tr -d ' ')" = 2 ] \
  && ok "T11 unshipped leftovers stashed, next cycle still runs" || bad "T11 $(tail -4 "$PWD.out")"
# T11b the same after the watchdog kills a cycle mid-work
mkrepo none yes; FAKE_MODE=hangdirty CYCLE_TIMEOUT=3 run
grep -q 'passed 3s — killed' "$PWD.out" && [ -z "$(git status --porcelain)" ] && git stash list | grep -q 'build-loop: cycle #1' \
  && ok "T11b a killed cycle's leftovers stashed" || { bad "T11b $(tail -4 "$PWD.out")"; pkill -f 'sleep 1000'; }

# T9 dead-man: stale PAUSE + quiet tree → takeover and a cycle runs
mkrepo none yes; touch -t 202601010000 docs/loop/PAUSE; find . -path ./.git -prune -o -type f -exec touch -t 202601010000 {} +
DEADMAN=1 PAUSE_STALE_MIN=1 QUIET_MIN=1 FAKE_MODE=noop run
grep -q 'TAKING OVER' "$PWD.out" && grep -q 'fake: no gap' "$PWD.out" && ok "T9 dead-man takeover" || bad "T9 $(tail -4 "$PWD.out")"
# T9b fresh PAUSE → no takeover (loop idles until cutoff)
mkrepo none yes; touch docs/loop/PAUSE; echo "$(date -v+1M +%Y%m%d%H%M)" > docs/loop/CUTOFF
DEADMAN=1 FAKE_MODE=ship T=130 run
grep -q 'PAUSED (docs/loop/PAUSE present)' "$PWD.out" && ! grep -q 'fake:' "$PWD.out" && [ "$(grep -c PAUSED "$PWD.out")" = 1 ] && grep -q 'RUN COMPLETE' "$PWD.out" && ok "T9b fresh PAUSE respected, noted once, cutoff still ends run" || bad "T9b $(tail -4 "$PWD.out")"

# T10 a long backoff nap ends early when CUTOFF moves to the past
mkrepo none yes; ( sleep 5; echo 202001010000 > docs/loop/CUTOFF ) & start=$(date +%s)
FAKE_MODE=noop MAX_CYCLES=0 SLEEP=600 T=130 run; took=$(( $(date +%s) - start ))
grep -q 'RUN COMPLETE' "$PWD.out" && [ "$took" -lt 90 ] && ok "T10 600s backoff cut short by CUTOFF (${took}s)" || bad "T10 took ${took}s $(tail -3 "$PWD.out")"

echo "== $pass passed, $fail failed"
[ "$fail" = 0 ]
