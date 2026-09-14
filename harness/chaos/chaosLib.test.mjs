// Pins every judgement in chaosLib.mjs. Zero dependencies:  node --test 'harness/**/*.test.mjs'
// Fixtures marked CAPTURED are verbatim runner output (version named); HAND-BUILT ones say so.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { applyPlant, baselineIsGreen, classify, countOccurrences, failingTestLines, parseArgs, testCounts, validateConfig, validatePlant } from './chaosLib.mjs'

// CAPTURED — vitest 4.1.10 stdout, two files (Start/Duration lines dropped). Neither the first
// per-file count (1 failed) nor the test name (7 failed) is the summary (3 failed).
const VITEST_RED = ' RUN  v4.1.10 /tmp/v\n\n ❯ a.test.mjs (2 tests | 1 failed) 5ms\n   × a2 with 7 failed in it 3ms\n ❯ b.test.mjs (3 tests | 2 failed) 5ms\n   × b1 4ms\n   × b2 0ms\n\n Test Files  2 failed (2)\n      Tests  3 failed | 2 passed (5)\n\n'
// CAPTURED — vitest 4.1.10, a test file with a syntax error.
const VITEST_NO_TESTS = ' ❯ syntax.test.mjs (0 test)\n\n Test Files  1 failed (1)\n      Tests  no tests\n'
// CAPTURED — vitest 4.1.10.
const VITEST_GREEN = ' Test Files  1 passed (1)\n      Tests  1 passed | 1 skipped (2)\n'
// CAPTURED — Node 26.8.1 spec reporter.
const NODE_SPEC_RED = '✖ floors (0.858625ms)\nℹ tests 2\nℹ suites 0\nℹ pass 1\nℹ fail 1\nℹ cancelled 0\nℹ skipped 0\nℹ todo 0\n✖ failing tests:\n✖ floors (0.858625ms)\n'
const NODE_SPEC_GREEN = 'ℹ tests 2\nℹ suites 0\nℹ pass 2\nℹ fail 0\n'
// CAPTURED — Node 26.8.1 TAP reporter.
const NODE_TAP_RED = 'not ok 1 - floors\n# tests 2\n# pass 1\n# fail 1\n'
// CAPTURED — Node 26.8.1: a passing test that LOGS a TAP-looking line, exit 0. The real summary is last.
const NODE_LIAR = '# fail 1\n✔ liar (0.652667ms)\nℹ tests 1\nℹ suites 0\nℹ pass 1\nℹ fail 0\n'
// CAPTURED — Node 26.8.1: a 2-test file that throws while loading counts as ONE failed test.
const NODE_LOAD_FAILURE = 'ℹ tests 1\nℹ pass 0\nℹ fail 1\n'
// CAPTURED — Jest 30.5.0, stderr (Jest prints nothing on stdout). `Test Suites:` precedes `Tests:`.
const JEST_RED = 'FAIL ./red.test.js\n  ● name: 9 passed\n\nTest Suites: 1 failed, 1 total\nTests:       1 failed, 1 passed, 2 total\nSnapshots:   0 total\n'
const JEST = { failed: '^Tests:.*?(\\d+) failed', passed: '^Tests:.*?(\\d+) passed' }

test('vitest: counts come off the LAST Tests line, never a per-file count, a test name or the Test Files line', () => {
  assert.deepEqual(pick(testCounts('vitest', VITEST_RED)), { failed: 3, passed: 2 })
  assert.deepEqual(pick(testCounts('vitest', VITEST_GREEN)), { failed: null, passed: 1 })
  assert.deepEqual(pick(testCounts('vitest', VITEST_NO_TESTS)), { failed: null, passed: null })
  assert.equal(testCounts('vitest', VITEST_RED).evidence, 'Tests  3 failed | 2 passed (5)')
})

test('ANSI colour is stripped before parsing (HAND-BUILT: escapes around the word Tests itself)', () => {
  const e = String.fromCharCode(27)
  const coloured = `      ${e}[2mTests${e}[22m  ${e}[31m3 failed${e}[39m | ${e}[32m2 passed${e}[39m (5)\n`
  assert.deepEqual(pick(testCounts('vitest', coloured)), { failed: 3, passed: 2 })
})

test('node:test: spec and TAP reporters, and the LAST summary wins over a test that logs "# fail 1"', () => {
  assert.deepEqual(pick(testCounts('node', NODE_SPEC_RED)), { failed: 1, passed: 1 })
  assert.deepEqual(pick(testCounts('node', NODE_SPEC_GREEN)), { failed: 0, passed: 2 })
  assert.deepEqual(pick(testCounts('node', NODE_TAP_RED)), { failed: 1, passed: 1 })
  assert.deepEqual(pick(testCounts('node', NODE_LIAR)), { failed: 0, passed: 1 })
  assert.equal(testCounts('node', NODE_SPEC_RED).evidence, 'ℹ fail 1 · ℹ pass 1')
})

test('a custom summary is two regexes (last match each) — Jest, anchored to its Tests: line', () => {
  assert.deepEqual(pick(testCounts(JEST, JEST_RED)), { failed: 1, passed: 1 })
  assert.deepEqual(pick(testCounts(JEST, 'Test Suites: 1 passed, 1 total\nTests:       2 passed, 2 total\n')), { failed: null, passed: 2 })
})

