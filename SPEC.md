# agent-harness (formerly agent-work-ethic) — v1 design spec

> **One line:** A drop-in kit that gives any AI agent (Claude Code, Cursor, Codex) the work ethic of a
> disciplined senior — for coding *or* general knowledge work — and lets each person *tune it to
> themselves* — grounded in **Universal Design for Learning (UDL)** so it serves the full range of
> human minds, not just one.

Status: **design approved, not yet built.** This spec is the build contract for v1. The paste-ready
kickoff lives in `RESUME_HERE.md`.

---

## 1. Why this exists

Two real problems, one repo:

1. **Bootstrap gap.** When you start a *new* project, the agent has no memory of how you work — none
   of your hard-won rules (decide-and-flag, self-review, lead-with-outcome). You re-explain yourself
   every time. This kit is a 2-command drop-in that installs your work ethic into any fresh repo.
2. **Everyone-else gap.** A stranger doesn't want *your* personal rules — they want *their own*
   discipline, fitted to *their* mind. So the kit ships a short **interview** that generates each
   person's tuned profile. The personalization is the moat: existing rule-packs are static and
   generic; this one adapts.

### What's already out there (and why this is different)

| Existing | What it is | Gap this fills |
|---|---|---|
| `agent-rules-books`, `agent-style` | Code-style / output conventions (Clean Code, DDD, "write like a pro") | Those govern the *code*. This governs how the agent *thinks, decides, and communicates*. |
| `dwarvesf/claude-guardrails`, `*/claude-code-guardrails` | Shell hooks that *block* bad behavior (edit loops, skipped verification) | That's only the *enforcement* half. No work-ethic / collaboration content, not person-tunable. |
| `awesome-claude-code-*` toolkits | Kitchen-sink collections | No coherent operating philosophy; nothing about UDL or personalization. |

**Nothing public combines: a work-ethic profile + person-tuning + enforcement + UDL backbone.** That
is the whole bet.

---

## 2. The UDL backbone (the spine, not the surface)

**UDL = Universal Design for Learning** — a framework from CAST (Guidelines 3.0, released 2024-07-30)
for designing so the *widest range* of minds succeed by default instead of retrofitting
accommodations. It grew directly out of the **curb-cut effect**: ramps built for wheelchairs ended up
helping everyone. Designing for the margin (e.g. ADD) raises the floor for *everyone*.

UDL's three principles, and the work-ethic rules that map onto each:

| UDL principle | Plain meaning | Work-ethic rules under it |
|---|---|---|
| **Engagement** (*the why* — motivation, self-regulation) | Reduce overwhelm; sustain effort | upfront time estimates · one clear next action · decide-and-flag (less decision fatigue) · bounded improvement / stop-at-churn |
| **Representation** (*the what* — info in multiple forms, plain language) | Don't force one reading path | lead-with-outcome + scannable · define jargon inline · chunked/numbered · tables/examples |
| **Action & Expression** (*the how* — multiple paths, executive-function scaffolding) | Multiple ways to act + verify | numbered steps + plain-English VERIFY · self-review / evidence-not-assertion · red-team-own-decisions · multiple use-paths (copy vs interview vs fork) |

UDL 3.0 also added the **"who" of learning** — identity, belonging, agency. We honor that via the
*personalization* layer (the profile is yours, not imposed).

**Framing note (load-bearing, do not get this wrong):** UDL designs instruction for *human* learners.
The agent does **not** "learn via UDL" across sessions — it follows in-context instructions. So the
honest framing is: **the agent *applies* UDL when it communicates with and scaffolds for the human,
and the repo itself is *designed* with UDL.** Never frame it as "teaching the model."

**Anti-jargon rule:** UDL is the *invisible* backbone. Organize content by it, define it once in plain
English, then get out of the way. Do NOT make users learn 30 UDL checkpoints. The repo must practice
the low-cognitive-load principle it preaches.

---

## 3. The 7 work-ethic dimensions (the content)

