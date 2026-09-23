// LAUNCH GATE — pure checks. No filesystem, no network, no process: every function
// here takes text in and returns findings out, so each one is testable on a fixture.
//
// A finding is { check, severity, message, evidence }. severity 'fail' fails the gate;
// 'warn' is printed and does not. Nothing here decides *policy* — the runner does.

export const SEVERITY = { FAIL: 'fail', WARN: 'warn' }

// ── G1: secrets that must never reach a browser ────────────────────────────
// Only patterns with a distinctive prefix. A generic "long random string" rule would
// fire on every minified bundle and train you to ignore the gate.
export const SECRET_RULES = [
  { id: 'supabase-secret', re: /\bsb_secret_[A-Za-z0-9_-]{8,}/g, why: 'Supabase secret key — bypasses Row Level Security, full read/write on every table.' },
  { id: 'openai', re: /\bsk-(?:proj-|ant-)?[A-Za-z0-9_-]{24,}/g, why: 'OpenAI/Anthropic-style secret key.' },
  { id: 'stripe-live', re: /\bsk_live_[A-Za-z0-9]{10,}/g, why: 'Stripe live secret key.' },
  { id: 'google-api', re: /\bAIza[A-Za-z0-9_-]{35}\b/g, why: 'Google API key.' },
  { id: 'aws-access-key', re: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/g, why: 'AWS access key id.' },
  { id: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{36,}/g, why: 'GitHub token.' },
  { id: 'slack-token', re: /\bxox[abprs]-[A-Za-z0-9-]{10,}/g, why: 'Slack token.' },
  { id: 'private-key', re: /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP )?PRIVATE KEY-----/g, why: 'Private key material.' },
]

const JWT_RE = /\beyJ[A-Za-z0-9_-]{8,}\.(eyJ[A-Za-z0-9_-]{8,})\.[A-Za-z0-9_-]{4,}/g

/** Decode a JWT payload without verifying it. Returns null if it is not decodable JSON. */
export function decodeJwtPayload(segment) {
  try {
    const b64 = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4)
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'))
  } catch {
    return null
  }
}

/**
 * Classify a Supabase-shaped credential.
 * 'publishable' and 'anon' are safe to ship — but ONLY because RLS is doing the work.
 * 'secret' and 'service_role' in shipped code is a full data breach.
 */
export function classifySupabaseKey(key) {
  if (/^sb_secret_/.test(key)) return 'secret'
  if (/^sb_publishable_/.test(key)) return 'publishable'
  const m = JWT_RE.exec(key)
  JWT_RE.lastIndex = 0
  if (!m) return 'unknown'
  const role = decodeJwtPayload(m[1])?.role
  if (role === 'service_role') return 'service_role'
  if (role === 'anon') return 'anon'
  return 'unknown'
}

function excerpt(text, index, span = 40) {
  return text.slice(Math.max(0, index - span), index + span).replace(/\s+/g, ' ')
}

/** Scan shipped text (a bundle, an html file, a source file) for credentials. */
export function findSecrets(text, source = 'input') {
  const out = []
  for (const rule of SECRET_RULES) {
    rule.re.lastIndex = 0
    for (const m of text.matchAll(rule.re)) {
      out.push({
        check: 'secrets',
        severity: SEVERITY.FAIL,
        message: `${rule.id}: ${rule.why}`,
        evidence: `${source}: …${excerpt(text, m.index)}…`,
      })
    }
  }
  JWT_RE.lastIndex = 0
  for (const m of text.matchAll(JWT_RE)) {
    const role = decodeJwtPayload(m[1])?.role
    if (role === 'service_role') {
      out.push({
        check: 'secrets',
        severity: SEVERITY.FAIL,
        message: 'service_role JWT — bypasses Row Level Security, full read/write on every table.',
        evidence: `${source}: …${excerpt(text, m.index)}…`,
      })
    }
  }
  return out
}

// ── G2: Row Level Security on every table ──────────────────────────────────
// With a publishable/anon key in the bundle (which is correct and expected), RLS is the
// ONLY thing between a stranger and the data. A table with RLS off is world-readable. RLS on
// with no policy denies every client, your own app included — broken, yet it *looks* protected —
// UNLESS the table is service-role-only by design, which it must say out loud: REVOKE ALL from
// both client roles, and no GRANT anywhere that hands a client role access back.

