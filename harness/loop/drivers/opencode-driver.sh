#!/usr/bin/env bash
# opencode-driver.sh — a drop-in replacement for the `claude -p` CLI the shared build loop calls.
#
# WHY: the loop engine invokes:
#     "$CLAUDE_BIN" -p "$PROMPT" --model "$MODEL" --effort "$EFFORT" --permission-mode "$PERM"
# That shape is Anthropic-CLI specific. This script accepts the SAME flags and forwards the
# prompt to `opencode run`, which works on the free opencode tier (no Anthropic credit).
#
# USE:   CLAUDE_BIN=$HOME/kheshav-code/agent-harness/harness/loop/drivers/opencode-driver.sh \
#        MODEL=opencode/beam-free bash scripts/build-loop.sh
#
# NOTES:
#   - opencode's --model is a provider/model id, so MODEL is passed straight through.
#   - opencode has no --effort / --permission-mode; they are accepted and ignored on purpose.
#   - opencode writes files directly (no permission prompt in `run` mode) — verified 2026-10-29.
#   - Exit code is propagated, so the engine's failure handling still works.
set -uo pipefail

PROMPT=""
MODEL="opencode/beam-free"

while [ $# -gt 0 ]; do
  case "$1" in
    -p)            PROMPT="${2-}"; shift 2 ;;
    --model)       MODEL="${2-}"; shift 2 ;;
    --effort|--permission-mode) shift 2 ;;   # accepted, ignored
    --*)           shift ;;
    *)             PROMPT="$PROMPT $1"; shift ;;
  esac
done

if [ -z "$PROMPT" ]; then
  echo "opencode-driver: no prompt given" >&2
  exit 64
fi

exec opencode run --model "$MODEL" "$PROMPT"
