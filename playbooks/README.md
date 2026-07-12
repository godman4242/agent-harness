# Playbooks — the process habits (Level 5)

The profile (Levels 1–2) governs how the agent *communicates and decides* on any single turn. These
playbooks govern how *you run the work* across turns and sessions — the habits that separate a good
setup from an elite one. Each is one page and optional; adopt them one at a time.

| Playbook | When you reach for it | The core move |
|---|---|---|
| [`planning.md`](planning.md) | Deciding what to work on | 🧭 Compass says NO · 🔭 Explore · ⚙️ Execute · 🔁 tight loops + stop-rule |
| [`feature-workflow.md`](feature-workflow.md) | Building something non-trivial | Two modes; **plan → research → implement** (not research-first) |
| [`session-kickoff.md`](session-kickoff.md) | Starting a work session | Paste a lean kickoff: read-first, what-not-to-break, prove-it, first action |
| [`handoff.md`](handoff.md) | Stopping / running low on context | A "resume here" snapshot, refreshed in the same commit as the change |
| [`nested-context.md`](nested-context.md) | Codebase the agent keeps mis-navigating | Folder-local rule files, auto-loaded where the work happens |
| [`crash-resilience.md`](crash-resilience.md) | Heavy/long sessions that might get cut off | Session log first · commit docs early · record run-IDs + resume commands at launch |
| [`maintenance-rot.md`](maintenance-rot.md) | Setup older than a model release | ROT ledger with per-layer review dates · scheduled prune pass · dated corrections |
| [`proof-discipline.md`](proof-discipline.md) | Long builds where "looks right" ≠ "is right" | Binary gates + pasted evidence · red-first + chaos-proofs · pins/ratchets · refuter-verified audits · dev-seam verification |

**Where these sit:** Level 5 in [`../SETUP-LEVELS.md`](../SETUP-LEVELS.md). They assume you already have
Levels 1–2 (a profile + enforcement); memory (Level 3) and the commit gate (Level 4) make them sharper
but aren't required.

**Adopt slowly.** Picking up one habit and actually using it beats reading all seven once. Start with
whichever pain is loudest right now — usually `session-kickoff` (misaligned starts) or `handoff` (losing
context between sessions).
