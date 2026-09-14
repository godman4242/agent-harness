// Runs the REAL runner against throwaway git projects with node:test. Every fail-closed
// pre-flight is driven, and every run ends with the fixture checked byte-identical.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const RUNNER = new URL('./chaos.mjs', import.meta.url).pathname

const GUARD = 'export function clamp(x) {\n  if (x < 0) return 0\n  return x\n}\nexport function limit(x) {\n  if (x > 10) return 10\n  return x\n}\n'
// Every test run appends to $CHAOS_E2E_MARK, so "nothing ran" is measured, not inferred from output.
const MARK = "import { appendFileSync } from 'node:fs'\nif (process.env.CHAOS_E2E_MARK) appendFileSync(process.env.CHAOS_E2E_MARK, 'ran\\n')\n"
const TESTS = `import { test } from 'node:test'\nimport assert from 'node:assert/strict'\nimport { clamp } from '../src/guard.mjs'\n${MARK}test('clamp floors at zero', () => assert.equal(clamp(-1), 0))\n`
// Node 26 prints the spec reporter (`ℹ fail 1`, `✖ name`) to a pipe; Node 22 prints TAP (`# fail 1`,
// `not ok 1 - name`). Both are read by the runner, so assertions accept both.
const SUM = (key, n) => `(?:ℹ|#) ${key} ${n}`
const plant = (over) => ({ name: 'clamp: drop the floor', file: 'src/guard.mjs', find: '  if (x < 0) return 0\n', replace: '', tests: ['test/guard.test.mjs'], note: 'authored: fixture', ...over })

/** A committed fixture project; returns its path. `files` adds or overrides repo-relative files. */
function fixture({ plants, expectedTotal = plants.length, files = {}, config = {}, git = true }) {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-e2e-'))
  const all = {
    'src/guard.mjs': GUARD,
    'test/guard.test.mjs': TESTS,
    'chaos/guard.plants.mjs': `export const PLANTS = ${JSON.stringify(plants, null, 2)}\n`,
    'chaos.config.json': JSON.stringify({ plantsDir: 'chaos', expectedTotal, testCommand: ['node', '--test'], summary: 'node', ...config }),
    ...files,
  }
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(dirname(join(dir, rel)), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  if (git) commitAll(dir, 'fixture', true)
  return dir
}

function commitAll(dir, msg, init = false) {
  const g = (...args) => execFileSync('git', ['-c', 'user.email=f@x', '-c', 'user.name=f', ...args], { cwd: dir, stdio: 'ignore' })
  if (init) g('init', '-q')
  g('add', '-A')
  g('commit', '-qm', msg)
}

const markOf = (dir) => `${dir}.mark`
const testRuns = (dir) => (existsSync(markOf(dir)) ? readFileSync(markOf(dir), 'utf8').split('\n').filter(Boolean).length : 0)

function run(dir, ...args) {
  const r = spawnSync('node', [RUNNER, ...args], { cwd: dir, encoding: 'utf8', env: { ...process.env, CHAOS_E2E_MARK: markOf(dir) } })
  const status = existsSync(join(dir, '.git')) ? execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }) : ''
  return { code: r.status, out: `${r.stdout}${r.stderr}`, clean: status === '', lockLeft: existsSync(join(dir, '.git/chaos')) }
}

function scratch(t, opts) {
  const dir = fixture(opts)
  t.after(() => rmSync(dir, { recursive: true, force: true }) || rmSync(markOf(dir), { force: true }))
  return dir
}

test('a covered guard goes RED and an uncovered one is a MISSING TEST — the report shows what it read', (t) => {
  const dir = scratch(t, { plants: [plant(), plant({ name: 'limit: drop the ceiling', find: '  if (x > 10) return 10\n' })] })
  const r = run(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, new RegExp(`\\[RED\\] clamp: drop the floor\\n.*${SUM('fail', 1)} · ${SUM('pass', 0)}.*\\n.*caught by: (?:✖|not ok \\d+ -) clamp floors at zero`))
  assert.match(r.out, new RegExp(`\\[STAYED-GREEN\\] limit: drop the ceiling\\n.*${SUM('fail', 0)} · ${SUM('pass', 1)}`))
  assert.match(r.out, /2\/2 files restored byte-identical; git status is what it was before the run/)
  assert.equal(readFileSync(join(dir, 'src/guard.mjs'), 'utf8'), GUARD)
  assert.ok(r.clean && !r.lockLeft)
})

test('all plants red → exit 0, and the lock is released', (t) => {
  const dir = scratch(t, { plants: [plant()] })
  const r = run(dir)
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /1\/1 plants went RED/)
  assert.ok(r.clean && !r.lockLeft)
})

test('the plant count binds — and a name filter cannot switch it off', (t) => {
  const dir = scratch(t, { plants: [plant()], expectedTotal: 2 })
  for (const args of [[], ['--check'], ['--check', 'clamp'], ['clamp']]) {
    const r = run(dir, ...args)
    assert.equal(r.code, 1, args.join(' '))
    assert.match(r.out, /PLANT COUNT DRIFTED: found 1, expected 2/)
  }
  assert.equal(testRuns(dir), 0)
})

