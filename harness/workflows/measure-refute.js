/**
 * MEASURE → REFUTE — a read-only fan-out for any codebase, with fail-closed accounting.
 *
 * One agent MEASURES each unit (reads its files first-hand and reports claims with
 * evidence); then one adversarial agent per LENS per unit tries to REFUTE that
 * measurement. Agents are INSTRUCTED to write nothing — the prompt enforces that, nothing else
 * does (they run as the default workflow subagent). The calling session owns every edit.
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
 *   · an agent that THROWS             ⇒ the same as one that died, still named by unit and lens;
 *   · a verdict that is not exactly CLEAN, CORRECTED or FATAL ⇒ not live (an allow-list, never
 *                                        "anything but UNVERIFIED");
 *   · missing or malformed args        ⇒ zero agents, status UNVERIFIED, and it says what is wrong —
 *                                        a unit passed as a plain string must not run as `undefined`.
 * `measure-refute.test.mjs` (beside this file) executes it with agents dead, throwing, malformed
 * and alive, and pins every one of these.
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

/** Every way the args can be wrong, in words. Checked before a single agent is spawned. */
function argProblems(a) {
  if (typeof a !== 'object' || a === null || Array.isArray(a)) return [`args must be an object { goal, units, lenses }, got ${Array.isArray(a) ? 'an array' : typeof a}`]
  const nonEmpty = (v) => typeof v === 'string' && v.trim().length > 0
  const problems = []
  if (!Array.isArray(a.units) || a.units.length === 0) problems.push('args.units must be a non-empty array')
  if (!Array.isArray(a.lenses) || a.lenses.length === 0) problems.push('args.lenses must be a non-empty array')
  const seen = { unit: new Set(), lens: new Set() }
  ;(Array.isArray(a.units) ? a.units : []).forEach((u, i) => {
    if (typeof u !== 'object' || u === null) return problems.push(`units[${i}] must be { name, read?, focus? }, got ${JSON.stringify(u)}`)
    if (!nonEmpty(u.name)) problems.push(`units[${i}].name must be a non-empty string`)
    else if (seen.unit.has(u.name)) problems.push(`duplicate unit name '${u.name}'`)
    else seen.unit.add(u.name)
    if (u.read !== undefined && (!Array.isArray(u.read) || !u.read.every(nonEmpty))) problems.push(`units[${i}].read must be an array of paths`)
    if (u.focus !== undefined && typeof u.focus !== 'string') problems.push(`units[${i}].focus must be a string`)
  })
  ;(Array.isArray(a.lenses) ? a.lenses : []).forEach((l, i) => {
    if (typeof l !== 'object' || l === null) return problems.push(`lenses[${i}] must be { key, ask }, got ${JSON.stringify(l)}`)
    if (!nonEmpty(l.key)) problems.push(`lenses[${i}].key must be a non-empty string`)
    else if (seen.lens.has(l.key)) problems.push(`duplicate lens key '${l.key}'`)
    else seen.lens.add(l.key)
    if (!nonEmpty(l.ask)) problems.push(`lenses[${i}].ask must be a non-empty string`)
  })
  return problems
}

const problems = argProblems(args)
if (problems.length > 0) {
  log(`measure-refute: bad args — spawned nothing: ${problems.join('; ')}`)
  return {
    status: 'UNVERIFIED',
    fatalCount: null,
    integrity: `0 agents spawned. Nothing was checked. ${problems.join('; ')}`,
    units: [],
  }
}

const cfg = args
const UNITS = cfg.units
const LENSES = cfg.lenses
const expected = UNITS.length * LENSES.length
// An ALLOW-list: a verdict is live only if it is one of these exact strings.
const LIVE = new Set(['CLEAN', 'CORRECTED', 'FATAL'])
const isLive = (v) => typeof v === 'object' && v !== null && LIVE.has(v.verdict)
const unverified = (lens, why) => ({ lens, verdict: 'UNVERIFIED', refutations: [], integrity: why })

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

