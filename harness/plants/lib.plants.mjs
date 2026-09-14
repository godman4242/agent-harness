// The harness's own plants: every guard in chaosLib.mjs, disarmed one at a time.
// Run from harness/:  node chaos/chaos.mjs
const LIB = 'chaos/chaosLib.mjs'
const T = ['chaos/chaosLib.test.mjs']
const note = 'authored: 2026-09-14 — adversarial review'

export const PLANTS = [
  { name: 'lib: parsers take the FIRST summary match', file: LIB, find: '  for (const m of text.matchAll(regex)) found = m\n', replace: '  for (const m of text.matchAll(regex)) { found = m; break }\n', tests: T, note },
  { name: 'lib: ANSI colour is not stripped', file: LIB, find: "  const clean = out.replace(ANSI, '')\n", replace: '  const clean = out\n', tests: T, note },
  { name: 'lib: vitest reads the whole output, not the Tests line', file: LIB, find: String.raw`failed: num(/(\d+)\s+failed/.exec(line[1]))`, replace: String.raw`failed: num(/(\d+)\s+failed/.exec(out))`, tests: T, note },
  { name: 'lib: RED without a non-zero exit', file: LIB, find: "  if (code !== 0 && anyFailed && total === baselineTotal) return 'red'\n", replace: "  if (anyFailed && total === baselineTotal) return 'red'\n", tests: T, note },
  { name: 'lib: RED without the baseline test total', file: LIB, find: "  if (code !== 0 && anyFailed && total === baselineTotal) return 'red'\n", replace: "  if (code !== 0 && anyFailed) return 'red'\n", tests: T, note },
  { name: 'lib: a baseline that collected nothing is green', file: LIB, find: '&& passed !== null && passed > 0', replace: '&& passed !== null', tests: T, note },
  { name: 'lib: overlapping anchors counted once', file: LIB, find: 'haystack.indexOf(needle, i + 1)', replace: 'haystack.indexOf(needle, i + needle.length)', tests: T, note },
  { name: 'lib: the replacement is a String.replace pattern', file: LIB, find: '  return text.replace(plant.find, () => plant.replace)\n', replace: '  return text.replace(plant.find, plant.replace)\n', tests: T, note },
  { name: 'lib: a plant may target its own test', file: LIB, find: '  if (plant.tests.some((t) => posix.normalize(t) === posix.normalize(plant.file))) {\n', replace: '  if (false) {\n', tests: T, note },
  { name: 'lib: plant paths may leave the project', file: LIB, find: '  if (![plant.file, ...plant.tests].every(inside)) throw', replace: '  if (false) throw', tests: T, note },
  { name: 'lib: a broken summary regex is accepted', file: LIB, find: "        new RegExp(summary[key], 'gm')\n", replace: '        void summary[key]\n', tests: T, note },
  { name: 'lib: an unknown option is ignored', file: LIB, find: '  if (unknown.length > 0) throw', replace: '  if (false) throw', tests: T, note },
  { name: 'lib: expectedTotal 0 is accepted', file: LIB, find: '!Number.isInteger(expectedTotal) || expectedTotal < 1', replace: '!Number.isInteger(expectedTotal)', tests: T, note },
]
