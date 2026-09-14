// A plant file: any `*.plants.mjs` (or `.plants.ts` on Node >= 22.18) in `plantsDir`.
// Each plant breaks ONE guard; `tests` must go red while it is in place.
export const PLANTS = [
  {
    name: 'refund: drop the negative-amount guard', // `<unit>: <what is disarmed>` — read aloud in the report
    file: 'src/refund.js', //                          repo-relative file to mutate
    find: '  if (amount < 0) throw new RangeError("negative refund")\n', // EXACT text, must occur exactly once
    replace: '', //                                    what it becomes (empty deletes the guard)
    tests: ['test/refund.test.js'], //                 test files to run while planted
    note: 'authored: 2026-09-14 — the guard shipped with no test', // provenance, printed in the report
  },
]