The profile encodes these *universal* principles. They are **domain-general** — they govern how the
agent thinks, decides, and communicates, so they apply to coding *and* to general knowledge work
(writing, research, planning, analysis). Personal specifics (a user's ADHD, skill gaps, domain) are
**blank tuning slots** the interview fills — they are NOT hard-coded — though a ready-made archetype may
pre-fill them as a convenient starting point (see `profile/ready-made/`).

1. **Communication contract** — lead with the outcome; define jargon inline; numbered steps each with
   a plain-English VERIFY; upfront time estimates. *(UDL: Representation + Engagement)*
2. **Decision authority** — decide-and-flag: act, then log decision + why + a one-line veto note;
   reserve questions for destructive ops / money / irreversible invariants. *(UDL: Engagement)*
3. **Quality bar** — honest graded verdicts, never rubber-stamp, proper fix over stopgap.
4. **Self-review & verification** — evidence not assertion; drive correctness to zero; verify before
   claiming "done." *(UDL: Action & Expression — executive function)*
5. **Critical thinking** — red-team your own pick; steelman the alternative; check dependency ordering
   (if A needs B good first, B comes first). *(UDL: Action & Expression)*
6. **Anti-perfectionism** — bounded improvement; stop at churn. (The rare, mature one — most
   discipline guides only push *more* rigor.) *(UDL: Engagement — self-regulation)*
7. **Research discipline** — ground claims in real sources + practitioner reviews, not memory alone.

---

## 4. v1 file structure (build this)

```
agent-harness/
├── README.md                 # pitch + 60-sec quickstart + plain-English UDL explainer + curb-cut framing
├── profile/
│   ├── reference.md          # THE SEED: a complete, filled-in profile (generalized), all 7 dims under the 3 UDL principles
│   └── TEMPLATE.md           # blank profile with the tuning slots marked, for hand-editing
├── generate-your-profile.md  # THE INTERVIEW: paste-into-any-agent prompt; ~8 questions → emits the user's tuned profile
├── hooks/
│   ├── ship-bar.sh           # UserPromptSubmit hook: re-injects the standing contract every turn (advice alone gets ignored)
│   ├── settings-snippet.json # the .claude/settings.json block that wires the hook
│   ├── CLAUDE.md.template    # profile rendered as Claude Code instructions (drop-in)
│   └── AGENTS.md.template    # same profile as the cross-tool AGENTS.md standard (Cursor / Codex / Copilot)
└── INSTALL.md                # 2-command global setup (~/.claude) + per-project setup
```

### 4.1 `profile/reference.md` — the seed
A complete worked example: every one of the 7 dimensions written out, grouped under the 3 UDL
principles, with a short "why this helps everyone (curb-cut)" line each. Personal specifics abstracted
to slots like `{your biggest weak spot the agent should compensate for}`. This is the *teaching*
artifact — a stranger reads it and immediately gets what a good profile looks like.

### 4.2 `generate-your-profile.md` — the interview (the moat)
A prompt the user pastes into Claude/any agent. It asks ~8 questions, ONE AT A TIME, then emits a
filled `reference.md`-shaped profile. Draft questions (map to UDL in parentheses):
1. How do you best take in information — terse headlines, full detail, visual/tables? *(Representation)*
2. What's the one weak spot you want the agent to actively compensate for — verification, scope
   creep, follow-through, overthinking? *(Action & Expression)*
3. How much jargon is OK, and should it always define terms? *(Representation)*
4. How much should the agent decide on its own vs. ask you first? Risk tolerance? *(Engagement)*
5. Quality-vs-speed bias — when should it stop polishing and ship? *(Engagement)*
6. Your domain + skill level, so it calibrates explanations (expert vs. learning)? *(Representation)*
7. Do you want evidence pasted and an explicit VERIFY step every time? *(Action & Expression)*
8. What keeps you motivated / what derails you — time estimates, one next action, streaks? *(Engagement)*

### 4.3 `hooks/` — the enforcement
Markdown advice gets ignored; a hook does not. `ship-bar.sh` is a `UserPromptSubmit` hook that
re-injects the profile's standing contract on every turn (modeled on the proven ship-bar pattern).
`CLAUDE.md.template` / `AGENTS.md.template` are the portable drop-ins for tools without hooks.

### 4.4 `INSTALL.md`
- **Global (every project):** copy `CLAUDE.md.template` → `~/.claude/CLAUDE.md`, wire the hook via
  `settings-snippet.json`. Two commands.
- **Per-project:** copy the template into the repo root; commit it.
- **Other tools:** drop `AGENTS.md.template` → `AGENTS.md`.

---

## 5. Measurable "Done" for v1

- [ ] All files in §4 exist and are non-placeholder.
- [ ] `reference.md` covers **all 7 dimensions**, each filed under one of the **3 UDL principles**,
      each with a one-line plain-English "why it helps everyone."
- [ ] `generate-your-profile.md` asks the **8 questions one at a time** and specifies the exact output
      format (a filled profile).
- [ ] `INSTALL.md` gives a **2-command global setup** and a per-project setup, both copy-paste-ready.
- [ ] **Behavior test (the real proof):** open a fresh Claude session, paste the seed profile, give it
      a trivial task ("rename a variable") → it responds with lead-with-outcome + a numbered VERIFY
      step + a time estimate. If the work ethic doesn't change behavior, v1 failed.
- [ ] `README.md` explains UDL in plain English (jargon defined), states the curb-cut framing, and
      the honest "agent applies UDL, it doesn't learn via UDL" note.
- [ ] No *author-personal* content in the repo — no real name, private skill rubric, other project
      names, or first-person medical disclosure. (Generalized, UDL-framed archetypes *designed around*
      a trait — e.g. `profile/ready-made/adhd-friendly.md` — ARE welcome: they're shareable design
      targets that help everyone, not personal disclosures. This is the 2026-07 policy update.)

---

## 6. Out of scope for v1 (YAGNI)

- A CLI / installer binary (manual copy is fine for v1).
- A website / landing page.
- Tool adapters beyond CLAUDE.md + AGENTS.md.
- Profile versioning / diffing / telemetry.
- Publishing to GitHub — that's a deliberate human step (it's public + identity-tied), see §7.