const IDENT = String.raw`(?:"[^"]+"|[A-Za-z_][A-Za-z0-9_$]*)`
const QUALIFIED = String.raw`(?:(${IDENT})\s*\.\s*)?(${IDENT})`
const CREATE_TABLE_RE = new RegExp(String.raw`create\s+table\s+(?:if\s+not\s+exists\s+)?${QUALIFIED}`, 'gi')
const ENABLE_RLS_RE = new RegExp(String.raw`alter\s+table\s+(?:if\s+exists\s+)?(?:only\s+)?${QUALIFIED}\s+enable\s+row\s+level\s+security`, 'gi')
const CREATE_POLICY_RE = new RegExp(String.raw`create\s+policy\s+(?:${IDENT}|'[^']*')\s+on\s+${QUALIFIED}`, 'gi')
// `revoke all` directly — so `revoke select …` and `revoke grant option for all …` never match.
const REVOKE_ALL_RE = /revoke\s+all(?:\s+privileges)?\s+on\s+(?:table\s+)?([^;]+?)\s+from\s+([^;]+)/gi
const GRANT_RE = /grant\s+[^;]*?\s+on\s+(?:table\s+)?([^;]+?)\s+to\s+([^;]+)/gi
const ALL_TABLES_IN_SCHEMA_RE = new RegExp(String.raw`^all\s+tables\s+in\s+schema\s+(${IDENT})$`, 'i')
const ONE_NAME_RE = new RegExp(String.raw`^${QUALIFIED}$`)
// Supabase grants to anon and authenticated DIRECTLY, so revoking from PUBLIC alone leaves both
// holding their privileges — while a grant TO public reaches both.
const CLIENT_ROLES = ['anon', 'authenticated']

// Postgres folds an unquoted name to lower case; a quoted one keeps its exact spelling.
const fold = (s) => (!s ? s : /^".*"$/.test(s) ? s.slice(1, -1) : s.toLowerCase())
const tableKey = (schema, name) => `${fold(schema) || 'public'}.${fold(name)}`
const roleNames = (list) => list.split(',').map((r) => fold(r.trim().split(/\s+/)[0]))
// Table names in a GRANT/REVOKE target list; anything else (a function, a schema) is skipped.
const tableNames = (list) => list.split(',').map((n) => n.trim().match(ONE_NAME_RE)).filter(Boolean).map((m) => tableKey(m[1], m[2]))

/** Strip SQL comments so a commented-out `enable row level security` cannot vouch for a table. */
export function stripSqlComments(sql) {
  return sql.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/--[^\n]*/g, ' ')
}

/** Build a per-table picture of RLS from concatenated migration SQL. */
export function auditRls(sql) {
  const clean = stripSqlComments(sql)
  const tables = new Map()
  const ensure = (k) => {
    if (!tables.has(k)) tables.set(k, { table: k, rls: false, policies: 0 })
    return tables.get(k)
  }
  for (const m of clean.matchAll(CREATE_TABLE_RE)) ensure(tableKey(m[1], m[2]))
  for (const m of clean.matchAll(ENABLE_RLS_RE)) ensure(tableKey(m[1], m[2])).rls = true
  for (const m of clean.matchAll(CREATE_POLICY_RE)) ensure(tableKey(m[1], m[2])).policies++
  // Order-free on purpose: migrations arrive concatenated, so a GRANT anywhere re-opens the table.
  const revoked = new Set()
  const granted = new Set()
  for (const m of clean.matchAll(REVOKE_ALL_RE)) {
    const roles = roleNames(m[2])
    if (CLIENT_ROLES.every((r) => roles.includes(r))) for (const t of tableNames(m[1])) revoked.add(t)
  }
  for (const m of clean.matchAll(GRANT_RE)) {
    if (!roleNames(m[2]).some((r) => r === 'public' || CLIENT_ROLES.includes(r))) continue
    const schema = m[1].trim().match(ALL_TABLES_IN_SCHEMA_RE)
    if (schema) granted.add(`${fold(schema[1])}.*`)
    for (const t of tableNames(m[1])) granted.add(t)
  }
  for (const r of tables.values()) {
    r.serviceRoleOnly = revoked.has(r.table) && !granted.has(r.table) && !granted.has(`${r.table.split('.')[0]}.*`)
  }
  return [...tables.values()].sort((a, b) => a.table.localeCompare(b.table))
}