test('a filtered run is not the gate: it exits 2 even when every selected plant went red', (t) => {
  const dir = scratch(t, { plants: [plant(), plant({ name: 'limit: drop the ceiling', find: '  if (x > 10) return 10\n' })] })
  const r = run(dir, 'clamp')
  assert.equal(r.code, 2, r.out)
  assert.match(r.out, /FILTERED RUN — 1 of 2 plants\. THIS IS NOT THE GATE/)
  assert.ok(r.clean)
})

test('an unknown option refuses to start — a typo never falls through to the mutating gate', (t) => {
  const dir = scratch(t, { plants: [plant()] })
  for (const typo of ['--chek', '--Check', '--help']) {
    const r = run(dir, typo)
    assert.equal(r.code, 1)
    assert.match(r.out, /unknown option/)
  }
  assert.equal(testRuns(dir), 0)
  assert.equal(existsSync(join(dir, '.git/chaos')), false)
})

test('--check validates without running a test, taking the lock, or touching a file', (t) => {
  const dir = scratch(t, { plants: [plant()] })
  const ok = run(dir, '--check')
  assert.equal(ok.code, 0, ok.out)
  assert.match(ok.out, /✅ --check: 1 plant\(s\) valid/)
  assert.doesNotMatch(ok.out, /\[baseline\]|CHAOS PLANTS —/)
  writeFileSync(join(dir, 'src/guard.mjs'), GUARD.replace('  if (x < 0) return 0\n', '  if (x <= 0) return 0\n'))
  commitAll(dir, 'the source moved')
  const moved = run(dir, '--check')
  assert.equal(moved.code, 1)
  assert.match(moved.out, /anchor occurs 0× in src\/guard\.mjs/)
  assert.equal(testRuns(dir), 0)
  assert.ok(moved.clean && !moved.lockLeft)
})

test('the full gate runs the same validation first: every broken plant listed, nothing run, nothing touched', (t) => {
  const dir = scratch(t, { plants: [plant({ find: '  if (x < -1) return 0\n' }), plant({ name: 'limit: no test file', find: '  if (x > 10) return 10\n', tests: ['test/missing.test.mjs'] })] })
  const r = run(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /clamp: drop the floor: anchor occurs 0×/)
  assert.match(r.out, /limit: no test file: test file test\/missing\.test\.mjs does not exist/)
  assert.equal(testRuns(dir), 0)
  assert.ok(r.clean && !r.lockLeft)
})

test('duplicate plant names refuse to start', (t) => {
  const dir = scratch(t, { plants: [plant(), plant({ find: '  if (x > 10) return 10\n' })] })
  const r = run(dir, '--check')
  assert.equal(r.code, 1)
  assert.match(r.out, /duplicate plant names.*clamp: drop the floor/)
})

test('a dirty target file refuses to start — a restore could not be told from real work', (t) => {
  const dir = scratch(t, { plants: [plant()] })
  writeFileSync(join(dir, 'src/guard.mjs'), `${GUARD}// uncommitted work\n`)
  const r = run(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /already modified/)
  assert.equal(readFileSync(join(dir, 'src/guard.mjs'), 'utf8'), `${GUARD}// uncommitted work\n`)
  assert.equal(testRuns(dir), 0)
})

test('a target git does not track, or one reached through a symlink, refuses to start', (t) => {
  const dir = scratch(t, { plants: [plant({ file: 'src/alias.mjs' }), plant({ name: 'untracked', file: 'src/new.mjs', find: 'x' })], files: {} })
  symlinkSync('guard.mjs', join(dir, 'src/alias.mjs'))
  commitAll(dir, 'a tracked symlink')
  writeFileSync(join(dir, 'src/new.mjs'), 'x\n')
  const r = run(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /src\/alias\.mjs is not the file's real path/)
  assert.match(r.out, /src\/new\.mjs is not tracked by git/)
  assert.equal(testRuns(dir), 0)
})

test('outside a git repository it refuses with a sentence, not a stack trace', (t) => {
  const dir = scratch(t, { plants: [plant()], git: false })
  for (const args of [[], ['--check']]) {
    const r = run(dir, ...args)
    assert.equal(r.code, 1)
    assert.match(r.out, /needs a git repository/)
    assert.doesNotMatch(r.out, /at .*\.mjs:\d+/)
  }
})

test('a held lock or backups from a crashed run refuse EVERY mode — --check and --list included', (t) => {
  const dir = scratch(t, { plants: [plant(), plant({ name: 'limit', find: '  if (x > 10) return 10\n' })] })
  mkdirSync(join(dir, '.git/chaos'))
  const held = run(dir)
  assert.equal(held.code, 1)
  assert.match(held.out, /another chaos run holds the lock, or one died/)
  writeFileSync(join(dir, '.git/chaos/src__guard.mjs'), GUARD)
  for (const args of [[], ['--check'], ['--list']]) {
    const r = run(dir, ...args)
    assert.equal(r.code, 1, args.join(' '))
    assert.match(r.out, /src__guard\.mjs/)
  }
  assert.equal(testRuns(dir), 0)
})

test('a RED baseline refuses to start — it would hand every plant a free red', (t) => {
  const dir = scratch(t, { plants: [plant()], files: { 'test/guard.test.mjs': TESTS.replace('clamp(-1), 0', 'clamp(-1), 99') } })
  const r = run(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, new RegExp(`baseline for 'test/guard\\.test\\.mjs' is not green: exit 1 · ${SUM('fail', 1)} · ${SUM('pass', 0)}`))
  assert.ok(r.clean && !r.lockLeft)
})

test('a test command that cannot start says so — not "your suite is red"', (t) => {
  const dir = scratch(t, { plants: [plant()], config: { testCommand: ['no-such-test-runner-xyz'] } })
  const r = run(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /could not start 'no-such-test-runner-xyz'.*ENOENT/)
  assert.ok(r.clean && !r.lockLeft)
})

test('a runner that prints its summary to STDERR on a green run (as Jest does) is read, not refused', (t) => {
  const toStderr = "import { spawnSync } from 'node:child_process'\nconst { NODE_TEST_CONTEXT, ...env } = process.env\nconst r = spawnSync('node', ['--test', ...process.argv.slice(2)], { encoding: 'utf8', env })\nprocess.stderr.write(r.stdout)\nprocess.exit(r.status)\n"
  const dir = scratch(t, { plants: [plant()], files: { 'stderr-runner.mjs': toStderr }, config: { testCommand: ['node', 'stderr-runner.mjs'] } })
  const r = run(dir)
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /\[RED\] clamp: drop the floor/)
})

