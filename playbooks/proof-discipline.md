# Playbook — proof discipline (evidence so strong the work can't lie to you)

"Evidence, not assertion" (the profile rule) says every *done* needs a check that can fail. This
playbook is the heavy-duty version for long builds — recreations, migrations, anything where "looks
right" and "is right" quietly diverge. Distilled from a multi-session game-recreation build where
every one of these moves caught at least one real bug the others missed.

## The moves

1. **Binary stage gates, signed off with pasted evidence.** Slice the build into stages; each stage
   gets a checklist where every box is a *binary observable* (a number, a screenshot, a state read —
   never "works well"). The stage closes only at 100%, and the sign-off pastes the evidence next to
   each box in the handoff doc, not the chat (chat dies; docs survive). Never start stage N+1 with
   an unchecked box in stage N.

2. **Red-first tests, and chaos-proof every guard.** Watch each new test fail before implementing —
   an import error doesn't count as red; stub the module so the test fails on its *assertion*, then
   build. For protective guards (input validators, purity/boundary checks, lint gates): **plant the
   failure → watch red → remove the plant → watch green.** A guard you've never seen fire is a
   decoration. Re-plant after any refactor that touches the guard.

3. **Double-entry pins for load-bearing constants.** Every contract value lives in its config file
   AND in a pin test asserting the exact value. Changing one without the other fails the build. That
   friction is the point — a "harmless retune" now requires a deliberate two-file diff that reviews
   itself.

4. **Ratchet baselines with RED receipts.** For debt you can't zero today (stray literals, lint
   counts), commit a per-file baseline: anything *new or substituted* fails; removals pass. Refresh
   the baseline only through an explicit env-var path, and only after capturing the failing output
   first — the RED receipt proves the ratchet still bites. Review the baseline diff like code; never
   regenerate it to bless a value you haven't read.

5. **Log decisions where a future session can veto them.** Decide-and-flag (profile rule) plus a
   ledger: every deviation from spec/contract gets one entry — what, why, and a one-line veto path
   ("revert file X + pin Y in one commit"). A decisions ledger a fresh session can act on beats a
   judgment call buried in an old chat.

6. **Audit findings are claims until refuters fail.** In multi-agent audits, route every finding
   through independent refuter passes before calling it confirmed. And treat any verifier that
   *died* (quota, crash, timeout) as UNVERIFIED — never as "found nothing." An empty result list
   from a dead fleet is an artifact; check the failure list before accepting a clean bill.

7. **Drive the real thing through a dev seam.** Unit tests prove the logic; only driving the running
   app proves the wiring. Ship a dev-only handle (a window global, a debug endpoint — stripped from
   production builds) so automation can *step the app deterministically* and read real state:
   browsers throttle background tabs, so manual frame-stepping through the seam is what makes
   measurements exact instead of flaky. Numbers read from live state beat eyeballing screenshots;
   capture both.

8. **Milestone commits carry their own handoff.** Each milestone lands as one gate-green commit:
   code + tests + the refreshed resume/handoff doc + the session-log entry together (see
   `handoff.md`). If the commit message claims green, the gate output was pasted, not remembered.

## Smells that mean a move got skipped

- "Tests pass" with no pasted output · a test that passed on its first-ever run · a guard nobody has
  seen red · a baseline refreshed "to get CI green" · an audit that came back suspiciously clean
  after agents crashed · a demo verified only by screenshots · a milestone commit whose handoff doc
  went stale.

## Use it in one line

> "Proof discipline: binary gates with pasted evidence, red-first + chaos-proof guards, double-entry
> pins, RED-receipt ratchets, a veto-able decisions ledger, refuter-verified audits, dev-seam
> verification, handoff-in-the-same-commit."
