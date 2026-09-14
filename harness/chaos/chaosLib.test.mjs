// Pins every judgement in chaosLib.mjs. Zero dependencies:  node --test harness/
// The runner outputs below are REAL, captured from the runners named — not typed from memory.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyPlant, baselineIsGreen, classify, testCounts, validateConfig, validatePlant } from './chaosLib.mjs'

const VITEST_RED = ' ✓ tests/a.test.ts (31 tests)\n × tests/b.test.ts > name with 1 failed in it\n\n      Tests  1 failed | 31 passed (33)\n   Duration  1.2s\n'
const VITEST_GREEN = '      Tests  1629 passed (1629)\n'
const VITEST_NO_SUMMARY = 'Error: Transform failed with 1 error: Unexpected token\n'
const NODE_SPEC_RED = 'ℹ tests 2\nℹ suites 0\nℹ pass 1\nℹ fail 1\nℹ cancelled 0\n'
const NODE_SPEC_GREEN = 'ℹ tests 2\nℹ suites 0\nℹ pass 2\nℹ fail 0\n'
const NODE_TAP_RED = '# tests 2\n# suites 0\n# pass 1\n# fail 1\n'

test('vitest: counts come off the Tests LINE, never a test name that says "1 failed"', () => {
  assert.deepEqual(testCounts('vitest', VITEST_RED), { failed: 1, passed: 31 })
  assert.deepEqual(testCounts('vitest', VITEST_GREEN), { failed: null, passed: 1629 })
  assert.deepEqual(testCounts('vitest', VITEST_NO_SUMMARY), { failed: null, passed: null })
})

test('ANSI colour is stripped before parsing — an escape carries digits that break a naive pattern', () => {
  const coloured = `      Tests  [31m3 failed[39m | [32m2 passed[39m (5)\n`
  assert.deepEqual(testCounts('vitest', coloured), { failed: 3, passed: 2 })
})

test('node:test: both the spec reporter and TAP', () => {
  assert.deepEqual(testCounts('node', NODE_SPEC_RED), { failed: 1, passed: 1 })
  assert.deepEqual(testCounts('node', NODE_SPEC_GREEN), { failed: 0, passed: 2 })
  assert.deepEqual(testCounts('node', NODE_TAP_RED), { failed: 1, passed: 1 })
})

test('a custom summary is two regexes, one capture group each', () => {
  const summary = { failed: 'Tests:\\s+(\\d+) failed', passed: '(\\d+) passed' }
  assert.deepEqual(testCounts(summary, 'Tests:       2 failed, 7 passed, 9 total'), { failed: 2, passed: 7 })
})

test('classify: RED only on a failed test — a non-zero exit with no failed test is INCONCLUSIVE, not a catch', () => {
  assert.equal(classify('vitest', 1, VITEST_RED), 'red')
  assert.equal(classify('vitest', 0, VITEST_GREEN), 'green')
  assert.equal(classify('vitest', 1, VITEST_NO_SUMMARY), 'inconclusive')
  assert.equal(classify('node', 1, NODE_SPEC_RED), 'red')
  assert.equal(classify('node', 0, NODE_SPEC_GREEN), 'green') // `fail 0` is a count, not a failure
})

test('baseline: green needs a clean exit, no failures AND a pass count above zero', () => {
  assert.equal(baselineIsGreen('vitest', 0, VITEST_GREEN), true)
  assert.equal(baselineIsGreen('node', 0, NODE_SPEC_GREEN), true)
  assert.equal(baselineIsGreen('vitest', 1, VITEST_RED), false)
  assert.equal(baselineIsGreen('node', 0, 'ℹ tests 0\nℹ pass 0\nℹ fail 0\n'), false) // collected nothing
  assert.equal(baselineIsGreen('vitest', 0, 'no summary at all'), false) // parser matched nothing
})

test('applyPlant: exactly one anchor, a real mutation, and a replacement taken LITERALLY', () => {
  const plant = { file: 'f.js', find: 'if (x < 0) return 0\n', replace: '' }
  assert.equal(applyPlant('a\nif (x < 0) return 0\nb\n', plant), 'a\nb\n')
  assert.throws(() => applyPlant('nothing here', plant), /occurs 0×/)
  assert.throws(() => applyPlant('if (x < 0) return 0\nif (x < 0) return 0\n', plant), /occurs 2×/)
  // `$&` in a replacement string is a special pattern to String.replace; a plant must not be.
  assert.equal(applyPlant('price = 1', { file: 'f.js', find: '1', replace: '$&$&' }), 'price = $&$&')
})

test('validatePlant: garbage cannot shrink the gate quietly, and an empty replace is a legal deletion', () => {
  const ok = { name: 'n', file: 'f.js', find: 'a', replace: '', tests: ['t.test.js'], note: 'authored: x' }
  assert.deepEqual(validatePlant(ok, 'p[0]'), ok)
  assert.throws(() => validatePlant({ ...ok, tests: [] }, 'p[0]'), /tests/)
  assert.throws(() => validatePlant({ ...ok, find: '' }, 'p[0]'), /'find'/)
  assert.throws(() => validatePlant({ ...ok, replace: 'a' }, 'p[0]'), /identical/)
  assert.throws(() => validatePlant(null, 'p[0]'), /not an object/)
})

test('validateConfig: no defaults — a missing count or an unknown parser is refused', () => {
  const ok = { plantsDir: 'tests', expectedTotal: 3, testCommand: ['npx', 'vitest', 'run'], summary: 'vitest' }
  assert.deepEqual(validateConfig(ok), ok)
  assert.throws(() => validateConfig({ ...ok, expectedTotal: 0 }), /expectedTotal/)
  assert.throws(() => validateConfig({ ...ok, summary: 'jest' }), /unknown summary preset/)
  assert.throws(() => validateConfig({ ...ok, testCommand: 'npm test' }), /testCommand/)
})
