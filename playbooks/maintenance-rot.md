# Playbook — setup rot (your agent setup has an expiration date)

Every layer of an agent setup decays — at different speeds. Rules written for last quarter's model
over-prescribe today's. Skills tuned on old edge cases mislead. A pointer file naming a dead tool
poisons every session that loads it. Rot is invisible until the agent confidently follows a stale
instruction — the worst failure mode, because it *looks* like obedience.

## Rot rates by layer (fastest → slowest)

| Layer | Typical rot driver | Expect to touch |
|---|---|---|
| Agent/role definitions & model-specific prompts | every model release changes behavior | per model release |
| Skills / slash-commands | edge cases + smarter models needing less instruction | ~monthly |
| Tools / MCP / CLI wiring | API + ecosystem churn | when a provider changes |
| Rules & hooks | new failure modes discovered in use | occasionally |
| Identity / profile (CLAUDE.md, soul file) | who you are changes slowly | rarely — keep it a lean pointer layer |

## The three moves

1. **Keep a rot ledger.** One small file (e.g. `ROT.md`, pointed at from your profile) listing each
   layer, its expected rot rate, and its *last-reviewed* date. Cheapest to write right after you
   build the setup — not months later when you've gone comfortable.
2. **Schedule a prune pass.** A recurring (weekly/monthly) session whose only job: walk the ledger,
   test the stalest items against current reality, shorten anything a smarter model no longer
   needs, and **log every change** so a regression can be traced to a prune.
3. **Date your corrections.** When a fact changes (a tool returns, an access revokes, a model
   deprecates), don't silently edit — supersede with a dated note ("✅ X returned 2026-07-02,
   supersedes the block below"). Future sessions then trust the newest dated block instead of
   guessing which line is current.

## The test

If you can't answer "when did I last verify this instruction still helps?" for a rule the agent
loads every session — that rule is rot until proven otherwise.

## Use it in one line

> "Add a ROT.md ledger with per-layer review dates, and give me a recurring prune pass that tests
> the stalest instructions against current model behavior."
