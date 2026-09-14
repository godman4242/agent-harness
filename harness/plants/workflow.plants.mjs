// The harness's own plants: the fail-closed accounting in measure-refute.js, disarmed one at a time.
const WF = 'workflows/measure-refute.js'
const T = ['workflows/measure-refute.test.mjs']
const note = 'authored: 2026-09-14 — adversarial review'

export const PLANTS = [
  { name: 'workflow: complete means ANY live verdict', file: WF, find: 'const complete = live.length === expected\n', replace: 'const complete = live.length > 0\n', tests: T, note },
  { name: 'workflow: liveness is a deny-list', file: WF, find: 'LIVE.has(v.verdict)', replace: "v.verdict !== 'UNVERIFIED'", tests: T, note },
  { name: 'workflow: malformed args still spawn agents', file: WF, find: 'if (problems.length > 0) {\n', replace: 'if (false) {\n', tests: T, note },
  { name: 'workflow: a dead run reports fatalCount 0', file: WF, find: '  fatalCount: complete ? fatal.length : null,\n', replace: '  fatalCount: fatal.length,\n', tests: T, note },
]
