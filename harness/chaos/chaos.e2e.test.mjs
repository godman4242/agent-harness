// Runs the REAL runner against a throwaway git project with node:test. Every fail-closed
// pre-flight is driven, and every run ends with the fixture's files checked byte-identical.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const RUNNER = new URL('./chaos.mjs', import.meta.url).pathname

const GUARD = 'export function clamp(x) {\n  if (x < 0) return 0\n  return x\n}\nexport function limit(x) {\n  if (x > 10) return 10\n  return x\n}\n'
const TESTS = "import { test } from 'node:test'\nimport assert from 'node:assert/strict'\nimport { clamp } from '../src/guard.mjs'\ntest('clamp floors at zero', () => assert.equal(clamp(-1), 0))\n"
const plant = (over) => ({ name: 'clamp: drop the floor', file: 'src/guard.mjs', find: '  if (x < 0) return 0\n', replace: '', tests: ['test/guard.test.mjs'], note: 'authored: fixture', ...over })

/** A committed fixture project; returns its path. */
function fixture({ plants, expectedTotal = plants.length, tests = TESTS }) {
  const dir = mkdtempSync(join(tmpdir(), 'chaos-e2e-'))
  mkdirSync(join(dir, 'src'))
  mkdirSync(join(dir, 'test'))
  mkdirSync(join(dir, 'chaos'))
  writeFileSync(join(dir, 'src/guard.mjs'), GUARD)
  writeFileSync(join(dir, 'test/guard.test.mjs'), tests)
  writeFileSync(join(dir, 'chaos/guard.plants.mjs'), `export const PLANTS = ${JSON.stringify(plants, null, 2)}\n`)
  writeFileSync(join(dir, 'chaos.config.json'), JSON.stringify({ plantsDir: 'chaos', expectedTotal, testCommand: ['node', '--test'], summary: 'node' }))
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
  git('init', '-q')
  git('-c', 'user.email=f@x', '-c', 'user.name=f', 'add', '.')
  git('-c', 'user.email=f@x', '-c', 'user.name=f', 'commit', '-qm', 'fixture')
  return dir
}

function run(dir, ...args) {
  const r = spawnSync('node', [RUNNER, ...args], { cwd: dir, encoding: 'utf8' })
  return { code: r.status, out: `${r.stdout}${r.stderr}`, clean: execFileSync('git', ['status', '--porcelain'], { cwd: dir, encoding: 'utf8' }) === '' }
}

test('a covered guard goes RED and an uncovered one is reported as a MISSING TEST — tree restored', (t) => {
  const dir = fixture({ plants: [plant(), plant({ name: 'limit: drop the ceiling', find: '  if (x > 10) return 10\n' })] })
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const r = run(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /\[RED\] clamp: drop the floor/)
  assert.match(r.out, /\[STAYED-GREEN\] limit: drop the ceiling/)
  assert.match(r.out, /2\/2 files restored byte-identical; git says the tree is clean/)
  assert.equal(readFileSync(join(dir, 'src/guard.mjs'), 'utf8'), GUARD)
  assert.ok(r.clean)
})

test('all plants red → exit 0', (t) => {
  const dir = fixture({ plants: [plant()] })
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const r = run(dir)
  assert.equal(r.code, 0, r.out)
  assert.match(r.out, /1\/1 plants went RED/)
  assert.ok(r.clean)
})

test('the plant count binds: a drifted count refuses to start and touches nothing', (t) => {
  const dir = fixture({ plants: [plant()], expectedTotal: 2 })
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const r = run(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /PLANT COUNT DRIFTED: found 1, expected 2/)
  assert.ok(r.clean)
})

test('a dirty target file refuses to start — a restore could not be told from real work', (t) => {
  const dir = fixture({ plants: [plant()] })
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  writeFileSync(join(dir, 'src/guard.mjs'), `${GUARD}// uncommitted work\n`)
  const r = run(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /already modified/)
  assert.equal(readFileSync(join(dir, 'src/guard.mjs'), 'utf8'), `${GUARD}// uncommitted work\n`)
})

test('backups left by a crashed run refuse to start', (t) => {
  const dir = fixture({ plants: [plant()] })
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(join(dir, '.chaos-backup'))
  writeFileSync(join(dir, '.chaos-backup/src__guard.mjs'), GUARD)
  const r = run(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /run that did not finish/)
})

test('a RED baseline refuses to start — it would hand every plant a free red', (t) => {
  const dir = fixture({ plants: [plant()], tests: TESTS.replace('clamp(-1), 0', 'clamp(-1), 99') })
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const r = run(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /baseline for 'test\/guard\.test\.mjs' is not green/)
  assert.ok(r.clean)
})

test('an anchor that moved is PLANT-FAILED, loudly, never skipped', (t) => {
  const dir = fixture({ plants: [plant({ find: '  if (x < -1) return 0\n' })] })
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const r = run(dir)
  assert.equal(r.code, 1)
  assert.match(r.out, /\[PLANT-FAILED\].*\n.*occurs 0×/)
})

test('--check resolves anchors and pins the count without running or touching anything', (t) => {
  const dir = fixture({ plants: [plant()] })
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  assert.equal(run(dir, '--check').code, 0)
  writeFileSync(join(dir, 'src/guard.mjs'), GUARD.replace('  if (x < 0) return 0\n', '  if (x <= 0) return 0\n'))
  execFileSync('git', ['-c', 'user.email=f@x', '-c', 'user.name=f', 'commit', '-qam', 'the source moved'], { cwd: dir })
  const r = run(dir, '--check')
  assert.equal(r.code, 1)
  assert.match(r.out, /anchor occurs 0× in src\/guard\.mjs/)
})

test('KNOWN LIMIT, pinned so nobody forgets it: node --test counts a SYNTAX ERROR as a failed test', (t) => {
  // vitest reports a file that fails to load without a failed-test count, so the runner can call
  // it INCONCLUSIVE. node:test reports `fail 1` for it (measured on Node 26), so with the `node`
  // summary a plant that breaks the parse reads RED. Keep plants syntactically valid.
  const dir = fixture({ plants: [plant({ name: 'break the parse', replace: '  if (x < 0 return 0\n' })] })
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  const r = run(dir)
  assert.match(r.out, /\[RED\] break the parse/)
  assert.ok(r.clean)
})
