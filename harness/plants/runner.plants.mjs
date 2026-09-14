// The harness's own plants: every fail-closed guard in chaos.mjs, disarmed one at a time.
const RUN = 'chaos/chaos.mjs'
const T = ['chaos/chaos.e2e.test.mjs']
const note = 'authored: 2026-09-14 — adversarial review'

export const PLANTS = [
  { name: 'runner: the plant count is not pinned', file: RUN, find: 'if (all.length !== config.expectedTotal) {\n', replace: 'if (false) {\n', tests: T, note },
  { name: 'runner: duplicate plant names accepted', file: RUN, find: 'if (dupes.length > 0) fatal(', replace: 'if (false) fatal(', tests: T, note },
  { name: 'runner: a broken plant is not refused up front', file: RUN, find: 'if (problems.length > 0) fatal(', replace: 'if (false) fatal(', tests: T, note },
  { name: 'runner: a symlinked target is accepted', file: RUN, find: '  if (realpathSync.native(abs) !== join(realRoot, normalize(plant.file))) {\n', replace: '  if (false) {\n', tests: T, note },
  { name: 'runner: an untracked target is accepted', file: RUN, find: '  if (!tracked.has(normalize(plant.file))) {\n', replace: '  if (false) {\n', tests: T, note },
  { name: 'runner: --check falls through to the mutating gate', file: RUN, find: '  process.exit(filtered ? 2 : 0)\n', replace: '  void filtered\n', tests: T, note },
  { name: 'runner: a filtered run exits 0 like the gate', file: RUN, find: '  process.exit(2)\n', replace: '  process.exit(0)\n', tests: T, note },
  { name: 'runner: a dirty target is planted anyway', file: RUN, find: 'if (dirty.length > 0) fatal(', replace: 'if (false) fatal(', tests: T, note },
  { name: 'runner: a held lock is not refused', file: RUN, find: '  if (!existsSync(LOCK)) return\n', replace: '  return\n', tests: T, note },
  { name: 'runner: --check and --list skip the lock', file: RUN, find: '}\nrefuseIfLocked()\n', replace: '}\n', tests: T, note },
  { name: 'runner: a red baseline is accepted', file: RUN, find: '  if (timedOut || !baselineIsGreen(config.summary, code, out)) {\n', replace: '  if (timedOut) {\n', tests: T, note },
  { name: 'runner: a test run that writes the tree passes', file: RUN, find: '  if (now === statusBefore) return\n', replace: '  return\n', tests: T, note },
  { name: 'runner: stderr is dropped', file: RUN, find: "      const out = `${Buffer.concat(stdout).toString('utf8')}${Buffer.concat(stderr).toString('utf8')}`\n", replace: "      const out = Buffer.concat(stdout).toString('utf8')\n", tests: T, note },
  { name: 'runner: signals are not handled', file: RUN, find: "for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) process.on(signal, () => abort(signal))\n", replace: 'void abort\n', tests: T, note },
  { name: 'runner: outside git it crashes with a stack trace', file: RUN, find: '  fatal([`${ROOT} is not inside a git work tree.', replace: '  void ([`${ROOT} is not inside a git work tree.', tests: T, note },
  { name: 'runner: a test command that cannot start reads as a red suite', file: RUN, find: "      fatal([`could not start '${cmd}': ${err.code ?? message(err)} — check testCommand in chaos.config.json`])\n", replace: "      done({ code: 1, timedOut: false, out: '' })\n", tests: T, note },
]
