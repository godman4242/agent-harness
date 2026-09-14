#!/usr/bin/env node
// CHAOS PLANTS — prove every guard is covered by a test that can FAIL.
//
// A plant is a deliberate, surgical break in your source, declared as data and committed.
// The runner applies each one, runs the tests it names, requires at least one FAILED TEST,
// and restores the file byte-for-byte. A plant that stays green is a missing test.
//
// Run from your project root (it needs git and a chaos.config.json there):
//   node <path>/harness/chaos/chaos.mjs            the gate: every plant, count-pinned
//   node <path>/harness/chaos/chaos.mjs --check    NO mutation: validate plants, pin the count,
//                                                  and resolve every anchor exactly once (pre-commit)
//   node <path>/harness/chaos/chaos.mjs --list     print the plants, touch nothing
//   node <path>/harness/chaos/chaos.mjs <text>     only plants whose name/file matches — NOT the gate
//
// ⛔ Never run the full gate in a pre-commit hook: it rewrites source. `--check` is the
// pre-commit half.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { applyPlant, baselineIsGreen, classify, countOccurrences, testCounts, validateConfig, validatePlant } from './chaosLib.mjs'

const ROOT = process.cwd()
const BACKUP_DIR = join(ROOT, '.chaos-backup')

function fatal(lines) {
  process.stderr.write(`\n❌ CHAOS GATE ABORTED\n   ${lines.join('\n   ')}\n\n`)
  process.exit(1)
}
const message = (err) => (err instanceof Error ? err.message : String(err))
const git = (args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })

const configPath = join(ROOT, 'chaos.config.json')
if (!existsSync(configPath)) fatal([`no chaos.config.json in ${ROOT} — run from your project root (see harness/chaos/chaos.config.example.json)`])
let config
try {
  config = validateConfig(JSON.parse(readFileSync(configPath, 'utf8')))
} catch (err) {
  fatal([message(err)])
}

