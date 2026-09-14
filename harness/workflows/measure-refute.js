/**
 * MEASURE → REFUTE — a read-only fan-out for any codebase, with fail-closed accounting.
 *
 * One agent MEASURES each unit (reads its files first-hand and reports claims with
 * evidence); then one adversarial agent per LENS per unit tries to REFUTE that
 * measurement. Nothing writes. The calling session owns every edit.
 *
 * Install once, available in every project (a user-level workflow registers by name — and a
 * symlink registers and runs, measured), from this repo's root:
 *   mkdir -p ~/.claude/workflows && ln -s "$PWD/harness/workflows/measure-refute.js" ~/.claude/workflows/
 *
 * Invoke:
 *   Workflow({ name: 'measure-refute', args: {
 *     goal:   'the payment module against docs/SPEC.md §4',
 *     units:  [{ name: 'refunds', read: ['src/pay/refund.ts', 'docs/SPEC.md'], focus: 'partial refunds' }],
 *     lenses: [{ key: 'spec', ask: 'Does every rule in §4 have code that enforces it?' },
 *              { key: 'tests', ask: 'Which of those rules does no test assert?' }],
 *     shared: 'the migrations folder and the test-count contract',   // optional: what must never be written in parallel
 *   } })
 *
 * ─────────────────────────────────────────────────────────────────────────────────
 * THE ACCOUNTING IS THE POINT, and it is plain code so it can be tested.
 * ─────────────────────────────────────────────────────────────────────────────────
 * A DEAD agent and an agent that FOUND NOTHING both come back empty. A fan-out that
 * ignores the difference reports a clean pass over work that never ran. So:
 *   · a measure agent that dies        ⇒ the unit is UNMEASURED and its lenses UNVERIFIED —
 *                                        it never vanishes from the result;
 *   · zero live verifiers for a unit   ⇒ UNVERIFIED, never CLEAN;
 *   · ANY dead verifier in the run     ⇒ top-level status UNVERIFIED and fatalCount NULL —
 *                                        never a 0 a caller can read as clean;
 *   · no units or no lenses given      ⇒ zero agents, status UNVERIFIED, and it says why.
 * `measure-refute.test.mjs` (beside this file) executes it with every agent dead and every
 * agent alive and pins all four.
 *
 * What is NOT reproducible: two runs over the same inputs can raise different true
 * findings. Report the findings a run raises; gate only on the accounting.
 */
export const meta = {
  name: 'measure-refute',
  description: 'Read-only: measure each unit first-hand, then adversarially refute each measurement per lens, with fail-closed accounting',
  whenToUse:
    'When prose claims about code (docs, comments, a port, a spec) need checking against the source by independent readers. Pass units + lenses in args. Never for writes.',
  phases: [
    { title: 'Measure', detail: 'one read-only agent per unit' },
    { title: 'Refute', detail: 'one adversarial read-only agent per lens per unit' },
  ],
}

const cfg = args ?? {}
const UNITS = Array.isArray(cfg.units) ? cfg.units : []
const LENSES = Array.isArray(cfg.lenses) ? cfg.lenses : []
const expected = UNITS.length * LENSES.length

if (UNITS.length === 0 || LENSES.length === 0) {
  log('measure-refute: no units or no lenses in args — spawned nothing')
  return {
    status: 'UNVERIFIED',
    fatalCount: null,
    integrity: `0 agents spawned: args needs units (${UNITS.length}) and lenses (${LENSES.length}). Nothing was checked.`,
    units: [],
  }
}

const READONLY = `
⛔ READ-ONLY. Write, edit or delete NOTHING, and run no command that changes state (no git
commit/checkout/stash/add, no installs, no formatters). Read files and run read-only
commands only.

WHY: this is one of several agents reading the same codebase at once. Parallel writes to
shared state (${cfg.shared || 'shared config, indexes, test counts, handoff docs'}) is the
parallel-overwrite failure. The calling session owns every write.

EVIDENCE: every claim carries a real path and an exact quoted string you actually read.
Never carry a number forward from a doc or another agent — re-derive it with a command and
check WHICH files it counted. If you cannot verify something, say UNVERIFIED and what is
missing. A confident guess is worse than a gap.
`

