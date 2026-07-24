# agent-work-ethic

**Give any AI agent the work ethic of a disciplined senior — tuned to *you*.**

Drop this into any project and your agent (Claude Code, Cursor, Codex, Copilot) stops being an eager
intern and starts working like a careful senior colleague: it leads with the answer, decides routine
things itself and flags them, verifies before claiming "done," and tells you exactly what to do next.
It works for **coding *and* general knowledge work** — writing, research, planning, analysis — because
the discipline (outcome-first, decide-and-flag, verify, one clear next step) isn't code-specific.

It's not a fixed set of rules you have to adopt. It's a small framework plus a 5-minute interview that
generates **your own** profile — fitted to how *your* mind works.

---

## Why this exists

1. **New-project bootstrap.** Every time you start a fresh repo, the agent forgets how you like to
   work. You re-explain yourself constantly. This is a 2-command drop-in that installs your working
   style into any project at once.
2. **It works for everyone.** The profile is built on **Universal Design for Learning (UDL)** — a
   framework for designing so the *widest range* of minds succeed by default (90-second explainer
   below). Designing for focus/attention differences makes the agent clearer and calmer **for
   everyone** — the same reason curb cuts built for wheelchairs ended up helping everyone with a
   stroller or suitcase.

---

## 60-second quickstart

Pick one:

- **Use the example as-is** → copy [`profile/reference.md`](profile/reference.md) into your project as
  `CLAUDE.md` (or `AGENTS.md`). Instant disciplined agent.
- **Start from a ready-made profile** → grab a pre-tuned archetype from
  [`profile/ready-made/`](profile/ready-made/) — e.g. [`adhd-friendly.md`](profile/ready-made/adhd-friendly.md),
  designed around ADHD working styles (and calmer for everyone — see the curb-cut note below).
- **Make your own (recommended)** → open [`generate-your-profile.md`](generate-your-profile.md), paste
  the prompt into any agent, answer 8 short questions, get a finished profile back.
- **Hand-edit** → fill in the blanks in [`profile/TEMPLATE.md`](profile/TEMPLATE.md).

Then make it stick: [`INSTALL.md`](INSTALL.md) wires a hook (a small script the agent runs every turn)
so the rules are *enforced*, not just suggested.

**Want the full, top-tier setup?** Follow [`SETUP-LEVELS.md`](SETUP-LEVELS.md) — five optional levels
(profile → enforced → memory → commit-gate → playbooks) you climb one at a time. It gets your *setup*
into the top few percent without drowning you on day one (and it's honest about what a repo can and
can't hand you — elite scaffolding instantly; judgment still grows with use).

---

## What's inside

```
README.md                  ← you are here
SETUP-LEVELS.md            ← the on-ramp: 5 optional levels to a top-tier setup
install.sh                 ← one command: sets up Levels 1–2 globally (safe + idempotent)
SPEC.md                    ← the design / build contract
profile/
  reference.md             ← THE EXAMPLE: a complete, filled-in profile
  TEMPLATE.md              ← blank profile with the per-person slots marked
  ready-made/              ← pre-tuned archetypes: adhd-friendly · beginner · senior-fast-shipper
generate-your-profile.md   ← THE INTERVIEW: 8 questions → your tuned profile
memory/                    ← give the agent continuity across sessions (Level 3)
  README.md                ← how the file-based memory works + the one-paste wire-in
  MEMORY.md                ← the session-start index (starts empty)
  memory-file.template.md  ← copy to record one fact
commit-gate/               ← "done = green": a pre-commit gate template (Level 4)
playbooks/                 ← process habits: planning · divergent-thinking · decision-hygiene · feature-workflow · kickoff · handoff · nested-context · crash-resilience · maintenance-rot · tool-triage · proof-discipline (Level 5)
hooks/
  ship-bar.sh              ← re-injects your standing rules every turn (enforcement)
  settings-snippet.json    ← the Claude Code settings block that wires the hook
  CLAUDE.md.template        ← profile as Claude Code instructions (drop-in)
  AGENTS.md.template        ← same profile in the cross-tool AGENTS.md format
INSTALL.md                 ← manual setup (per-project + global); install.sh automates the global path
```

---

## The UDL backbone in 90 seconds

**UDL (Universal Design for Learning)** is a framework from CAST (a nonprofit; current "Guidelines
3.0", 2024) for designing so the widest range of minds succeed — without bolting on special cases
afterward. It has three principles, and every rule in the profile is filed under one of them:

| Principle | Plain meaning | Examples in the profile |
|---|---|---|
| **Engagement** (*why*) | Keep me moving, don't overwhelm | upfront time estimates · one clear next step · decide-and-flag · stop at "good," not "perfect" |
| **Representation** (*what*) | Present info so I can absorb it | lead with the outcome · scannable chunks · define jargon inline · show an example |
| **Action & Expression** (*how*) | Give me ways to act + check the work | numbered steps with a VERIFY · evidence not assertion · red-team your own pick |

**Honest framing (matters):** UDL is about designing for *human* learners. The agent doesn't "learn
via UDL" — it can't learn across sessions. What it does is *apply* UDL when it communicates with and
scaffolds for you. So this isn't "teaching the AI"; it's "designing how the AI works *with* you."

---

## How this differs from other agent-rules repos

| Other repos | What they cover | What's missing |
|---|---|---|
| `agent-rules-books`, `agent-style` | Code/output style (Clean Code, DDD) | They govern the *code*; this governs how the agent *thinks, decides, communicates* |
| `*/claude-code-guardrails` | Hooks that *block* bad actions | Enforcement only — no work-ethic content, not tunable to you |
| `awesome-claude-code` toolkits | Big kitchen-sink lists | No coherent philosophy, no UDL, no personalization |

The combination here — **work-ethic profile + personalization + enforcement + UDL** — doesn't exist
elsewhere.

---

## Does it actually work? (illustrative)

Same trivial request, agent **without** vs **with** the profile.

**Coding:**

> **You:** "rename `foo` to `bar` in utils.js"
>
> **Without:** *"Sure! I've renamed foo to bar."*
>
> **With:** *"Done — renamed in 2 spots (~1 min). **Next:** 1) run `npm test` — VERIFY: suite stays
> green. I checked there were no other `foo` references first (grep returned 2, both updated)."*

**General knowledge work (no code):**

> **You:** "summarize this report for my boss"
>
> **Without:** *"Here's a summary: [six dense paragraphs]."*
>
> **With:** *"Bottom line: the pilot hit its target, cost ran 12% over (~2 min read below). I pulled
> every number straight from the report, not memory. **Next:** 1) skim the 3 bolded figures — VERIFY
> they match what your boss already expects; if not, tell me and I'll dig into that one."*

The difference is the work ethic: outcome first, evidence, a concrete next step with a way to confirm
it. Run the real test yourself — paste a profile into a fresh session and try a small task.

---

## License

[MIT](LICENSE) — use it, fork it, adapt it, ship it. No attribution required (a star is appreciated).
