#!/usr/bin/env node
// LAUNCH GATE — the checks that decide whether a site is safe to be public.
//
// It exists because the popular "before you launch" checklists are legal and accessibility
// lists with no security on them at all, and because a checklist in a document is a wish.
// This is the same wish, written so it can go RED.
//
//   node launch-gate.mjs            static checks + live checks (needs network)
//   node launch-gate.mjs --static   source and build only — no network, fast, pre-commit safe
//   node launch-gate.mjs --json     machine-readable findings on stdout
//   node launch-gate.mjs --list     print which checks are enabled and touch nothing
//
// Reads ./launch-gate.config.json (see launch-gate.config.example.json).
//
// FAIL-CLOSED: if a check is enabled and its input cannot be read, that is a FAILURE,
// not a skip. A gate that reports "0 problems" because it read nothing is worse than none.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { extname, join, relative, resolve } from 'node:path'
import {
  SEVERITY, auditA11yTooling, auditHeaders, auditLegalMarkers, auditRls, auditThirdParties,
  classifySupabaseKey, extractOrigins, findSecrets, rlsFindings, summarise,
} from './launchGateLib.mjs'

const ROOT = process.cwd()
const args = process.argv.slice(2)
const FLAG = { static: args.includes('--static'), json: args.includes('--json'), list: args.includes('--list') }
const CONFIG_PATH = join(ROOT, 'launch-gate.config.json')

const findings = []
const add = (f) => findings.push(f)
const fail = (check, message, evidence) => add({ check, severity: SEVERITY.FAIL, message, evidence })

function abort(lines) {
  process.stderr.write(`\n❌ LAUNCH GATE ABORTED\n   ${lines.join('\n   ')}\n\n`)
  process.exit(2)
}

if (!existsSync(CONFIG_PATH)) abort([`no launch-gate.config.json in ${ROOT}`, 'copy launch-gate.config.example.json and fill it in.'])
let cfg
try {
  cfg = JSON.parse(readFileSync(CONFIG_PATH, 'utf8'))
} catch (e) {
  abort([`launch-gate.config.json is not valid JSON: ${e.message}`])
}

const CHECKS = { secrets: true, rls: true, headers: true, thirdParties: true, legal: true, a11y: true, ...(cfg.checks || {}) }
if (FLAG.list) {
  process.stdout.write(`launch-gate for ${cfg.name || ROOT}\n`)
  for (const [k, v] of Object.entries(CHECKS)) process.stdout.write(`  ${v ? 'on ' : 'off'}  ${k}\n`)
  process.exit(0)
}

// ── helpers ────────────────────────────────────────────────────────────────
const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.vercel', 'coverage', 'test-results', 'playwright-report'])
const TEXT_EXT = new Set(['.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.json', '.html', '.css', '.sql', '.md', '.env', '.yml', '.yaml', ''])

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    if (SKIP_DIRS.has(e.name)) continue
    const p = join(dir, e.name)
    if (e.isDirectory()) walk(p, out)
    else if (TEXT_EXT.has(extname(e.name)) || e.name.startsWith('.env')) out.push(p)
  }
  return out
}

function readOr(path) {
  try {
    return readFileSync(path, 'utf8')
  } catch {
    return null
  }
}

