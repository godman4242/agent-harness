# Level 6 — The harness *(coding projects)* · +30 minutes

**A bigger model notices more. A harness makes what nobody noticed *fail a gate*.** Level 4 makes
"done" mean the tests pass. Level 6 makes sure the tests, the docs and the gates themselves cannot
quietly lie. (Skip it if you're not writing code.)

It builds on [`playbooks/proof-discipline.md`](../playbooks/proof-discipline.md) — red-first tests,
chaos-proofing, pins, refuter-verified audits. Read that first; this level turns its manual moves
into two committed tools and adds the rules they earned.

---

## Tool 1 — chaos plants: [`chaos/`](chaos/)

A **plant** is a deliberate one-line break in your source — "delete this guard" — declared as data
and committed. The runner applies each plant, runs the tests it names, requires at least one
**failed test**, and puts the file back byte-for-byte. A plant that stays green is a missing test.

1. Copy [`chaos/chaos.config.example.json`](chaos/chaos.config.example.json) to your project root as
   `chaos.config.json`. `summary` is `"vitest"`, `"node"` (node:test), or two regexes for any other
   runner: `{ "failed": "Tests:\\s+(\\d+) failed", "passed": "(\\d+) passed" }`.
2. Write plants in `*.plants.mjs` files — one per guard. The format is
   [`chaos/example.plants.mjs`](chaos/example.plants.mjs).
3. **The gate** (before you call a feature done): `node <this-repo>/harness/chaos/chaos.mjs`
4. **Pre-commit** (never the full gate — it rewrites source): `node <this-repo>/harness/chaos/chaos.mjs --check`
   resolves every anchor and pins the count without touching a file.

| verdict | means | do |
|---|---|---|
| `RED` | a test caught the break | nothing — this is the pass |
| `STAYED-GREEN` | nothing covers this guard | write the missing test; never weaken the plant |
| `PLANT-FAILED` / `NO-OP` | the anchor moved, or the plant changes nothing | fix the plant |
| `INCONCLUSIVE` | non-zero exit, no failed test — usually a plant that broke the build | fix the plant |

It **refuses to start** when the plant count drifted from `expectedTotal`, a target file has
uncommitted work, backups from a crashed run exist, or the unplanted tests aren't green — including
when the summary parser matched nothing, which is how a misconfigured runner would otherwise score
every plant.

⚠️ **Known limit:** `node --test` counts a file with a *syntax error* as a failed test, so with the
`node` summary a plant that breaks the parse reads `RED`. Keep plants syntactically valid.

## Tool 2 — the read-only fan-out: [`workflows/measure-refute.js`](workflows/measure-refute.js)

A Claude Code workflow: one agent **measures** each unit (reads it first-hand, quotes evidence), then
one adversarial agent per **lens** tries to **refute** that measurement. Nothing writes.

```bash
mkdir -p ~/.claude/workflows && ln -s "$PWD/harness/workflows/measure-refute.js" ~/.claude/workflows/
# then, in any project:  Workflow({ name: 'measure-refute', args: { goal, units, lenses } })
```

The accounting is the point, and it is tested code rather than a prompt: a dead measurement is
`UNMEASURED` and never vanishes from the result; a run with ANY dead agent returns
`status: 'UNVERIFIED'` and `fatalCount: null` — never the `0` a clean run returns.

---

## The rules this level adds

1. **A script beats a swarm — then a swarm checks the script.** Whatever a loop can decide (does this
   cite resolve? does this anchor match once?) a loop decides, in pre-commit. Agents are for reading
   prose. Once a gate lands, point a read-only fan-out at the cases its rule is *weakest* on.
2. **Fan out reads, never writes.** Every write stays in one loop, and no fan-out runs while that
   loop is writing files the agents read.
3. **A gate that says "0" gets probed for false-passes before it is trusted.** The usual holes:
   evidence *unioned*, so one good item covers a bad sibling · a tolerance window (±N lines) that
   passes an off-by-one by construction · a spelling the parser never reads. Never widen a window to
   pass; an exception names its reason, fails when it goes stale, and can never also vouch.
4. **Agent evidence is re-executable — so re-execute it.** Before acting on a fan-out's findings,
   re-run every command it cites with writes blocked by the OS (on macOS, `sandbox-exec`), and read
   the source for every line you change. Two agents proposing different fixes for one line means go
   to the source, not pick one.
5. **Two copies of one value: import it, or pin the pair with a test** — and deny-list the
   coincidences (same number, different rule). A comment saying "twin" does not settle which.
6. **A probe whose parser matched nothing has not passed.** Print the matched summary line beside
   every verdict; an empty verdict is a harness bug.

## Why these exist — measured on the long build they came from

- A citation gate reported **0 failures** over **4** hand-verified wrong citations. Closing its three
  holes (above, rule 3) raised **82** failures on the same tree.
- A fan-out's first real run lost **8 of 8** verifiers to a usage limit and still returned
  `fatalCount: 0`.
- Adjudicating **68** agent findings: all **534** cited commands re-ran and matched — and two agents'
  fixes for the same lines were both wrong anyway.
- The chaos runner here: disarming each of its **10** guards turns a test red. The workflow's first
  test draft: **2 of 5** plants stayed green — both missing tests.

**Check it yourself:** `node --test harness/` — 24 tests, no dependencies.
