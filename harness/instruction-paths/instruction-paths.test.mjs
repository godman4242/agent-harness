// node --test harness/instruction-paths/   — zero dependencies.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extract, check, problems } from './instruction-paths.mjs';

const ROOTS = ['src', 'scripts'];

test('extract: keeps path-ish backticked tokens, drops :line suffixes', () => {
  assert.deepEqual(extract('see `src/a.js:12` and `docs/b.md:3-9`', ROOTS), ['src/a.js', 'docs/b.md']);
});

test('extract: skips bare names, ~ paths, URLs, prose with spaces', () => {
  const t = '`a.js` `~/.claude/x.md` `https://x.io/a.md` `npm run build` `git@github.com:a/b.git`';
  assert.deepEqual(extract(t, ROOTS), []);
});

test('extract: an extensionless token counts only under a declared root or with a trailing slash', () => {
  assert.deepEqual(extract('`scripts/gate` `docs/loop/` `foo/bar`', ROOTS), ['scripts/gate', 'docs/loop/']);
});

test('extract: .jsx is a path (React repos)', () => {
  assert.deepEqual(extract('`src/pages/Study.jsx`', ROOTS), ['src/pages/Study.jsx']);
});

function repo(files) {
  const d = mkdtempSync(join(tmpdir(), 'ipaths-'));
  execFileSync('git', ['init', '-q', d]);
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(d, p, '..'), { recursive: true });
    writeFileSync(join(d, p), body);
  }
  return d;
}

test('check: a dead path is reported with the file that names it; a live one is not', () => {
  const d = repo({ 'CLAUDE.md': 'use `src/live.js` not `src/gone.js`', 'src/live.js': '' });
  const r = check(d, { files: ['CLAUDE.md'], roots: ROOTS.slice(0, 1) });
  assert.deepEqual(r.dead, ['CLAUDE.md -> src/gone.js']);
  assert.deepEqual(problems(r), ['names a path that does not exist: CLAUDE.md -> src/gone.js']);
  rmSync(d, { recursive: true });
});

test('check: a nested rule file may name paths relative to its own folder; a wrong one is still dead', () => {
  const d = repo({ 'src/lib/CLAUDE.md': 'see `guide/dock.js` and `guide/gone.js`', 'src/lib/guide/dock.js': '' });
  const r = check(d, { files: ['src/lib/CLAUDE.md'], roots: ['src'] });
  assert.deepEqual(r.dead, ['src/lib/CLAUDE.md -> guide/gone.js']);
  rmSync(d, { recursive: true });
});

test('check: a gitignored path is skipped and counted, never reported dead', () => {
  const d = repo({ 'CLAUDE.md': 'study `reference/a.md` and `src/x.js`', '.gitignore': 'reference/\n', 'src/x.js': '' });
  const r = check(d, { files: ['CLAUDE.md'], roots: ['src'] });
  assert.deepEqual(r.ignoredSkipped, ['reference/a.md']);
  assert.deepEqual(problems(r), []);
  rmSync(d, { recursive: true });
});

test('check: a file with no tokens, a missing file, and a missing root are all problems', () => {
  const d = repo({ 'CLAUDE.md': 'no paths here', 'src/x.js': '' });
  const r = check(d, { files: ['CLAUDE.md', 'GONE.md'], roots: ['src', 'lib'] });
  assert.deepEqual(problems(r), [
    'config names an instruction file that does not exist: GONE.md',
    'CLAUDE.md yielded no path tokens — the extractor is broken, or the file moved',
    'roots entry `lib` does not exist — a top-level directory was renamed',
  ]);
  rmSync(d, { recursive: true });
});

test('check: outside a git repo it FAILS CLOSED instead of guessing', () => {
  const d = mkdtempSync(join(tmpdir(), 'ipaths-nogit-'));
  writeFileSync(join(d, 'CLAUDE.md'), 'see `src/x.js`');
  mkdirSync(join(d, 'src')); writeFileSync(join(d, 'src/x.js'), '');
  const r = check(d, { files: ['CLAUDE.md'], roots: ['src'] });
  assert.ok(r.gitError, 'expected a git error');
  assert.match(problems(r)[0], /git check-ignore could not run/);
  rmSync(d, { recursive: true });
});