export function rlsFindings(rows) {
  const out = []
  for (const r of rows) {
    if (!r.rls) {
      out.push({ check: 'rls', severity: SEVERITY.FAIL, message: `table ${r.table}: Row Level Security is NOT enabled — anyone holding the public key can read and write it.`, evidence: 'no `alter table … enable row level security` found in migrations' })
    } else if (r.policies === 0 && !r.serviceRoleOnly) {
      out.push({ check: 'rls', severity: SEVERITY.FAIL, message: `table ${r.table}: RLS enabled but ZERO policies — this denies your own app too, and reads as protected when it is merely broken. If it is service-role-only by design, say so: REVOKE ALL ON TABLE ${r.table} FROM anon, authenticated.`, evidence: 'no `create policy … on` found for this table, and no REVOKE ALL from both client roles without a GRANT that re-opens it' })
    }
  }
  return out
}

// ── G3: the headers the live deployment actually sends ─────────────────────
export const REQUIRED_HEADERS = [
  ['content-security-policy', 'controls what the page may load and connect to — the single biggest XSS mitigation'],
  ['strict-transport-security', 'forces HTTPS on every later visit'],
  ['x-content-type-options', 'stops MIME sniffing'],
  ['x-frame-options', 'stops clickjacking via framing'],
  ['referrer-policy', 'stops full URLs leaking to third parties'],
  ['permissions-policy', 'switches off camera/mic/geolocation you never use'],
]

/** headers: a lowercase-keyed object of the live response headers. */
export function auditHeaders(headers) {
  const out = []
  const has = (h) => typeof headers[h] === 'string' && headers[h].length > 0
  for (const [h, why] of REQUIRED_HEADERS) {
    if (h === 'content-security-policy') continue
    if (!has(h)) out.push({ check: 'headers', severity: SEVERITY.FAIL, message: `missing ${h} — ${why}.`, evidence: 'not present on the live response' })
  }
  const enforced = has('content-security-policy')
  const reportOnly = has('content-security-policy-report-only')
  if (!enforced && reportOnly) {
    const v = headers['content-security-policy-report-only']
    const reports = /report-uri|report-to/i.test(v)
    out.push({
      check: 'headers',
      severity: SEVERITY.FAIL,
      message: reports
        ? 'CSP is Report-Only — it blocks nothing. Promote it to Content-Security-Policy once the reports are clean.'
        : 'CSP is Report-Only AND has no report-uri/report-to — it blocks nothing and reports nowhere, so it is pure decoration.',
      evidence: `content-security-policy-report-only: ${v.slice(0, 120)}…`,
    })
  } else if (!enforced && !reportOnly) {
    out.push({ check: 'headers', severity: SEVERITY.FAIL, message: 'missing content-security-policy — controls what the page may load and connect to.', evidence: 'not present on the live response' })
  }
  if (enforced) {
    const v = headers['content-security-policy']
    // Only the directive that governs scripts counts: script-src, else default-src.
    const directive = (name) => v.split(';').map((d) => d.trim()).find((d) => d.toLowerCase().startsWith(`${name} `))
    if (/'unsafe-inline'/.test(directive('script-src') ?? directive('default-src') ?? '')) {
      out.push({ check: 'headers', severity: SEVERITY.WARN, message: "CSP allows 'unsafe-inline' for scripts, which removes most of its XSS value.", evidence: v.slice(0, 160) })
    }
    if (/\bhttp:\/\/(localhost|127\.0\.0\.1)/.test(v)) {
      out.push({ check: 'headers', severity: SEVERITY.WARN, message: 'CSP on the live site allows localhost origins — dev config leaked into production, unless a feature deliberately talks to a tool on the visitor’s own machine (e.g. their own local AI model). Confirm which.', evidence: v.match(/\bhttp:\/\/(?:localhost|127\.0\.0\.1)[^\s;]*/g).join(' ') })
    }
  }
  return out
}

// ── G4: every third party the page talks to must be a decision, not an accident ──
const ORIGIN_RE = /https?:\/\/([a-z0-9][a-z0-9.-]*\.[a-z]{2,})/gi

export function extractOrigins(text) {
  const out = new Set()
  for (const m of text.matchAll(ORIGIN_RE)) out.add(m[1].toLowerCase())
  return [...out].sort()
}

/**
 * hostAllowed supports one leading wildcard label: "*.supabase.co" matches "a.supabase.co".
 * Everything the shipped page can contact must appear in the config, WITH a stated basis.
 * That is the whole point: an undeclared origin is an undecided one.
 */
