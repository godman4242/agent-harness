# Install

Two ways to use this: **per-project** (fastest) or **global** (applies to every project + enforces the
rules with a hook). Start with per-project; add the global hook when you want the rules *enforced*, not
just advisory.

> **Prefer one command?** `./install.sh` does the global setup (Section B) for you — profile + hook +
> settings wiring, safe and idempotent (backs up anything it touches). The manual steps below are for
> per-project setup, or if you'd rather wire it by hand. See also [`SETUP-LEVELS.md`](SETUP-LEVELS.md)
> for the full climb (memory, commit gate, playbooks).

First, make your profile: run [`generate-your-profile.md`](generate-your-profile.md), or copy
[`profile/reference.md`](profile/reference.md) / [`profile/TEMPLATE.md`](profile/TEMPLATE.md) and edit
the `{slots}`. Then pick a setup below.

---

## A. Per-project (advisory) — 30 seconds

Copy your profile into the project root under the filename your tool reads:

- **Claude Code** → `CLAUDE.md`
- **Cursor / Codex / Copilot** → `AGENTS.md`

```bash
# from inside agent-harness/, run this in your target project:
cp "/path/to/agent-harness/hooks/CLAUDE.md.template"  ./CLAUDE.md     # Claude Code
# or
cp "/path/to/agent-harness/hooks/AGENTS.md.template"  ./AGENTS.md     # other tools
```

Edit the `{slots}` in the copied file. Done — the agent reads it at the start of each session.

**VERIFY:** open the agent in that project and ask it a tiny task; it should lead with the outcome and
end with a numbered VERIFY step.

---

## B. Global + enforced (Claude Code) — ~2 minutes

This makes the rules apply to **every** project and re-injects them **every turn** via a hook (a small
script the agent runs automatically), so they don't fade as the chat grows.

```bash
# 1) Put your profile where Claude reads it for every project:
cp "/path/to/agent-harness/hooks/CLAUDE.md.template"  ~/.claude/CLAUDE.md   # (or append to an existing one)

# 2) Install the enforcement hook:
mkdir -p ~/.claude/hooks/agent-work-ethic
cp "/path/to/agent-harness/hooks/ship-bar.sh"  ~/.claude/hooks/agent-work-ethic/ship-bar.sh
chmod +x ~/.claude/hooks/agent-work-ethic/ship-bar.sh
```

3) Wire the hook into `~/.claude/settings.json`. Open
   [`hooks/settings-snippet.json`](hooks/settings-snippet.json) and merge its `"hooks"` block into your
   settings file (drop the `_comment` line). If you already have a `"hooks"` key, **add** the
   `UserPromptSubmit` entry rather than overwriting.

**VERIFY (do this — it's the real proof):**
```bash
# Confirm the hook prints the contract:
bash ~/.claude/hooks/agent-work-ethic/ship-bar.sh
# Confirm your settings file is still valid JSON:
python3 -m json.tool ~/.claude/settings.json > /dev/null && echo "settings.json OK"
```
Then start a fresh Claude session in any project, give it a trivial task, and confirm the reply leads
with the outcome, defines any jargon, and ends with numbered steps + a VERIFY. If it does, it's live.

---

## Updating

Re-run [`generate-your-profile.md`](generate-your-profile.md) whenever your preferences change, and
re-copy the result over your `CLAUDE.md` / `AGENTS.md`. The hook never needs re-installing.

## Removing

- Per-project: delete the `CLAUDE.md` / `AGENTS.md` you added.
- Global hook: remove the `UserPromptSubmit` entry from `~/.claude/settings.json` and delete
  `~/.claude/hooks/agent-work-ethic/`.
