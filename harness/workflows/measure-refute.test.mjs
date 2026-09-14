// Executes measure-refute.js against stub agents — every agent DEAD, every agent ALIVE —
// and pins the fail-closed accounting. Zero dependencies:  node --test 'harness/**/*.test.mjs'
//
// A workflow script uses a top-level `return`, so `node --check` rejects it; it is compiled
// here the way the runtime compiles it, as the body of an async function.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const SRC = readFileSync(new URL('./measure-refute.js', import.meta.url), 'utf8').replace(/^export const meta/m, 'const meta')
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const body = new AsyncFunction('agent', 'parallel', 'pipeline', 'log', 'phase', 'args', SRC)

const ARGS = {
  goal: 'a synthetic check',
  units: [{ name: 'a', read: ['a.ts'] }, { name: 'b', read: ['b.ts'] }, { name: 'c', read: ['c.ts'] }],
  lenses: [{ key: 'x', ask: '?' }, { key: 'y', ask: '?' }],
}

/** Run the script. `answer(label)` is what each agent returns (null = it died). */
async function run(args, answer) {
  const labels = []
  const agent = async (_prompt, opts) => { labels.push(opts.label); return answer(opts.label) }
  // As the runtime does it: a thunk that THROWS resolves to null; the call itself never rejects.
  const parallel = async (thunks) => Promise.all(thunks.map((t) => Promise.resolve().then(t).catch(() => null)))
  // As the runtime does it: a stage that THROWS drops that item to null.
  const pipeline = async (items, ...stages) => {
    const out = []
    for (const [i, item] of items.entries()) {
      let v = item
      try {
        for (const stage of stages) v = await stage(v, item, i)
      } catch {
        v = null
      }
      out.push(v)
    }
    return out
  }
  const result = await body(agent, parallel, pipeline, () => {}, () => {}, args)
  return { result, labels }
}

const measured = (label) => ({ unit: label, findings: [], counts: '', integrity: '' })

test('every agent ALIVE: units × (1 + lenses) agents, VERIFIED, fatalCount is a number', async () => {
  const { result, labels } = await run(ARGS, (l) => (l.startsWith('measure') ? measured(l) : { verdict: 'CORRECTED', refutations: [], integrity: '' }))
  assert.equal(labels.length, 3 * (1 + 2))
  assert.equal(result.status, 'VERIFIED')
  assert.equal(result.fatalCount, 0)
})

test('every agent DEAD: no refuter is spawned for a dead measurement, and nothing reads as clean', async () => {
  const { result, labels } = await run(ARGS, () => null)
  assert.equal(labels.length, 3)
  assert.equal(result.status, 'UNVERIFIED')
  assert.equal(result.fatalCount, null)
  assert.deepEqual(result.units.map((u) => u.status), ['UNMEASURED', 'UNMEASURED', 'UNMEASURED'])
  assert.ok(result.units.every((u) => u.verdicts.length === 2 && u.verdicts.every((v) => v.verdict === 'UNVERIFIED')))
})

test('ONE dead refuter makes the whole run UNVERIFIED with fatalCount null — even beside a live FATAL', async () => {
  const { result } = await run(ARGS, (l) => {
    if (l.startsWith('measure')) return measured(l)
    if (l === 'refute:b:y') return null
    return l === 'refute:a:x' ? { verdict: 'FATAL', refutations: [], integrity: '' } : { verdict: 'CLEAN', refutations: [], integrity: '' }
  })
  assert.equal(result.status, 'UNVERIFIED')
  assert.equal(result.fatalCount, null)
  assert.match(result.integrity, /5\/6 live verdicts/)
  assert.equal(result.units.find((u) => u.unit === 'b').status, 'VERIFIED')
})

test('a unit measured fine but whose refuters ALL died is UNVERIFIED, never VERIFIED', async () => {
  const { result } = await run(ARGS, (l) => {
    if (l.startsWith('measure')) return measured(l)
    return l.startsWith('refute:c:') ? null : { verdict: 'CLEAN', refutations: [], integrity: '' }
  })
  assert.deepEqual(result.units.map((u) => [u.unit, u.status]), [['a', 'VERIFIED'], ['b', 'VERIFIED'], ['c', 'UNVERIFIED']])
  assert.equal(result.fatalCount, null)
})