export function hostAllowed(host, pattern) {
  if (pattern === host) return true
  if (pattern.startsWith('*.')) return host.endsWith(pattern.slice(1)) && host !== pattern.slice(2)
  return false
}

export function auditThirdParties(origins, declared, { ignore = [] } = {}) {
  const out = []
  const names = declared.map((d) => d.host)
  for (const host of origins) {
    if (ignore.some((p) => hostAllowed(host, p))) continue
    if (!names.some((p) => hostAllowed(host, p))) {
      out.push({ check: 'third-parties', severity: SEVERITY.FAIL, message: `undeclared third-party origin: ${host} — every origin the page can contact must be listed in the config with why it is there.`, evidence: 'found in the shipped bundle/html' })
    }
  }
  for (const d of declared) {
    if (!d.basis || !String(d.basis).trim()) {
      out.push({ check: 'third-parties', severity: SEVERITY.FAIL, message: `declared origin ${d.host} has no "basis" — say why it is allowed (functional / cookieless-analytics / consent-gated).`, evidence: JSON.stringify(d) })
    }
    if (d.personalData && !d.consent) {
      out.push({ check: 'third-parties', severity: SEVERITY.FAIL, message: `${d.host} receives personal data but the config records no consent mechanism.`, evidence: JSON.stringify(d) })
    } else if (d.personalData && /^\s*(?:todo\b|tbd\b|\?+\s*$)/i.test(String(d.consent))) {
      // An open question must not vouch for itself. Writing the TODO keeps the reasoning;
      // it does not make the origin decided, so the gate stays red until it is answered.
      out.push({ check: 'third-parties', severity: SEVERITY.FAIL, message: `${d.host}: consent is still an open question — "${String(d.consent).slice(0, 110)}"`, evidence: 'a TODO records the decision to make, not a decision made' })
    }
  }
  return out
}

// ── G5: the legal surfaces, checked by their words actually shipping ───────
// Route tables lie (an SPA serves index.html for every path). The honest test is whether
// the policy TEXT is in what the browser downloads.
export function auditLegalMarkers(shippedText, required) {
  const out = []
  for (const r of required) {
    const found = r.markers.some((m) => shippedText.toLowerCase().includes(m.toLowerCase()))
    if (!found) {
      out.push({ check: 'legal', severity: r.severity === 'warn' ? SEVERITY.WARN : SEVERITY.FAIL, message: `${r.name} not found in what ships to the browser — ${r.why}`, evidence: `none of these strings appear: ${r.markers.map((m) => JSON.stringify(m)).join(', ')}` })
    }
  }
  return out
}

// ── G6: accessibility is checked by a real checker, or not at all ─────────
// This gate deliberately does NOT reimplement axe. It fails when nothing is configured,
// because a hand-rolled grep for alt="" is exactly the false-pass that lets you believe
// you checked.
export function auditA11yTooling({ packageJson = {}, eslintConfigText = '' } = {}) {
  const deps = { ...(packageJson.dependencies || {}), ...(packageJson.devDependencies || {}) }
  const known = ['eslint-plugin-jsx-a11y', 'axe-core', '@axe-core/react', '@axe-core/playwright', 'vitest-axe', 'jest-axe', 'pa11y', '@lhci/cli', 'lighthouse']
  const installed = known.filter((k) => k in deps)
  const wired = /jsx-a11y|axe|pa11y|lighthouse/i.test(eslintConfigText)
  if (installed.length === 0) {
    return [{ check: 'a11y', severity: SEVERITY.FAIL, message: 'no accessibility checker is installed — colour contrast, alt text, button labels and keyboard access are unverified.', evidence: `looked for: ${known.join(', ')}` }]
  }
  if (!wired && !installed.some((k) => k.includes('axe') || k === 'pa11y' || k === 'lighthouse' || k === '@lhci/cli')) {
    return [{ check: 'a11y', severity: SEVERITY.WARN, message: `${installed.join(', ')} is installed but not referenced by the eslint config — it may not run.`, evidence: 'eslint config does not mention jsx-a11y/axe' }]
  }
  return []
}

// ── reporting ──────────────────────────────────────────────────────────────
export function summarise(findings) {
  const fails = findings.filter((f) => f.severity === SEVERITY.FAIL)
  const warns = findings.filter((f) => f.severity === SEVERITY.WARN)
  return { fails, warns, ok: fails.length === 0 }
}