function runTests(files) {
  const [cmd, ...base] = config.testCommand
  // NODE_TEST_CONTEXT is inherited when this runner itself runs under `node --test` (CI, or its
  // own e2e suite), and it makes a child `node --test` report to its parent over a protocol
  // instead of printing a summary — so the parser matches nothing. Measured; hence removed.
  const { NODE_TEST_CONTEXT, ...env } = process.env
  void NODE_TEST_CONTEXT
  try {
    const out = execFileSync(cmd, [...base, ...files], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 900_000,
      env: { ...env, NO_COLOR: '1', FORCE_COLOR: '0' },
    })
    return { code: 0, out }
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

async function loadPlants() {
  const dir = resolve(ROOT, config.plantsDir)
  if (!existsSync(dir)) fatal([`plantsDir '${config.plantsDir}' does not exist`])
  // `.plants.ts` works on Node versions that strip types natively (>= 22.18).
  const files = readdirSync(dir).filter((f) => /\.plants\.(mjs|js|ts)$/.test(f)).sort()
  if (files.length === 0) fatal([`no *.plants.mjs files in ${config.plantsDir} — the gate has nothing to run`])
  const loaded = []
  for (const file of files) {
    const mod = await import(pathToFileURL(join(dir, file)).href)
    if (!Array.isArray(mod.PLANTS)) fatal([`${file}: must export a PLANTS array`])
    mod.PLANTS.forEach((raw, i) => {
      try {
        loaded.push({ plant: validatePlant(raw, `${file}[${i}]`), source: file })
      } catch (err) {
        fatal([message(err)])
      }
    })
  }
  return loaded
}

const argv = process.argv.slice(2)
const listOnly = argv.includes('--list')
const checkOnly = argv.includes('--check')
const filters = argv.filter((a) => !a.startsWith('--'))
const filtered = filters.length > 0

const all = await loadPlants()

const names = all.map(({ plant }) => plant.name)
const dupes = names.filter((n, i) => names.indexOf(n) !== i)
if (dupes.length > 0) fatal([`duplicate plant names (the report addresses plants by name): ${[...new Set(dupes)].join(', ')}`])

if (!filtered && all.length !== config.expectedTotal) {
  fatal([
    `PLANT COUNT DRIFTED: found ${all.length}, expected ${config.expectedTotal}.`,
    'A gate that silently shrinks is worse than no gate. If plants were really added or removed,',
    "change 'expectedTotal' in chaos.config.json and say so in the commit — never to make a run pass.",
  ])
}

const selected = filtered ? all.filter(({ plant, source }) => filters.some((f) => plant.name.includes(f) || plant.file.includes(f) || source.includes(f))) : all
if (selected.length === 0) fatal([`no plant matches ${filters.join(' ')}`])

if (listOnly) {
  process.stdout.write(`\nCHAOS PLANTS — ${selected.length} of ${all.length}\n`)
  selected.forEach(({ plant, source }, i) => process.stdout.write(`${String(i + 1).padStart(3)}. ${plant.name}\n     ${plant.file} ← ${source} [${plant.note}]\n`))
  process.stdout.write('nothing was touched (--list)\n\n')
  process.exit(0)
}

if (checkOnly) {
  // The pre-commit half: resolve every anchor WITHOUT applying anything, so anchor drift goes
  // red on the commit that causes it instead of on the next full chaos run.
  const problems = []
  for (const { plant, source } of selected) {
    const abs = join(ROOT, plant.file)
    if (!existsSync(abs)) {
      problems.push(`${source} · ${plant.name}: ${plant.file} does not exist`)
      continue
    }
    const n = countOccurrences(readFileSync(abs, 'utf8'), plant.find)
    if (n !== 1) problems.push(`${source} · ${plant.name}: anchor occurs ${n}× in ${plant.file}, expected exactly 1`)
    for (const t of plant.tests) if (!existsSync(join(ROOT, t))) problems.push(`${source} · ${plant.name}: test file ${t} does not exist`)
  }
  if (problems.length > 0) fatal(['--check found plants that could not run:', ...problems.map((p) => `  ${p}`)])
  process.stdout.write(`✅ --check: ${selected.length} plant(s) valid, count ${filtered ? 'not checked (filtered)' : `= ${config.expectedTotal}`}, every anchor resolves exactly once. Nothing was touched.\n`)
  process.exit(0)
}

if (filtered) process.stdout.write(`\n⚠️  FILTERED RUN — ${selected.length} of ${all.length} plants. THIS IS NOT THE GATE.\n`)

// Pre-flight 1: a previous run died without restoring. Not auto-restored on purpose — it is the
// one situation where a script guessing wrong destroys real work.
if (existsSync(BACKUP_DIR) && readdirSync(BACKUP_DIR).length > 0) {
  fatal([`${BACKUP_DIR} still holds backups from a run that did not finish:`, ...readdirSync(BACKUP_DIR).map((f) => `  ${f}`), 'Restore by hand (each name is its repo path with "/" as "__"), or delete the directory if `git status` is clean.'])
}

// Pre-flight 2: nothing we are about to mutate may already be modified.
const targets = [...new Set(selected.map(({ plant }) => plant.file))].sort()
const dirty = git(['status', '--porcelain', '--', ...targets]).trim()
if (dirty.length > 0) fatal(['these files are already modified, so a restore could not be told from your work:', ...dirty.split('\n').map((l) => `  ${l}`), 'Commit or stash them, then re-run.'])

let inFlight = null
function restoreInFlight() {
  if (inFlight === null) return
  const { abs, original, backup } = inFlight
  inFlight = null
  writeFileSync(abs, original)
  if (existsSync(backup)) rmSync(backup)
  process.stderr.write(`\n[chaos] restored ${abs} on the way out\n`)
}
process.on('exit', restoreInFlight)
process.on('SIGINT', () => {
  restoreInFlight()
  process.exit(130)
})
process.on('SIGTERM', () => {
  restoreInFlight()
  process.exit(143)
})

mkdirSync(BACKUP_DIR, { recursive: true })

// Pre-flight 3: every distinct test set must be GREEN unplanted.
const baselines = new Set()
for (const { plant } of selected) {
  const key = plant.tests.join(' ')
  if (baselines.has(key)) continue
  const { code, out } = runTests(plant.tests)
  if (!baselineIsGreen(config.summary, code, out)) {
    const { failed, passed } = testCounts(config.summary, out)
    rmSync(BACKUP_DIR, { recursive: true, force: true })
    fatal([`baseline for '${key}' is not green: exit ${code}, ${passed ?? '?'} passed, ${failed ?? '?'} failed.`, 'Every plant against it would score red for the wrong reason. Fix the suite first — or check the summary parser matches your runner.'])
  }
  baselines.add(key)
  process.stdout.write(`[baseline] ${key}: green\n`)
}

process.stdout.write(`\nCHAOS PLANTS — ${selected.length}, one test run each, serially (plants mutate shared files).\n\n`)

const results = []
for (const [i, { plant, source }] of selected.entries()) {
  process.stdout.write(`${String(i + 1).padStart(3)}/${selected.length} ${plant.name}\n`)
  const abs = join(ROOT, plant.file)
  if (!existsSync(abs)) {
    results.push({ plant, status: 'PLANT-FAILED', detail: `${plant.file} does not exist` })
    continue
  }
  const original = readFileSync(abs)
  let mutated
  try {
    mutated = applyPlant(original.toString('utf8'), plant)
  } catch (err) {
    const detail = message(err)
    results.push({ plant, status: detail.includes('unchanged') ? 'NO-OP' : 'PLANT-FAILED', detail })
    continue
  }
  const backup = join(BACKUP_DIR, plant.file.replaceAll('/', '__'))
  writeFileSync(backup, original)
  inFlight = { abs, original, backup }
  writeFileSync(abs, mutated)

  const { code, out } = runTests(plant.tests)

  // Restore FIRST, always, before judging anything.
  writeFileSync(abs, original)
  const readBack = readFileSync(abs)
  inFlight = null
  rmSync(backup)
  if (!readBack.equals(original)) {
    results.push({ plant, status: 'RESTORE-FAILED', detail: `${plant.file} did not come back byte-identical` })
    continue
  }

  const verdict = classify(config.summary, code, out)
  if (verdict === 'red') results.push({ plant, status: 'RED', detail: `${testCounts(config.summary, out).failed} test(s) failed · ${source} [${plant.note}]` })
  else if (verdict === 'green') results.push({ plant, status: 'STAYED-GREEN', detail: 'MISSING TEST — nothing in the named test files covers this guard' })
  else results.push({ plant, status: 'INCONCLUSIVE', detail: `exit ${code} with no failed test reported — the plant probably broke the build, which proves nothing` })
}

rmSync(BACKUP_DIR, { recursive: true, force: true })
const stillDirty = git(['status', '--porcelain', '--', ...targets]).trim()
const red = results.filter((r) => r.status === 'RED').length
const bad = results.filter((r) => r.status !== 'RED')
const restored = results.filter((r) => r.status !== 'RESTORE-FAILED').length

process.stdout.write('\nCHAOS PLANT REPORT\n')
results.forEach((r, i) => process.stdout.write(`${r.status === 'RED' ? 'OK ' : 'BAD'} ${String(i + 1).padStart(3)}. [${r.status}] ${r.plant.name}\n        → ${r.detail}\n`))
process.stdout.write(`${red}/${results.length} plants went RED.\n`)
process.stdout.write(`${restored}/${results.length} files restored byte-identical; git says ${stillDirty === '' ? 'the tree is clean' : 'THE TREE IS DIRTY'}.\n`)
if (filtered) process.stdout.write('⚠️  FILTERED RUN — this was not the gate.\n')

if (stillDirty !== '') fatal(['the run finished but left the tree dirty:', ...stillDirty.split('\n').map((l) => `  ${l}`)])
if (bad.length > 0) {
  process.stderr.write(`\n❌ ${bad.length} plant(s) did not go red. A STAYED-GREEN plant is a missing test — fix the TEST, never the plant.\n\n`)
  process.exit(1)
}
process.stdout.write('\n✅ every plant went red and every file came back byte-identical.\n\n')