---

## 7. Privacy & publishing

- **Publish generalized, shareable content only.** Ready-made archetypes *designed around* a trait
  (e.g. `ready-made/adhd-friendly.md`) are fine and encouraged — framed via UDL as design targets that
  raise the floor for everyone (curb-cut), written in the neutral second person, **not** as the
  author's own disclosure. What still stays out: the author's real name, private skill rubric, other
  project names, and any first-person "I have X" medical statement. (Policy updated 2026-07: earlier
  drafts excluded ADD *entirely*; naming ADHD as an openly-designed-for audience is now in scope.)
- Creating the GitHub remote + pushing (making it public + indexed) is a **deliberate decision**, not
  automated — once public it ties to the author's public identity and may be cached even if deleted.

---

## 8. Evolution beyond v1 (tiered setup)

v1 shipped the profile + interview + hook + drop-in templates. The kit then grew as **optional,
self-contained levels** (see [`SETUP-LEVELS.md`](SETUP-LEVELS.md)) rather than a bigger monolith —
because the product *is* low cognitive load, so "add everything" would betray it. The design rule:
**each level must not make Level 1 harder to understand.**

- **v2 (2026-07):** general-use reframe (coding *or* knowledge work) + `profile/ready-made/` archetypes
  (openly UDL-designed, e.g. `adhd-friendly.md`).
- **v3 (2026-07):** `SETUP-LEVELS.md` on-ramp (Levels 1–5) + `memory/` (Level 3 — file-based continuity
  across sessions, a convention the profile wires the agent to follow).
- **v4 (2026-07):** completed the ladder — `commit-gate/` (Level 4, "done = green" pre-commit template),
  `playbooks/` (Level 5 — planning, feature-workflow, session-kickoff, handoff, nested-context), a
  one-command `install.sh` (Levels 1–2, safe + idempotent, end-to-end tested against a throwaway HOME),
  and two more archetypes (`beginner`, `senior-fast-shipper`). Each held to the one-page / one-command
  bar. Playbooks were distilled from real process docs and **generalized** — no author/project specifics.
- **v4.1 (2026-07):** +3 playbooks — `crash-resilience` (survive context/usage cut-offs), `maintenance-rot`
  (a rot ledger + prune pass), `proof-discipline` (binary gates + pasted evidence for long builds).
- **v4.2 (2026-07):** +2 playbooks — `divergent-thinking` (run distorted "frames" before converging on an
  open-ended fork; frames adapted from the MIT-licensed ADHD reasoning framework) and `tool-triage`
  (before adopting any tool: overlap → the one novel nugget → standing cost; take the idea, skip the
  sprawl). Same one-page / generalized bar; brittle playbook counts elsewhere made count-proof.
- **v4.3 (2026-07):** +`decision-hygiene` playbook — for a consequential, hard-to-reverse choice:
  steelman the alternative → red-team your own pick → check ordering → show both. Pairs with
  `proof-discipline` (verify you did it right) and `planning`'s stop-rule (when to abandon it).
- **v5 (2026-09):** renamed **`agent-harness`** — the levels were always "the harness around the agent",
  and the new level is a literal one. +`harness/` (Level 6, coding projects): a zero-dependency
  **chaos-plant runner** (plants as committed data, count-pinned, green-baseline, red only on a failed
  test, byte-identical restore, `--check` for pre-commit) and the **`measure-refute`** Claude Code
  workflow (read-only measure → adversarial refute, fail-closed accounting). 24 tests; each of the
  runner's 10 guards chaos-proofed. Install identifiers (the profile marker, `~/.claude/hooks/agent-work-ethic/`)
  deliberately kept, so re-running `install.sh` over an old install cannot double-install.

## 9. Sources

- CAST — UDL Guidelines 3.0 (released 2024-07-30): https://udlguidelines.cast.org/ and
  https://udlguidelines.cast.org/more/about-guidelines-3-0/
- Curb-cut effect → universal design: https://en.wikipedia.org/wiki/Curb_cut_effect
- Prior art compared: `mattpocock/agent-rules-books`, `yzhao062/agent-style`,
  `dwarvesf/claude-guardrails`, `rohitg00/awesome-claude-code-toolkit`.