test('a planted run that changes ANY tracked file fails the gate, naming it — not just the targets', (t) => {
  const writesSnapshot = TESTS.replace("test('clamp", "import { writeFileSync } from 'node:fs'\nwriteFileSync(new URL('../snap.txt', import.meta.url), `${clamp(-1)}\\n`)\ntest('clamp")
  const dir = scratch(t, { plants: [plant()], files: { 'test/guard.test.mjs': writesSnapshot, 'snap.txt': '0\n' } })
  const r = run(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /git status changed during the run[\s\S]*snap\.txt/)
  assert.equal(readFileSync(join(dir, 'src/guard.mjs'), 'utf8'), GUARD)
})

test('a plant that stops a 2-test file from LOADING is INCONCLUSIVE, not RED — the test total dropped', (t) => {
  const two = `${TESTS}test('clamp keeps positives', () => assert.equal(clamp(3), 3))\n`
  const dir = scratch(t, { plants: [plant({ name: 'break the export', find: 'export function clamp', replace: 'function clamp' })], files: { 'test/guard.test.mjs': two } })
  const r = run(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /\[INCONCLUSIVE\] break the export\n.*1 test\(s\), the baseline 2/)
  assert.ok(r.clean)
})

test('KNOWN LIMIT, pinned so nobody forgets it: under `node`, a 1-test file that fails to load reads RED', (t) => {
  // node:test counts a file that fails to load as ONE failed test (measured on Node 26.8.1), so
  // for a file holding exactly one test the total cannot tell a load failure from a real catch.
  const dir = scratch(t, { plants: [plant({ name: 'break the parse', replace: '  if (x < 0 return 0\n' })] })
  const r = run(dir)
  assert.match(r.out, /\[RED\] break the parse/)
  assert.ok(r.clean)
})

for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGHUP', 129]]) {
  test(`${signal} mid-plant: the child is stopped, the file restored, no further plant starts, exit ${code}`, async (t) => {
    const slow = TESTS.replace("test('clamp", "await new Promise((r) => setTimeout(r, 1500))\ntest('clamp")
    const dir = scratch(t, { plants: [plant(), plant({ name: 'limit', find: '  if (x > 10) return 10\n' })], files: { 'test/guard.test.mjs': slow } })
    const child = spawn('node', [RUNNER], { cwd: dir, env: { ...process.env, CHAOS_E2E_MARK: markOf(dir) } })
    let out = ''
    const exited = new Promise((resolve) => child.on('close', (c) => resolve(c)))
    await new Promise((resolve) => {
      const onData = (d) => {
        out += d
        if (/ {2}1\/2 clamp: drop the floor/.test(out)) setTimeout(resolve, 400) // inside the planted run
      }
      child.stdout.on('data', onData)
      child.stderr.on('data', (d) => (out += d))
    })
    assert.notEqual(readFileSync(join(dir, 'src/guard.mjs'), 'utf8'), GUARD, 'the plant should be in place when the signal lands')
    child.kill(signal)
    assert.equal(await exited, code, out)
    assert.doesNotMatch(out, /2\/2 limit/)
    assert.match(out, /ABORTED by SIG/)
    assert.equal(readFileSync(join(dir, 'src/guard.mjs'), 'utf8'), GUARD)
    assert.equal(execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }), '')
    assert.equal(existsSync(join(dir, '.git/chaos')), false)
  })
}
