# Playbook — crash resilience (surviving cut-offs mid-work)

Sessions die mid-flight: usage limits, crashes, closed laptops. Anything living only in the chat
dies with it. The deeper failure: multi-agent runs that burn an hour of tokens and report **nothing**
because the synthesis step never ran. This playbook makes a cut-off cost minutes, not the session.

## The four moves

1. **Open a session log FIRST, update it per milestone.** Before heavy work starts, create
   `docs/sessions/<date>-<topic>-SESSION-LOG.md` with three sections: *the ask* (verbatim intent),
   *state so far*, *NEXT ACTIONS*. Update it the moment each milestone lands — never "at the end"
   (the end is exactly what a crash deletes). A fresh session reads it top-to-bottom and continues
   from NEXT ACTIONS.
2. **Commit documents the moment they're stable.** Docs-only commits are cheap (if you run a
   build/test commit gate, exempt markdown-only changes — markdown can't break a build). Durability
   beats tidiness; you can squash later.
3. **Record every background run's ID + exact resume command *at launch*.** Orchestrated runs
   (workflows, background agents) usually cache completed steps and can resume — but only if you
   still know the run ID after the crash. Write the ID and the copy-paste resume command into the
   session log in the same breath as launching. Partial results often survive in the run's journal
   even when the run "failed" — check there before re-running anything from scratch.
4. **Never re-do what a cache will replay.** After a cut-off, resume; don't relaunch. Re-running
   completed agents from scratch is the single biggest avoidable token burn after a crash.

## Budget-aware orchestration (the prevention half)

- **Plan on the cheap model, execute on the expensive one.** Draft PRDs/specs/prompts with your
  everyday model; hand the finished, well-specified job to the premium model for the long run.
  Don't run exploratory multi-agent fan-outs on the premium model.
- **Set per-agent effort explicitly** in fan-outs. Finders/judges rarely all need max effort;
  verification passes can run a tier lower with one well-prompted skeptic instead of three.
- **Don't launch a fleet near a limit window.** If you're close to a usage reset, do the cheap
  serial work now and schedule the fleet for after the reset.

## Use it in one line

> "Heavy session: open the session log now, commit docs as they stabilize, and record every
> background run-ID + resume command in the log at launch."