// ── G1 secrets: what would be inlined into the client, plus the build output ──
if (CHECKS.secrets) {
  const roots = (cfg.clientSources || ['src', 'public', 'index.html']).map((p) => join(ROOT, p)).filter(existsSync)
  if (roots.length === 0) fail('secrets', 'clientSources resolved to nothing — the secret scan read NO files.', `looked for: ${(cfg.clientSources || ['src', 'public', 'index.html']).join(', ')}`)
  let scanned = 0
  for (const r of roots) {
    const files = statSync(r).isDirectory() ? walk(r) : [r]
    for (const f of files) {
      const t = readOr(f)
      if (t == null) continue
      scanned++
      for (const x of findSecrets(t, relative(ROOT, f))) add(x)
    }
  }

  // Anything a bundler inlines by prefix is public by construction.
  const envFiles = ['.env', '.env.local', '.env.production', '.env.development'].map((f) => join(ROOT, f)).filter(existsSync)
  const publicPrefixes = cfg.publicEnvPrefixes || ['VITE_', 'NEXT_PUBLIC_', 'PUBLIC_', 'REACT_APP_', 'EXPO_PUBLIC_']
  for (const f of envFiles) {
    for (const line of (readOr(f) || '').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/)
      if (!m) continue
      const [, key, rawVal] = m
      const val = rawVal.replace(/^["']|["']$/g, '')
      if (!publicPrefixes.some((p) => key.startsWith(p))) continue
      for (const x of findSecrets(val, `${relative(ROOT, f)} → ${key}`)) add({ ...x, message: `${key} holds a secret, and its prefix means ANY build run from this directory bakes it into the browser bundle. ${x.message} (Whether it is live right now depends on the deploy's own env — check the shipped-bundle findings below before concluding either way.)` })
      if (classifySupabaseKey(val) === 'secret' || classifySupabaseKey(val) === 'service_role') {
        fail('secrets', `${key} holds a Supabase SECRET key and its prefix makes it public — this ships full database access to every visitor.`, relative(ROOT, f))
      }
    }
  }

  // An env file that is committed is a leak no scan of src/ will ever find.
  try {
    const tracked = execFileSync('git', ['ls-files', '--', '.env', '.env.*'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (tracked) for (const f of tracked.split('\n')) if (!/\.example$|\.sample$|\.template$/.test(f)) fail('secrets', `${f} is committed to git — anything ever put in it is in the history forever.`, 'git ls-files -- .env .env.*')
  } catch {
    add({ check: 'secrets', severity: SEVERITY.WARN, message: 'could not run git ls-files, so committed .env files were not checked.', evidence: 'not a git repo, or git unavailable' })
  }
  if (scanned === 0) fail('secrets', 'the secret scan read 0 files — treating this as a failure rather than a pass.', roots.join(', '))
}

// ── G2 Row Level Security ──────────────────────────────────────────────────
if (CHECKS.rls) {
  const dir = join(ROOT, cfg.supabaseMigrations || 'supabase/migrations')
  if (!existsSync(dir)) {
    fail('rls', `migrations directory not found, so RLS was NOT verified: ${relative(ROOT, dir)}`, 'set checks.rls to false if this project has no Supabase database')
  } else {
    const sqlFiles = walk(dir).filter((f) => extname(f) === '.sql')
    if (sqlFiles.length === 0) fail('rls', `no .sql files under ${relative(ROOT, dir)} — RLS was NOT verified.`, 'fail-closed: an empty read is not a pass')
    const sql = sqlFiles.map((f) => readOr(f) || '').join('\n')
    const rows = auditRls(sql)
    if (rows.length === 0 && sqlFiles.length > 0) fail('rls', 'migrations were read but no CREATE TABLE was recognised — the parser found nothing to check.', `${sqlFiles.length} .sql file(s) read`)
    for (const x of rlsFindings(rows)) add(x)
  }
}

// ── G3/G4/G5: what actually ships, and what the live server sends ──────────
const distDir = join(ROOT, cfg.dist || 'dist')
let shipped = ''
let shippedFrom = ''

async function fetchLive() {
  const url = cfg.liveUrl
  if (!url) {
    fail('headers', 'no liveUrl in config, so the live headers were NOT checked.', 'add liveUrl, or set checks.headers to false')
    return null
  }
  const res = await fetch(url, { redirect: 'follow' })
  const headers = {}
  for (const [k, v] of res.headers) headers[k.toLowerCase()] = v
  const html = await res.text()
  const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1])
  let body = html
  for (const a of assets.slice(0, 12)) {
    try {
      body += '\n' + (await fetch(new URL(a, url)).then((r) => r.text()))
    } catch {
      /* one asset failing is reported by the origin check below, not fatal here */
    }
  }
  return { headers, body, assetCount: assets.length }
}

const run = async () => {
  if (!FLAG.static) {
    let live = null
    try {
      live = await fetchLive()
    } catch (e) {
      fail('headers', `could not reach the live site, so headers and the live bundle were NOT checked: ${e.message}`, cfg.liveUrl || '(no liveUrl)')
    }
    if (live) {
      if (CHECKS.headers) for (const x of auditHeaders(live.headers)) add(x)
      shipped = live.body
      shippedFrom = `live ${cfg.liveUrl} (${live.assetCount} asset(s))`
    }
  }

  if (!shipped) {
    if (existsSync(distDir)) {
      const files = walk(distDir).filter((f) => ['.js', '.html', '.css'].includes(extname(f)))
      shipped = files.map((f) => readOr(f) || '').join('\n')
      shippedFrom = `${relative(ROOT, distDir)} (${files.length} file(s))`
    }
  }

  const needShipped = CHECKS.thirdParties || CHECKS.legal || (CHECKS.secrets && !FLAG.static)
  if (needShipped && !shipped) {
    fail('shipped', 'no shipped output to inspect — third-party, legal and live-secret checks read NOTHING.', `build first (so ${cfg.dist || 'dist'} exists), or pass a reachable liveUrl`)
  }

  if (shipped) {
    if (CHECKS.secrets) for (const x of findSecrets(shipped, shippedFrom)) add(x)
    if (CHECKS.thirdParties) {
      const origins = extractOrigins(shipped).filter((h) => !(cfg.ownHosts || []).some((o) => h === o || h.endsWith(`.${o}`)))
      for (const x of auditThirdParties(origins, cfg.thirdParties || [])) add(x)
    }
    if (CHECKS.legal) for (const x of auditLegalMarkers(shipped, cfg.legal || [])) add(x)
  }

  // ── G6 accessibility tooling ─────────────────────────────────────────────
  if (CHECKS.a11y) {
    const pkgText = readOr(join(ROOT, 'package.json'))
    if (!pkgText) fail('a11y', 'no package.json, so accessibility tooling was NOT checked.', ROOT)
    else {
      const eslintText = ['eslint.config.js', 'eslint.config.mjs', '.eslintrc.json', '.eslintrc.cjs', '.eslintrc.js']
        .map((f) => readOr(join(ROOT, f)) || '').join('\n')
      for (const x of auditA11yTooling({ packageJson: JSON.parse(pkgText), eslintConfigText: eslintText })) add(x)
    }
  }

  // ── report ───────────────────────────────────────────────────────────────
  const { fails, warns, ok } = summarise(findings)
  if (FLAG.json) {
    process.stdout.write(JSON.stringify({ name: cfg.name || ROOT, mode: FLAG.static ? 'static' : 'full', shippedFrom, ok, fails, warns }, null, 2) + '\n')
    process.exit(ok ? 0 : 1)
  }

  const w = process.stdout.write.bind(process.stdout)
  w(`\nLAUNCH GATE — ${cfg.name || ROOT}  [${FLAG.static ? 'static' : 'full'}]\n`)
  w(`inspected: ${shippedFrom || '(nothing shipped read)'}\n\n`)
  const byCheck = (list) => {
    const g = new Map()
    for (const f of list) g.set(f.check, [...(g.get(f.check) || []), f])
    return g
  }
  for (const [check, list] of byCheck(fails)) {
    w(`❌ ${check.toUpperCase()}\n`)
    for (const f of list) w(`   • ${f.message}\n     ${f.evidence}\n`)
    w('\n')
  }
  for (const [check, list] of byCheck(warns)) {
    w(`⚠️  ${check.toUpperCase()}\n`)
    for (const f of list) w(`   • ${f.message}\n     ${f.evidence}\n`)
    w('\n')
  }
  w(ok ? `✅ ${warns.length} warning(s), 0 failures — safe to be public on these checks.\n\n` : `❌ ${fails.length} failure(s), ${warns.length} warning(s).\n\n`)
  process.exit(ok ? 0 : 1)
}

run().catch((e) => abort([`unexpected error: ${e.stack || e.message}`]))
