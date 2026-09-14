// THE PURE HALF OF THE CHAOS RUNNER — every judgement it makes, with no I/O.
//
// Split out because the gate has to be gated too: the runner mutates source, so a test
// cannot import it without running it. These functions carry every decision that could
// be wrong in a way that makes a broken plant look like a caught one, and
// `chaosLib.test.mjs` pins each of them.

const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

/**
 * Summary parsers, keyed by name. Only formats checked against REAL runner output ship as
 * presets; anything else is configured as `{ failed: '<regex>', passed: '<regex>' }`, each
 * with one capture group. Guessing a format and shipping it as a preset would be the exact
 * unverified claim this tool exists to catch.
 */
export const SUMMARY_PRESETS = {
  // `Tests  2 failed | 5 passed (7)` — read off the `Tests` LINE only, so a test name or a
  // stack trace containing "1 failed" cannot feed the gate a number.
  vitest(out) {
    const line = /^\s*Tests\s+(.*)$/m.exec(out)?.[1]
    if (line === undefined) return { failed: null, passed: null }
    return { failed: num(/(\d+)\s+failed/.exec(line)), passed: num(/(\d+)\s+passed/.exec(line)) }
  },
  // node:test — the spec reporter (`ℹ fail 1`) and the TAP reporter (`# fail 1`).
  node(out) {
    return {
      failed: num(/^(?:ℹ|#) fail (\d+)\s*$/m.exec(out)),
      passed: num(/^(?:ℹ|#) pass (\d+)\s*$/m.exec(out)),
    }
  },
}

function num(match) {
  return match === null || match === undefined ? null : Number(match[1])
}

/** The counts a run reported, or `null` where it reported none. ANSI colour is stripped first. */
export function testCounts(summary, out) {
  const clean = out.replace(ANSI, '')
  if (typeof summary === 'string') {
    const preset = SUMMARY_PRESETS[summary]
    if (preset === undefined) throw new Error(`unknown summary preset '${summary}' (known: ${Object.keys(SUMMARY_PRESETS).join(', ')})`)
    return preset(clean)
  }
  return {
    failed: num(new RegExp(summary.failed, 'm').exec(clean)),
    passed: num(new RegExp(summary.passed, 'm').exec(clean)),
  }
}

/**
 * How one planted run reads.
 *  · `red`          — at least one test FAILED. The only passing outcome for a plant.
 *  · `green`        — the run passed: nothing covers the guard. A MISSING TEST.
 *  · `inconclusive` — non-zero exit with no failed test reported: usually a plant that broke
 *                     the build, which proves nothing about the test meant to catch it.
 * "Any non-zero exit is red" is the tempting rule, and it counts a broken compile as a catch.
 */
export function classify(summary, code, out) {
  const { failed } = testCounts(summary, out)
  if (failed !== null && failed > 0) return 'red'
  if (code === 0) return 'green'
  return 'inconclusive'
}

/**
 * Is an UNPLANTED run green enough to judge plants against? Without this, a test file that
 * is already failing hands a free RED to every plant aimed at it. Green = a clean exit, no
 * failures, and a pass count above zero — a run that collected NO tests also exits 0.
 */
export function baselineIsGreen(summary, code, out) {
  const { failed, passed } = testCounts(summary, out)
  return code === 0 && (failed === null || failed === 0) && passed !== null && passed > 0
}

export function countOccurrences(haystack, needle) {
  return haystack.split(needle).length - 1
}

/**
 * `text` with the plant applied. Throws unless the anchor occurs EXACTLY ONCE — zero means the
 * source moved under the plant, two means it is ambiguous — and throws if the substitution
 * changes nothing: a plant that does not mutate proves nothing.
 */
export function applyPlant(text, plant) {
  const occurrences = countOccurrences(text, plant.find)
  if (occurrences !== 1) {
    throw new Error(`anchor occurs ${occurrences}× in ${plant.file}, expected exactly 1 — re-anchor the plant`)
  }
  const mutated = text.replace(plant.find, () => plant.replace)
  if (mutated === text) throw new Error(`the substitution left ${plant.file} unchanged`)
  return mutated
}

/**
 * Validate one exported plant. A plant file exporting garbage must not shrink the gate quietly.
 * `replace` alone may be empty — deleting a guard outright is a legitimate plant.
 */
export function validatePlant(raw, where) {
  if (typeof raw !== 'object' || raw === null) throw new Error(`${where}: plant is not an object`)
  const str = (key) => {
    const v = raw[key]
    if (typeof v !== 'string' || v.length === 0) throw new Error(`${where}: '${key}' must be a non-empty string`)
    return v
  }
  if (!Array.isArray(raw.tests) || raw.tests.length === 0 || raw.tests.some((t) => typeof t !== 'string' || t.length === 0)) {
    throw new Error(`${where}: 'tests' must be a non-empty array of non-empty strings`)
  }
  if (typeof raw.replace !== 'string') throw new Error(`${where}: 'replace' must be a string`)
  const plant = { name: str('name'), file: str('file'), find: str('find'), replace: raw.replace, tests: [...raw.tests], note: str('note') }
  if (plant.find === plant.replace) throw new Error(`${where} (${plant.name}): 'find' and 'replace' are identical`)
  return plant
}

/** Validate `chaos.config.json`. Every field is required: a default here would be a silent gate. */
export function validateConfig(raw) {
  if (typeof raw !== 'object' || raw === null) throw new Error('chaos.config.json: not an object')
  const { plantsDir, expectedTotal, testCommand, summary } = raw
  if (typeof plantsDir !== 'string' || plantsDir.length === 0) throw new Error("chaos.config.json: 'plantsDir' must be a non-empty string")
  if (!Number.isInteger(expectedTotal) || expectedTotal < 1) throw new Error("chaos.config.json: 'expectedTotal' must be a positive integer — it is the count the gate may never silently drop below")
  if (!Array.isArray(testCommand) || testCommand.length === 0 || testCommand.some((t) => typeof t !== 'string')) {
    throw new Error("chaos.config.json: 'testCommand' must be a non-empty array of strings, e.g. [\"npx\", \"vitest\", \"run\"]")
  }
  if (typeof summary === 'string') {
    if (!(summary in SUMMARY_PRESETS)) throw new Error(`chaos.config.json: unknown summary preset '${summary}' (known: ${Object.keys(SUMMARY_PRESETS).join(', ')})`)
  } else if (typeof summary !== 'object' || summary === null || typeof summary.failed !== 'string' || typeof summary.passed !== 'string') {
    throw new Error("chaos.config.json: 'summary' must be a preset name or { \"failed\": \"<regex>\", \"passed\": \"<regex>\" }")
  }
  return { plantsDir, expectedTotal, testCommand, summary }
}
