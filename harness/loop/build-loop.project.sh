#!/usr/bin/env bash
# scripts/build-loop.sh — THIS project's settings for the shared build loop. Copy this file into
# your repo as scripts/build-loop.sh and edit the three marked parts. Everything else (timing,
# watchdog, pause switches, lock, log) lives in the ONE shared engine; its header documents every
# switch and override.
#
# Start:   caffeinate -dimsu bash scripts/build-loop.sh      # stops by itself at the next 08:00
# Dry run: CLAUDE_BIN=true MAX_CYCLES=1 SLEEP=1 bash scripts/build-loop.sh   # no model, no usage
# Steer:   docs/loop/GOAL.md (what matters) · docs/loop/CYCLE.md (the routine one cycle follows)
# Needs:   a pre-commit gate that runs build + tests + lint, and in .gitignore:
#            docs/loop/*
#            !docs/loop/*.md

# 1. What ONE cycle does. Keep it short: the detail belongs in docs/loop/CYCLE.md.
CYCLE_PROMPT='Read docs/loop/GOAL.md FIRST, then docs/loop/CYCLE.md, and do EXACTLY ONE cycle of its
steps. Then STOP and exit: do NOT loop and do NOT schedule any wakeup. This shell loops, and it
checks your work after you ship. If nothing clears the GOAL bar, make NO commit, print
"no gap above bar" with the reason, and exit. A no-op beats a rushed commit.'

# 2. (optional) What a SCRIPT checks after every ship. Non-zero = the loop STOPs for a human.
#    Use what only a script can decide: the deploy status, a live smoke test, a mutation gate.
# loop_verify_ship() { npm run -s e2e; }

# 3. (optional) Cleanup after every cycle, shipped or not.
# loop_after_cycle() { pkill -f "vite preview --port 4199"; }

# DEADMAN=1   # set if interactive sessions hold docs/loop/PAUSE and the loop should take over when one dies

source "${LOOP_ENGINE:-$HOME/agent-harness/harness/loop/build-loop.sh}"   # where you cloned agent-harness