test('a unit whose stage THREW (the runtime drops it to null) is still in the result, UNMEASURED', async () => {
  const { result } = await run(ARGS, (l) => {
    if (l === 'measure:b') throw new Error('a stage blew up')
    return l.startsWith('measure') ? measured(l) : { verdict: 'CLEAN', refutations: [], integrity: '' }
  })
  assert.deepEqual(result.units.map((u) => [u.unit, u.status]), [['a', 'VERIFIED'], ['b', 'UNMEASURED'], ['c', 'VERIFIED']])
  assert.equal(result.status, 'UNVERIFIED')
  assert.equal(result.fatalCount, null)
})

test('no units or no lenses: zero agents, UNVERIFIED, and it says why', async () => {
  for (const args of [undefined, {}, { units: ARGS.units }, { lenses: ARGS.lenses }]) {
    const { result, labels } = await run(args, () => { throw new Error('no agent may spawn') })
    assert.equal(labels.length, 0)
    assert.equal(result.status, 'UNVERIFIED')
    assert.equal(result.fatalCount, null)
    assert.match(result.integrity, /Nothing was checked/)
  }
})

test('malformed args spawn NOTHING and say what is wrong — plain strings must not run as `undefined`', async () => {
  const cases = [
    ['a JSON string', JSON.stringify(ARGS), /args must be an object/],
    ['string units', { ...ARGS, units: ['a.ts', 'b.ts'] }, /units\[0\] must be \{ name, read\?, focus\? \}/],
    ['string lenses', { ...ARGS, lenses: ['spec'] }, /lenses\[0\] must be \{ key, ask \}/],
    ['a unit with no name', { ...ARGS, units: [{ read: ['a.ts'] }] }, /units\[0\]\.name/],
    ['read is not a list of paths', { ...ARGS, units: [{ name: 'a', read: 'a.ts' }] }, /units\[0\]\.read/],
    ['a lens with no ask', { ...ARGS, lenses: [{ key: 'x' }] }, /lenses\[0\]\.ask/],
    ['duplicate unit names', { ...ARGS, units: [{ name: 'a' }, { name: 'a' }] }, /duplicate unit name 'a'/],
    ['duplicate lens keys', { ...ARGS, lenses: [{ key: 'x', ask: '?' }, { key: 'x', ask: '?' }] }, /duplicate lens key 'x'/],
  ]
  for (const [what, args, why] of cases) {
    const { result, labels } = await run(args, () => { throw new Error('no agent may spawn') })
    assert.equal(labels.length, 0, what)
    assert.equal(result.status, 'UNVERIFIED', what)
    assert.equal(result.fatalCount, null, what)
    assert.match(result.integrity, why, what)
  }
})

test('only CLEAN, CORRECTED and FATAL are live — a malformed or mis-cased verdict is NOT a pass', async () => {
  for (const bad of [{ verdict: 'unverified' }, { refutations: [] }, 'CLEAN', { verdict: 'PASS' }]) {
    const { result } = await run(ARGS, (l) => (l.startsWith('measure') ? measured(l) : l === 'refute:a:x' ? bad : { verdict: 'CLEAN', refutations: [], integrity: '' }))
    assert.equal(result.status, 'UNVERIFIED', JSON.stringify(bad))
    assert.equal(result.fatalCount, null, JSON.stringify(bad))
    assert.match(result.integrity, /5\/6 live verdicts.*1 UNVERIFIED/)
  }
})

test('a refuter that THROWS is still named in the result, UNVERIFIED — not a bare null', async () => {
  const { result } = await run(ARGS, (l) => {
    if (l.startsWith('measure')) return measured(l)
    if (l === 'refute:c:y') throw new Error('budget ceiling')
    return { verdict: 'CLEAN', refutations: [], integrity: '' }
  })
  const c = result.units.find((u) => u.unit === 'c')
  assert.deepEqual(c.verdicts.map((v) => [v.lens, v.verdict]), [['x', 'CLEAN'], ['y', 'UNVERIFIED']])
  assert.equal(result.fatalCount, null)
  assert.match(result.integrity, /5\/6 live verdicts.*1 UNVERIFIED/)
})

test('a measure agent that THROWS leaves the unit UNMEASURED with every lens named UNVERIFIED', async () => {
  const { result } = await run(ARGS, (l) => {
    if (l === 'measure:a') throw new Error('budget ceiling')
    return l.startsWith('measure') ? measured(l) : { verdict: 'CLEAN', refutations: [], integrity: '' }
  })
  const a = result.units.find((u) => u.unit === 'a')
  assert.equal(a.status, 'UNMEASURED')
  assert.deepEqual(a.verdicts.map((v) => [v.lens, v.verdict]), [['x', 'UNVERIFIED'], ['y', 'UNVERIFIED']])
  assert.match(result.integrity, /2\/3 units measured; 4\/6 live verdicts.*2 UNVERIFIED/)
})