test('classify: RED needs a non-zero exit AND a failed test AND the baseline test total', () => {
  assert.equal(classify('vitest', 1, VITEST_RED, 5), 'red')
  assert.equal(classify('node', 1, NODE_SPEC_RED, 2), 'red')
  assert.equal(classify('vitest', 0, VITEST_GREEN, 1), 'green')
  assert.equal(classify('node', 0, NODE_SPEC_GREEN, 2), 'green') // `fail 0` is a count, not a failure
  assert.equal(classify('vitest', 1, VITEST_NO_TESTS, 2), 'inconclusive') // broke the build: proves nothing
  assert.equal(classify('node', 0, NODE_SPEC_RED, 2), 'inconclusive') // a "failure" with a clean exit
  assert.equal(classify('node', 1, NODE_LOAD_FAILURE, 2), 'inconclusive') // the FILE failed to load, no test ran
})

test('baseline: green needs a clean exit, no failures AND a pass count above zero', () => {
  assert.equal(baselineIsGreen('vitest', 0, VITEST_GREEN), true)
  assert.equal(baselineIsGreen('node', 0, NODE_SPEC_GREEN), true)
  assert.equal(baselineIsGreen('vitest', 1, VITEST_RED), false)
  assert.equal(baselineIsGreen('node', 0, 'ℹ tests 0\nℹ pass 0\nℹ fail 0\n'), false) // collected nothing
  assert.equal(baselineIsGreen('vitest', 0, 'no summary at all'), false) // parser matched nothing
})

test('countOccurrences counts OVERLAPPING anchors — `}\\n}` twice in `}\\n}\\n}` is ambiguous, not unique', () => {
  assert.equal(countOccurrences('aaa', 'aa'), 2)
  assert.equal(countOccurrences('  }\n}\n}\n', '}\n}'), 2)
  assert.equal(countOccurrences('abc', 'x'), 0)
})

test('applyPlant: exactly one anchor, a real mutation, and a replacement taken LITERALLY', () => {
  const plant = { file: 'f.js', find: 'if (x < 0) return 0\n', replace: '' }
  assert.equal(applyPlant('a\nif (x < 0) return 0\nb\n', plant), 'a\nb\n')
  assert.throws(() => applyPlant('nothing here', plant), /occurs 0×/)
  assert.throws(() => applyPlant('if (x < 0) return 0\nif (x < 0) return 0\n', plant), /occurs 2×/)
  assert.throws(() => applyPlant('aaa', { file: 'f.js', find: 'aa', replace: 'b' }), /occurs 2×/)
  // `$&` in a replacement string is a special pattern to String.replace; a plant must not be.
  assert.equal(applyPlant('price = 1', { file: 'f.js', find: '1', replace: '$&$&' }), 'price = $&$&')
})

test('validatePlant: garbage cannot shrink the gate, a plant may not break its own test, paths stay in the repo', () => {
  const ok = { name: 'n', file: 'src/f.js', find: 'a', replace: '', tests: ['t.test.js'], note: 'authored: x' }
  assert.deepEqual(validatePlant(ok, 'p[0]'), ok)
  assert.throws(() => validatePlant({ ...ok, tests: [] }, 'p[0]'), /tests/)
  assert.throws(() => validatePlant({ ...ok, find: '' }, 'p[0]'), /'find'/)
  assert.throws(() => validatePlant({ ...ok, replace: 'a' }, 'p[0]'), /identical/)
  assert.throws(() => validatePlant(null, 'p[0]'), /not an object/)
  assert.throws(() => validatePlant({ ...ok, tests: ['./src/f.js'] }, 'p[0]'), /its own test/)
  assert.throws(() => validatePlant({ ...ok, file: '../outside.js' }, 'p[0]'), /inside the project/)
  assert.throws(() => validatePlant({ ...ok, file: '/etc/hosts' }, 'p[0]'), /inside the project/)
})

test('validateConfig: no defaults — a missing count, an unknown parser or a broken regex is refused', () => {
  const ok = { plantsDir: 'chaos', expectedTotal: 3, testCommand: ['npx', 'vitest', 'run'], summary: 'vitest' }
  assert.deepEqual(validateConfig(ok), ok)
  assert.throws(() => validateConfig({ ...ok, expectedTotal: 0 }), /expectedTotal/)
  assert.throws(() => validateConfig({ ...ok, summary: 'jest' }), /unknown summary preset/)
  assert.throws(() => validateConfig({ ...ok, testCommand: 'npm test' }), /testCommand/)
  assert.throws(() => validateConfig({ ...ok, summary: { failed: '(\\d+ failed', passed: '(\\d+) passed' } }), /not a valid regex/)
})

test('parseArgs: an unknown flag is refused — a typo must never fall through to the mutating gate', () => {
  assert.deepEqual(parseArgs([]), { list: false, check: false, filters: [] })
  assert.deepEqual(parseArgs(['--check']), { list: false, check: true, filters: [] })
  assert.deepEqual(parseArgs(['--list', 'refund']), { list: true, check: false, filters: ['refund'] })
  for (const typo of ['--chek', '--Check', '-c', '--help', '--dry-run']) assert.throws(() => parseArgs([typo]), /unknown option/)
})

test('failingTestLines: the report names what caught a plant (node, TAP, vitest, Jest markers)', () => {
  assert.deepEqual(failingTestLines(NODE_SPEC_RED), ['✖ floors (0.858625ms)'])
  assert.deepEqual(failingTestLines(NODE_TAP_RED), ['not ok 1 - floors'])
  assert.deepEqual(failingTestLines(VITEST_RED), ['× a2 with 7 failed in it 3ms', '× b1 4ms', '× b2 0ms'])
  assert.deepEqual(failingTestLines(JEST_RED), ['● name: 9 passed'])
})

function pick({ failed, passed }) {
  return { failed, passed }
}
