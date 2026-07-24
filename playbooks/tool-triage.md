# Playbook — tool triage: keep the nugget, skip the sprawl

**The trap:** a shiny new tool, skill, library, or framework shows up (2k stars, great README) and the
reflex is to install it. But every dependency you adopt is a *standing* cost — setup, tokens, surface
area, one more thing to hold in your head. Most new tools largely duplicate something you already have;
the real value is usually one idea, not the whole package.

## The move
Before adopting anything, run it through three gates:

1. **Overlap.** What do I *already* have that does most of this — a built-in feature, an existing skill,
   a habit? If the answer is "most of it," the bar for adding the rest is high.
2. **The nugget.** What's the *one* genuinely novel part? Extract that — a checklist, a pattern, a single
   function — and fold it into what you already run. You usually don't need the wrapper.
3. **Standing cost.** Adopting it adds tokens / setup / a line in every future session's mental model. Is
   the novel part worth that *recurring* cost, or just interesting once?

Adopt the whole thing only when the novel part is load-bearing *and* nothing you own comes close. Otherwise:
**take the idea, leave the dependency.** You can usually read the docs and lift the nugget without
installing anything — reversible-by-default beats a standing install you'll forget to remove.

## Why this is a work-ethic issue, not just taste
Tool sprawl is a slow tax on focus. Each addition feels free; the pile isn't. A disciplined senior treats
"should we add this?" as a real decision with a default of **no** — the same instinct as the planning
Compass ([`planning.md`](planning.md)). Fewer, better-understood tools beat a kitchen sink every time.

## Anti-patterns
- **Star-driven adoption.** Popularity ≠ fit for *your* stack. Evaluate against what you run, not the world.
- **Benchmark trust.** Self-reported numbers from a tool's own authors are marketing until independently
  checked. Grain of salt.
- **Install-to-evaluate.** Installing just to look is how sprawl accretes. Read first; adopt deliberately.

## Use it in one line
*What do I already have that overlaps, what's the single novel nugget, and is it worth a standing cost?*
Take the nugget; default to skipping the install.