// Say how big this fan-out is BEFORE it starts. Not a refusal: a cap the caller can pass is
// a cap the caller can raise, and on the one runaway this harness has on record — 28 agents,
// 1.37M tokens, 0 verified — any plausible constant would have sat above it and waved it
// through. The written rule ("a fan-out over a repo we do not already know gets <=6 agents
// with explicit file lists") is stricter than a constant, and the operator is the breaker.
// What the operator was missing is the number, before the spend.
log(`planning ${UNITS.length} units x (1 measure + ${LENSES.length} lenses) = ${UNITS.length * (1 + LENSES.length)} agent launches`)

// Why a measurement died, kept instead of discarded. The refute branch below already keeps
// its error; this one used to throw the identical class of message away 11 lines earlier —
// two copies of one rule, diverged, inside one file.
const deaths = new Map()

phase('Measure')
const results = await pipeline(
  UNITS,
  // The runtime's agent() returns null when an agent dies and THROWS in other cases (a budget
  // ceiling); both are caught here so neither can drop a unit or a lens name.
  (unit) => agent(measurePrompt(unit), { label: `measure:${unit.name}`, phase: 'Measure', schema: MEASURE_SCHEMA }).catch((err) => {
    // Record the reason, still return NULL. Returning an object here would be non-null and
    // would sail straight through the guard below as a live measurement.
    deaths.set(unit.name, err instanceof Error ? err.message : String(err))
    return null
  }),
  (measured, unit) => {
    if (typeof measured !== 'object' || measured === null) {
      return { unit: unit.name, status: 'UNMEASURED', verdicts: LENSES.map((l) => unverified(l.key, `the measure agent died: ${deaths.get(unit.name) ?? 'returned nothing'}`)) }
    }
    return parallel(
      LENSES.map((lens) => async () => {
        try {
          const v = await agent(refutePrompt(unit, lens, measured), { label: `refute:${unit.name}:${lens.key}`, phase: 'Refute', schema: VERDICT_SCHEMA })
          return isLive(v) ? { ...v, lens: lens.key } : unverified(lens.key, `the refute agent died or returned no valid verdict: ${JSON.stringify(v)}`)
        } catch (err) {
          return unverified(lens.key, `the refute agent threw: ${err instanceof Error ? err.message : String(err)}`)
        }
      }),
    ).then((verdicts) => {
      // parallel() never rejects, but it turns a thunk that threw into null — keep the lens name.
      const named = LENSES.map((l, i) => verdicts[i] ?? unverified(l.key, 'lost by parallel()'))
      return { unit: unit.name, status: named.some(isLive) ? 'VERIFIED' : 'UNVERIFIED', measured, verdicts: named }
    })
  },
)

// A null here is a unit that fell out of the run entirely — it must not look like a pass.
const byUnit = UNITS.map((u, i) => results[i] ?? { unit: u.name, status: 'UNMEASURED', verdicts: LENSES.map((l) => unverified(l.key, 'the unit fell out of the run')) })
const verdicts = byUnit.flatMap((u) => u.verdicts)
const live = verdicts.filter(isLive)
const fatal = live.filter((v) => v.verdict === 'FATAL')
const complete = live.length === expected
const measuredCount = byUnit.filter((u) => u.status !== 'UNMEASURED').length

log(`measured ${measuredCount}/${UNITS.length} · live verdicts ${live.length}/${expected} · FATAL ${fatal.length}`)

return {
  status: complete ? 'VERIFIED' : 'UNVERIFIED',
  // Null unless EVERY verdict is live: a dead run must never report the 0 a clean run reports.
  fatalCount: complete ? fatal.length : null,
  integrity: `${measuredCount}/${UNITS.length} units measured; ${live.length}/${expected} live verdicts (${LENSES.length} lenses × ${UNITS.length} units); ${fatal.length} FATAL; ${expected - live.length} UNVERIFIED. A unit or lens missing from the counts DIED — it was not clean.`,
  units: byUnit,
}
