# One loop cycle: a senior engineer's routine

Copy this to `docs/loop/CYCLE.md` in your repo and replace every `<…>`. A fresh headless process
reads it at the start of every cycle, does exactly one cycle, and exits. The shell does the
looping, the time box, the watchdog and the post-ship check.

**The bar is a senior engineer's, not a test runner's.** Reproduce before fixing, make the smallest
diff that fixes it, prove it green, then **look at it** and **try to break it**. Green unit tests
can sit on top of a screen nobody can use.

## One cycle: do exactly this, in order

1. **Sync.** `git pull --ff-only` if the repo has a remote other writers push to.
2. **Pick ONE item.** Read `docs/loop/GOAL.md` and take its top open item. Never build an item
   marked as needing a human. **Re-verify first:** reproduce it at HEAD. Queued items go stale.
   If it no longer reproduces, mark it done with that evidence and take the next one.
3. **Red first.** Write the failing test and watch it fail **for the stated reason**. No red, no fix.
4. **Fix** with the smallest diff that turns it green. Read the whole file before editing a big one.
5. **Gate:** `<build> && <tests> && <lint>`. All green, with the numbers on screen.
6. **LOOK**, for anything that renders: `<how to screenshot or render it>`. Then **open the images**
   and judge them as a user would: overlap, cut-off text, contrast, a dead end. If it can't be seen
   headless, queue it for a human. Never tick it.
7. **CHAOS** what you touched: spam it, cancel mid-flow, reload, empty / huge / garbage input. Plant
   the failure a new guard exists for, and watch a test go red. Fix a finding now, or queue it in
   GOAL.md with its evidence.
8. **Review, scaled to risk:**
   - tiny (copy, styling, docs): your own hostile pass over `git diff`;
   - normal: ONE fresh-context reviewer subagent on `git diff` ("find a real bug in this diff;
     quote the line and the input that breaks it"). Fix what it proves;
   - **high-risk** (<data migrations, auth, security, anything hard to undo>): **do not ship.**
     Write the plan and the evidence into GOAL.md for an attended session, and end the cycle.
9. **Ship ONE commit.** The handoff doc gets ≤3 lines in the same commit. The message says what the
   user will see, plus the evidence.
10. **Exit.** The shell runs the post-ship check. If it goes red, the loop stops until a human looks.

## Nothing queued: discovery

Assess the project against GOAL.md's axes, **with evidence**: a `file:line`, a reproduction, a
measured number. Build only what is real, has a measurable "done", and can be verified. If nothing
clears that bar (and "add tests to module X" never does), make NO commit, print why, and exit.
**An idle, honest cycle beats a churn commit.**

## Hard limits: never without a human

<the project's invariants> · no secrets in the repo or logs · `--no-verify` never.
