#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# agent-harness installer  ·  sets up Levels 1–2 (profile + enforced hook)
# globally for Claude Code, so every project gets a disciplined agent by default.
#
#   ./install.sh                              # installs profile/reference.md
#   ./install.sh profile/ready-made/adhd-friendly.md   # install a specific profile
#
# Safe & idempotent: it BACKS UP anything it changes (.bak) and never blindly
# overwrites your existing CLAUDE.md or settings.json. Re-running it is a no-op.
# Memory (L3), the commit gate (L4), playbooks (L5) and the harness (L6) are per-project — this
# prints how to add them at the end. See SETUP-LEVELS.md.
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

REPO="$(cd "$(dirname "$0")" && pwd)"
PROFILE="${1:-profile/reference.md}"
SRC_PROFILE="$REPO/$PROFILE"
CLAUDE_DIR="$HOME/.claude"
# The marker and the hooks folder keep the repo's FORMER name on purpose: installs made before the
# rename carry them, and changing either would make a re-run append a second profile and wire a
# second hook instead of recognising the existing install.
MARKER="<!-- agent-work-ethic:profile -->"

[ -f "$SRC_PROFILE" ] || { echo "❌ profile not found: $SRC_PROFILE"; exit 1; }
mkdir -p "$CLAUDE_DIR/hooks/agent-work-ethic"

# 1) Profile → ~/.claude/CLAUDE.md  (append if one exists, so we don't clobber it)
DEST_MD="$CLAUDE_DIR/CLAUDE.md"
if [ -f "$DEST_MD" ] && grep -qF "$MARKER" "$DEST_MD"; then
  echo "✓ profile already installed in $DEST_MD (skipping)"
elif [ -f "$DEST_MD" ]; then
  cp "$DEST_MD" "$DEST_MD.bak"
  { printf '\n%s\n' "$MARKER"; cat "$SRC_PROFILE"; } >> "$DEST_MD"
  echo "✓ appended profile to existing $DEST_MD (backup: $DEST_MD.bak)"
else
  { printf '%s\n' "$MARKER"; cat "$SRC_PROFILE"; } > "$DEST_MD"
  echo "✓ installed profile → $DEST_MD"
fi

# 2) Enforcement hook → ~/.claude/hooks/agent-work-ethic/ship-bar.sh
cp "$REPO/hooks/ship-bar.sh" "$CLAUDE_DIR/hooks/agent-work-ethic/ship-bar.sh"
chmod +x "$CLAUDE_DIR/hooks/agent-work-ethic/ship-bar.sh"
echo "✓ installed hook → $CLAUDE_DIR/hooks/agent-work-ethic/ship-bar.sh"

# 3) Wire the hook into ~/.claude/settings.json (idempotent JSON merge via python3)
SETTINGS="$CLAUDE_DIR/settings.json"
CMD="bash ~/.claude/hooks/agent-work-ethic/ship-bar.sh"
if command -v python3 >/dev/null 2>&1; then
  [ -f "$SETTINGS" ] && cp "$SETTINGS" "$SETTINGS.bak"
  SETTINGS="$SETTINGS" CMD="$CMD" python3 - <<'PY'
import json, os, sys
path, cmd = os.environ["SETTINGS"], os.environ["CMD"]
try:
    with open(path) as f:
        txt = f.read().strip()
    data = json.loads(txt) if txt else {}
except FileNotFoundError:
    data = {}
except json.JSONDecodeError:
    print(f"⚠ {path} is not valid JSON — leaving it untouched. Add the hook manually (see hooks/settings-snippet.json).")
    sys.exit(0)
hooks = data.setdefault("hooks", {})
ups = hooks.setdefault("UserPromptSubmit", [])
already = any(
    h.get("command") == cmd
    for entry in ups if isinstance(entry, dict)
    for h in entry.get("hooks", []) if isinstance(h, dict)
)
if already:
    print("✓ hook already wired in settings.json (skipping)")
else:
    ups.append({"hooks": [{"type": "command", "command": cmd}]})
    with open(path, "w") as f:
        json.dump(data, f, indent=2)
        f.write("\n")
    print("✓ wired hook into settings.json")
PY
else
  echo "⚠ python3 not found — add this to $SETTINGS by hand (see hooks/settings-snippet.json):"
  echo "    UserPromptSubmit → command: $CMD"
fi

cat <<EOF

✅ Levels 1–2 installed. VERIFY:
   1) bash "$CLAUDE_DIR/hooks/agent-work-ethic/ship-bar.sh"   # should print the contract
   2) start a fresh Claude session, give it a tiny task → it should lead with the
      outcome and end with numbered steps + a VERIFY.

Next levels (per project — see SETUP-LEVELS.md):
   • L3 memory      → copy this repo's memory/ into your project + paste the wire-in from memory/README.md
   • L4 commit gate → commit-gate/README.md  (30-second copy)
   • L5 playbooks   → playbooks/README.md
   • L6 harness     → harness/README.md  (coding projects)
EOF
