# Playbook — decision hygiene: steelman, then red-team your own pick

**The trap:** the first defensible option becomes "the decision," and everything after it is just
justification. You present it confidently, the reasoning never gets stress-tested, and the weakness
surfaces three weeks later as rework. Confidence is not correctness.

## The move
Before committing to any consequential, hard-to-reverse choice, run four quick passes:

1. **Steelman the alternative.** State the *strongest* version of the option you're about to reject — not
   a strawman you can knock over. If you can't argue it well, you don't understand your own pick yet.
2. **Red-team your pick.** Attack your preferred option: What has to be true for it to work? What's the
   hidden dependency, the failure mode, the cost that shows up later? Where does "cheap and shippable"
   quietly beat "correct-but-heavy" — or vice versa?
3. **Check the ordering.** Does this depend on something not built yet? Are you about to do step 3 before
   step 1 exists? A right decision in the wrong order still stalls.
4. **Show your work.** Put the steelman + the red-team in the reply, not just the conclusion. Whoever
   decides or reviews then sees the road not taken and can veto *with context*. A recommendation stripped
   of its rejected alternatives is a decision made *for* them, not *with* them.

## The one-line checklist
*Strongest case for the other option? · What kills my pick? · Does anything have to happen first? · Did I
show both, or just the winner?*

## When NOT to bother
Small, cheap, reversible calls — a variable name, a one-line config. Red-teaming a two-minute reversible
decision is procrastination in a lab coat. Reserve this for choices expensive to unwind: architecture,
dependencies, data models, anything public-facing or hard to migrate off.

## Why it pairs with the rest
This decides *what* to do well; [`proof-discipline.md`](proof-discipline.md) verifies you *did* it right;
[`planning.md`](planning.md)'s stop-rule says when to *abandon* a decision the evidence has killed. Same
spine: honest updating over confident momentum.

## Use it in one line
*Before you commit: argue the other side's best case, then try to break your own — and show both.*
