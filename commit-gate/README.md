# Commit gate — make "done" mean *verified* (Level 4)

**The problem:** an agent says "done — tests pass." Did they? "Done" is just a word until something
external checks it. This is the biggest gap between a good setup and a top-tier one.

**The fix:** a **pre-commit hook** (a script git runs before it records a commit) that runs your
build / tests / lint and **refuses the commit if any fail**. Now the agent can't tell you it's done
when it's broken — the gate is the evidence. *(Coding projects only; skip this level otherwise.)*

## Install (per project, ~30 seconds)

```bash
# from your project root:
mkdir -p .githooks
cp /path/to/agent-harness/commit-gate/pre-commit.template .githooks/pre-commit
chmod +x .githooks/pre-commit
git config core.hooksPath .githooks     # tell git to use this folder for hooks
```

Then open `.githooks/pre-commit` and set the three commands at the top for your stack (Node, Python,
Rust, Go examples are in the file). Leave a command empty (`""`) to skip that step.

## What it does

- **Fast-fail:** runs build → tests → lint in order and stops at the first failure, printing the last
  lines of the log so you see why.
- **Docs-only fast-path:** if every staged file is markdown, it skips the gate (docs can't break a
  build) so writing stays instant.
- **CI-aware:** skips itself when `$CI` is set, so your CI pipeline (which runs its own checks) isn't
  double-charged.

## VERIFY it's live

```bash
# Deliberately break something, try to commit — it should be REFUSED:
echo "syntaxerror(" >> some_source_file   # (pick a real file in your project)
git add some_source_file && git commit -m "should fail"
# Expect: "❌ build FAILED — commit aborted". Then undo:
git restore --staged some_source_file && git checkout -- some_source_file
```

If the broken commit was blocked, the gate works. Now "done" is enforced, not promised.

## Notes

- **Emergency bypass:** `git commit --no-verify` skips the gate. Use sparingly — it ships unverified.
- **CI still matters.** A local gate catches things before they leave your machine, but it isn't a
  substitute for CI actually blocking a merge/deploy. If your deploy ships regardless of CI, close
  that loop too — a green local gate that a red CI can't stop is a false sense of safety.
- **This is Level 4** in [`../SETUP-LEVELS.md`](../SETUP-LEVELS.md). It works best on top of Levels 1–2
  (the profile + enforcement hook) so the agent is already verifying before it even reaches the gate.
