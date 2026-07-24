# Playbook — divergent thinking: frames before you converge

**The trap:** autoregressive models — and tired humans — *converge too early*. The first plausible idea
becomes the answer, and everything after it just rationalizes that first guess. Asking "give me a few
options" rarely helps: the options cluster around the same anchor. You don't need more ideas from one
viewpoint — you need ideas from *different* viewpoints.

## The move
At a genuinely open-ended fork — a design decision, a name, an API shape, a fuzzy bug with many possible
causes — **don't answer from a single perspective.** Pick 3–4 frames below that fit the problem, generate
one idea *from inside each frame*, then converge: cluster them, prune the traps, deepen the survivor.
Show the human the **labelled** options ("the 10-year-old view", "the competitor-breaking-it view")
*before* your pick — so they see the roads not taken, not just the destination.

## The frames — deliberately distorted lenses
Each one warps the problem so you notice what the default view hides:

- **Hardware engineer** — latency, memory layout, physical limits
- **Regulator / auditor** — what must be provable, traceable, refusable
- **10-year-old** — naive; ignores "how it's done"
- **Competitor trying to break it** — adversarial; find the failure first
- **Biology** — immune systems, plasticity, cell signaling
- **Logistics** — queues, batching, just-in-time, hub-and-spoke
- **Game design** — loops, rewards, friction, speedrun tricks
- **Markets** — auctions, futures, clearing houses
- **Inversion** — ask the opposite question, then negate the answer
- **$0 / infinite budget** — extremes break anchoring assumptions
- **Remove the load-bearing assumption** — what if there's no framework / DB / network?
- **Speedrunner** — glitches, skips, frame-perfect shortcuts
- **Ant colony / swarm** — no central planner, only local rules
- **3am on-call** — design so nobody gets paged at night

## When NOT to reach for it
Narrow, mechanical, or already-decided work — a rename, a known fix, a typo. Running frames on those is
theatre: it burns effort and buries the answer. Use it only where the solution space is genuinely wide.

## Use it in one line
*Am I anchored on my first idea? Name 3 frames that would see this differently, take one option from each,
then prune.* If every frame lands on the same answer, you can converge with confidence.

---
*Frames adapted from the open-source ADHD reasoning framework (github.com/UditAkhourii/adhd, MIT) — a
diverge-then-converge agent harness. This playbook is the manual, zero-dependency version of the same idea:
you don't need the tool to use the technique.*