const MEASURE_SCHEMA = {
  type: 'object',
  properties: {
    unit: { type: 'string' },
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          claim: { type: 'string' },
          evidence: { type: 'string', description: 'path + exact quoted text you read' },
        },
        required: ['id', 'claim', 'evidence'],
      },
    },
    counts: { type: 'string', description: 'every number, with the command that produced it' },
    integrity: { type: 'string', description: 'what you verified by command vs inferred' },
  },
  required: ['unit', 'findings', 'counts', 'integrity'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string', enum: ['CLEAN', 'CORRECTED', 'FATAL', 'UNVERIFIED'] },
    refutations: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          target: { type: 'string' },
          problem: { type: 'string' },
          evidence: { type: 'string', description: 'the command you ran and what it printed' },
          correction: { type: 'string' },
        },
        required: ['target', 'problem', 'evidence', 'correction'],
      },
    },
    integrity: { type: 'string' },
  },
  required: ['verdict', 'refutations', 'integrity'],
}

const measurePrompt = (unit) => `${READONLY}
TASK — MEASURE \`${unit.name}\`${cfg.goal ? ` for: ${cfg.goal}` : ''}.

Read first-hand, all of it: ${(unit.read ?? []).join(', ') || '(no files named — find them, and say how)'}
${unit.focus ? `Focus: ${unit.focus}` : ''}

Report findings: every claim the prose (docs, comments, spec) makes about this unit, and
whether the code bears it out — each with the quoted lines. Measurement only; propose nothing.`

const refutePrompt = (unit, lens, measured) => `${READONLY}
TASK — ADVERSARIALLY REFUTE the measurement of \`${unit.name}\` through the \`${lens.key}\` lens.

You are not summarising it; you are trying to break it. Assume it contains at least one
claim that looks true, was never checked, and is wrong.

THE LENS: ${lens.ask}

THE MEASUREMENT (JSON):
${JSON.stringify(measured, null, 2)}

HOW: for every quoted string, verify it verbatim and count occurrences. For every count,
re-derive it yourself and check which files were counted. For every "X appears nowhere" or
"nothing tests this", hunt for the counter-example — that claim is the likeliest to be wrong.

VERDICT, fail-closed: FATAL (a claim is wrong in a way that would build the wrong thing) ·
CORRECTED (claims stand but need listed fixes) · CLEAN (you RAN real checks and broke nothing)
· UNVERIFIED (you could not run the checks — NEVER return CLEAN in that case).`

phase('Measure')
const results = await pipeline(
  UNITS,
  (unit) => agent(measurePrompt(unit), { label: `measure:${unit.name}`, phase: 'Measure', schema: MEASURE_SCHEMA }),
  (measured, unit) => {
    if (!measured) {
      return {
        unit: unit.name,
        status: 'UNMEASURED',
        verdicts: LENSES.map((l) => ({ lens: l.key, verdict: 'UNVERIFIED', refutations: [], integrity: 'the measure agent returned nothing' })),
      }
    }
    return parallel(
      LENSES.map((lens) => () =>
        agent(refutePrompt(unit, lens, measured), { label: `refute:${unit.name}:${lens.key}`, phase: 'Refute', schema: VERDICT_SCHEMA })
          .then((v) => ({ lens: lens.key, ...(v ?? { verdict: 'UNVERIFIED', refutations: [], integrity: 'the refute agent died — fail-closed' }) })),
      ),
    ).then((verdicts) => ({
      unit: unit.name,
      status: verdicts.some((v) => v && v.verdict !== 'UNVERIFIED') ? 'VERIFIED' : 'UNVERIFIED',
      measured,
      verdicts,
    }))
  },
)

// A null here is a unit that fell out of the run entirely — it must not look like a pass.
const byUnit = UNITS.map((u, i) => results[i] ?? { unit: u.name, status: 'UNMEASURED', verdicts: [] })
const verdicts = byUnit.flatMap((u) => u.verdicts)
const live = verdicts.filter((v) => v && v.verdict !== 'UNVERIFIED')
const fatal = verdicts.filter((v) => v && v.verdict === 'FATAL')
const complete = live.length === expected
const measuredCount = byUnit.filter((u) => u.status !== 'UNMEASURED').length

log(`measured ${measuredCount}/${UNITS.length} · live verdicts ${live.length}/${expected} · FATAL ${fatal.length}`)

return {
  status: complete ? 'VERIFIED' : 'UNVERIFIED',
  // Null unless EVERY verdict is live: a dead run must never report the 0 a clean run reports.
  fatalCount: complete ? fatal.length : null,
  integrity: `${measuredCount}/${UNITS.length} units measured; ${live.length}/${expected} live verdicts (${LENSES.length} lenses × ${UNITS.length} units); ${fatal.length} FATAL; ${verdicts.length - live.length} UNVERIFIED. A unit or lens missing from the counts DIED — it was not clean.`,
  units: byUnit,
}
