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
and committed. The runner applies each plant, runs the tests it names, requires a **failed test**,
and puts the file back byte-for-byte. A plant that stays green is a missing test.

**Needs:** Node 22+ (the suite passes on 22.23, 24.20 and 26.8) and a git repo with the files you plant into committed. No dependencies.

1. **Vendor the runner.** Copy [`chaos/chaos.mjs`](chaos/chaos.mjs) **and**
   [`chaos/chaosLib.mjs`](chaos/chaosLib.mjs) (the runner imports it) into your repo — say
   `scripts/chaos/` — and commit both.
2. **Configure.** Copy [`chaos/chaos.config.example.json`](chaos/chaos.config.example.json) to your
   project root as `chaos.config.json`. Run the gate from the directory that holds it.

   | key | what it is |
   |---|---|
   | `plantsDir` | the folder of `*.plants.mjs` files, relative to that directory; top level only. Use its own folder (`chaos/`): under `test/`, `node --test` would run plant files as tests |
   | `expectedTotal` | the exact number of plants. The gate refuses to start when it drifts |
   | `testCommand` | an argv array. Each plant's `tests` are **appended**, so it must run only the files it is given: `["npx", "vitest", "run"]`, `["node", "--test"]` |
   | `summary` | `"vitest"`, `"node"` (node:test), or two regexes whose last match is read, e.g. for Jest (checked on 30.5.0): `{ "failed": "^Tests:.*?(\\d+) failed", "passed": "^Tests:.*?(\\d+) passed" }` |
3. **Write plants**, one per guard, in the format of [`chaos/example.plants.mjs`](chaos/example.plants.mjs).
4. **The gate**, before you call a feature done: `node scripts/chaos/chaos.mjs`
5. **Pre-commit**, the half that never mutates or runs a test: set
   `CHAOS_CHECK_CMD="node scripts/chaos/chaos.mjs --check"` in the
   [Level 4 hook](../commit-gate/pre-commit.template). It pins the count and resolves every anchor, so
   a plant that rotted fails the commit that rotted it. **Never put the full gate in a hook** — it
   rewrites source.

| verdict | means | do |
|---|---|---|
| `RED` | a non-zero exit, a failed test, and as many tests as the unplanted run | nothing — this is the pass |
| `STAYED-GREEN` | a clean exit with no failed test: nothing covers this guard | write the missing test; never weaken the plant |
| `INCONCLUSIVE` | anything else — the build broke, a test file stopped loading, a "failure" at exit 0, a timeout | fix the plant |

Every verdict prints the summary line it read and the failing tests' names.

**It refuses to start, touching nothing,** when an option is unknown · the plant count drifted · an
anchor does not occur exactly once, a test file is missing, or a target is untracked, a symlink or
the wrong letter case · a target has uncommitted work · the lock `.git/chaos` exists (a live run, or
a dead one — it holds the originals of whatever was planted) · the unplanted tests aren't green,
including when the summary parser matched nothing. **Mid-run** it stops if a test run changes
`git status` anywhere, and Ctrl-C, SIGTERM and SIGHUP stop the tests, restore, and exit. A name
filter (`node chaos.mjs refund`) is a debugging aid and exits 2, never 0.

⚠️ **Known limits.** node:test counts a test file that fails to *load* as one failed test: the
test-total check turns that into `INCONCLUSIVE` for a file with two or more tests, but a file with
exactly one reads `RED` (a test pins this). A flaky test can hand a plant a false `RED` — the report
names the test that failed, so look. SIGKILL cannot be caught: the file stays planted and its
original stays in `.git/chaos`, which makes the next run refuse until you put it back.

## Tool 2 — the read-only fan-out: [`workflows/measure-refute.js`](workflows/measure-refute.js)

A Claude Code workflow: one agent **measures** each unit (reads it first-hand, quotes evidence), then
one adversarial agent per **lens** tries to **refute** that measurement. Agents are instructed to
write nothing — the prompt is the only thing enforcing it.

```bash
# from this repo's root — `-sfn` makes it safe to re-run
mkdir -p ~/.claude/workflows && ln -sfn "$PWD/harness/workflows/measure-refute.js" ~/.claude/workflows/measure-refute.js
test -e ~/.claude/workflows/measure-refute.js && echo installed   # a dangling link fails here
```

Start a new Claude Code session, then in any project. (A session loads each named workflow's *content*
when it starts and keeps running that copy even if you edit the file — test an edit with
`Workflow({ scriptPath: '<path>/measure-refute.js', args })`, or from a new session.)

```js
Workflow({ name: 'measure-refute', args: {
  goal:   'the payment module against docs/SPEC.md §4',
  units:  [{ name: 'refunds', read: ['src/pay/refund.ts', 'docs/SPEC.md'], focus: 'partial refunds' }],
  lenses: [{ key: 'spec',  ask: 'Does every rule in §4 have code that enforces it?' },
           { key: 'tests', ask: 'Which of those rules does no test assert?' }],
} })
```

The accounting is the point, and it is tested code rather than a prompt: a dead or throwing agent
stays in the result by unit and lens as `UNMEASURED` / `UNVERIFIED`; only an exact `CLEAN`,
`CORRECTED` or `FATAL` counts as live; a run with ANY dead agent returns `status: 'UNVERIFIED'` and
`fatalCount: null` — never the `0` a clean run returns. Malformed args (units as plain strings, a lens
with no `ask`) spawn no agent at all and say what is wrong.

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

## Why these exist — measured

- On the long build these came from, a citation gate reported **0 failures** over **4** hand-verified
  wrong citations. Closing its three holes (rule 3) raised **82** failures on the same tree.
- A fan-out's first real run lost **8 of 8** verifiers to a usage limit and still returned
  `fatalCount: 0`.
- Adjudicating **68** agent findings: all **534** cited commands re-ran and matched — and two agents'
  fixes for the same lines were both wrong anyway.
- **This level, before it was published:** three adversarial reviewers raised **41** findings (some by more than
  one reviewer), **11** rated major. Among them: a test that merely *logged* `# fail 1` scored `RED` at exit 0;
  Ctrl-C was ignored mid-run; units passed as plain strings came back `VERIFIED` with `fatalCount: 0`.
  Each was reproduced, pinned by a test that failed on the old code, and fixed — except flaky-test
  detection, which is documented above instead.

**Check it yourself:** `node --test 'harness/**/*.test.mjs'` — 43 tests. Then the harness's own
plants, each disarming one of its guards: `cd harness && node chaos/chaos.mjs` — 33 plants, all RED.
