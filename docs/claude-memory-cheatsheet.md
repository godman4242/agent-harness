# Claude Code memory commands — cheatsheet

How to make Claude Code actually *know things* before it starts: the `@`-import syntax,
scoped instruction files, and the slash commands that prove what loaded. Verified against
the official docs (code.claude.com, "How Claude remembers your project", Nov 2026) and
tested on this Mac (Claude Code 2.1.310).

## The `@import` syntax (in any CLAUDE.md)

| Command | What it does | Notes |
|---|---|---|
| `@path/to/file.md` | Inline-expands another file into the CLAUDE.md that mentions it | Relative paths resolve against the file with the import, **not** the cwd |
| `@~/claude/ship-bar.md` | Absolute-path import — our ship-bar (6-point quality contract) loads in **every** project | Added to `~/.claude/CLAUDE.md` 2026-11-24 |
| `@Design\ Docs/api.md` | Import a file whose path has spaces | Backslash before **each** space; quotes do NOT work (the path is just ignored) |
| `` `@README` `` | Mentions a path without importing it | Import parsing skips backticked code spans and fenced code blocks |
| `@AGENTS.md` | Share one instructions file with Cursor/Codex/Copilot in a repo that also has a CLAUDE.md | Never loads twice — safe with every **Project instructions** setting |

Rules of thumb: imports nest up to **4 hops deep**; imported files load *together with* the
importing file (they cost context — don't use imports to "save tokens"). An import in a
**project** file that resolves outside the working directory (e.g. your home folder) asks
for one-time approval; imports in **user-scope** files (`~/.claude/CLAUDE.md`,
`~/.claude/rules/`) load without asking because you wrote those yourself.

## Where instruction files live (load order: broadest → most specific)

| File | Loads | Scope |
|---|---|---|
| `~/.claude/CLAUDE.md` | Every session, every project | You, all projects |
| `~/.claude/rules/*.md` | Every session (can add `paths:` frontmatter to scope by glob) | You, all projects |
| `./CLAUDE.md` or `./.claude/CLAUDE.md` | Every session with cwd at or under it | Project, committed — share with the team |
| `./CLAUDE.local.md` | Same as project CLAUDE.md but personal | Add to `.gitignore` |
| `./.claude/rules/*.md` (+ `paths:` frontmatter) | Launch, or only when Claude touches a matching file (that's the point of `paths:`) | Project |
| `sub-dir/CLAUDE.md` | **On demand** — loads the first time Claude reads/writes a file in that subdirectory | Part of the project |

Everything **concatenates** (root down to cwd — so the closest file's rules are read last);
nothing overrides anything, so keep the layers consistent.

`AGENTS.md` is read automatically **only** when there is no CLAUDE.md/CLAUDE.local.md in
the working directory or above it. Change the mix in `/config` → **Project instructions**
(`claude-md-or-agents-md` default · `claude-md-and-agents-md` · `claude-md` · `managed-only`).

## The slash commands that prove what loaded

| Command | What it does |
|---|---|
| `/context all` | Lists every loaded memory file under **Memory files** — the real proof an import works (subdirectory CLAUDE.md won't appear; they're lazy) |
| `/memory` | Opens every CLAUDE.md / CLAUDE.local.md / memory file for editing across scopes; also toggles auto memory |
| `/init` | Generates a starter project CLAUDE.md by analyzing the repo (won't overwrite — suggests improvements) |
| `/doctor prompt-audit` | Audits all instruction files for stale, conflicting, or dead-reference content; proposes edits, changes nothing until you approve (v2.1.283+) |
| `/config` | Settings panel — including **Project instructions** (the AGENTS.md switch above) |

## Claude's own memory (auto memory)

Claude writes `~/.claude/projects/<project>/memory/` — a `MEMORY.md` index (first 200
lines / 25 KB load at session start) plus topic files it reads on demand. Toggle with the
`/memory` auto-memory switch, or `"autoMemoryEnabled": false` in settings, or
`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`. Machine-local (not synced), shared across all
worktrees of the same repo.

## The one-liner that bit us (2026-11-02, fixed 2026-11-24)

`~/.claude/ship-bar.md` existed but nothing imported it — so it silently never loaded in
any session. **Check your imports:** a memory file that nothing references is decoration.
Audit quickly with `grep -rc "ship-bar" ~/.claude/CLAUDE.md` (0 = it's dead weight) and
`/doctor prompt-audit` in any session.

## Related: JClaw ↔ Claude Code note

When running Claude Code *through* JClaw's ACP bridge, the harness's cwd differs — see
`JClaw Settings → Coding → acp.workdir` and JClaw guide §[Subagents](https://jclaw.ai/guide#subagents).
Project instructions load only if the harness's working directory is the project root.