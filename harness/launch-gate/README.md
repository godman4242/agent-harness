# launch-gate — the checks that decide whether a site is safe to be public

Every popular "things to do before you launch your vibecoded site" checklist is a **legal and
accessibility** list. Privacy policy, cookie banner, alt text, colour contrast, T&Cs. Those matter.
But not one of them is a security control, and the things that actually destroy a site built this
way are all missing from them:

| What the checklists say | What actually takes sites down |
| --- | --- |
| add a cookie policy | a secret key baked into the browser bundle |
| check your 3rd-party embeds | a database table with Row Level Security switched off |
| fix colour contrast | a `Content-Security-Policy` that was never turned on |

So this gate does both halves, and puts the security half first. It is **zero-dependency Node**
(`node launch-gate.mjs`), because a gate that needs an install is a gate you skip.

## The six checks

| Check | Fails when | Why it is first-class |
| --- | --- | --- |
| `secrets` | a vendor-prefixed credential (`sb_secret_`, `sk-`, `sk_live_`, `AIza`, `AKIA`, `ghp_`, `xox*`, a PEM private key, or a `service_role` JWT) appears in your client sources or in what ships — or a `VITE_`/`NEXT_PUBLIC_`-style variable holds one, or a `.env` is committed | this is the one that ends you, and it is completely mechanical to catch |
| `rls` | any table in your migrations has RLS off, **or** RLS on with zero policies | your publishable key is *meant* to be public, so RLS is the only thing between a stranger and the data. RLS-on-no-policies is the trap: it reads as protected and is merely broken |
| `headers` | the live response is missing CSP / HSTS / nosniff / frame-options / referrer-policy / permissions-policy — **or CSP is `Report-Only`**, which blocks nothing | a Report-Only CSP with no `report-uri` blocks nothing and reports nowhere. It is decoration that looks like armour |
| `thirdParties` | the shipped bundle can reach a host that is not declared in the config with a stated `basis` — or a declared host receives personal data with no `consent` recorded | "check your 3rd-party embeds" made decidable. An undeclared origin is an *undecided* one |
| `legal` | the policy **words** are absent from what ships | a route table lies: an SPA serves `index.html` for `/privacy` whether the page exists or not. The honest test is whether the text is in what the browser downloads |
| `a11y` | no accessibility checker is installed or wired up | it deliberately does **not** reimplement axe. A hand-rolled `grep alt=` is exactly the false pass that lets you believe you checked |

## Running it

```sh
node launch-gate.mjs            # static + live (fetches the deployed site)
node launch-gate.mjs --static   # source and build only: no network, fast
node launch-gate.mjs --json     # machine-readable
node launch-gate.mjs --list     # which checks are on; touches nothing
```

Exit `0` clean, `1` failures, `2` aborted (no config, bad JSON).

Copy `launch-gate.config.example.json` to `launch-gate.config.json` in the project root and fill it
in. `warn`-severity entries print without failing — that is how "a refund policy is not applicable
until you take payments" is recorded *as a decision* rather than silently skipped.

⛔ **Not a pre-commit hook.** The full run needs the network and the deployed site. It is a **launch
gate**: run it before you deploy, and after any change to auth, tables, env vars or third parties.
`--static` is fast and offline if you do want it earlier.

## Fail-closed, on purpose

A gate that reports "0 problems" because it read nothing is worse than no gate — you now believe
something false. So every unreadable input is a **failure**, never a skip:

- `clientSources` resolving to nothing, or scanning 0 files → fail
- migrations directory missing, or containing no `.sql`, or parsing to no tables → fail
- no `dist/` and no reachable `liveUrl` → fail, and it says which checks read nothing
- the live fetch throwing → fail, naming the URL

The header line always prints what was actually inspected (`live <url> (N assets)` or
`dist (N files)`), so a run that covered nothing cannot look like a clean one.

## Tests

`node --test harness/launch-gate/launchGateLib.test.mjs` — 36 tests, zero dependencies.

Every check is red-proofed in pairs: a bad fixture must produce the finding and a good fixture must
not. Seven chaos plants (one per judgement) were each confirmed to turn the suite RED **on a failed
test, with the module still loading** — a plant that only breaks the syntax proves nothing, because
then the runner is reporting a load error rather than a caught defect.
