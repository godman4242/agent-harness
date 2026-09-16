// Pins every judgement in launchGateLib.mjs. Zero dependencies: node --test 'harness/**/*.test.mjs'
//
// Each check is red-proofed in pairs: a BAD fixture must produce the finding, and a GOOD
// fixture must not. A check that cannot be made to fire is not a check.
// Fixtures marked CAPTURED are verbatim from a real site (secrets replaced with fakes of the
// same SHAPE); HAND-BUILT ones say so.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  SEVERITY, auditA11yTooling, auditHeaders, auditLegalMarkers, auditRls, auditThirdParties,
  classifySupabaseKey, decodeJwtPayload, extractOrigins, findSecrets, hostAllowed, rlsFindings, stripSqlComments, summarise,
} from './launchGateLib.mjs'

const fails = (list) => list.filter((f) => f.severity === SEVERITY.FAIL)
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
const jwt = (payload) => `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${b64url(payload)}.ZmFrZXNpZ25hdHVyZQ`

// ── secrets ────────────────────────────────────────────────────────────────
test('secrets: a Supabase SECRET key in shipped code fails', () => {
  const out = findSecrets('const k=`sb_secret_AbCdEfGh123456789_xyz`', 'bundle.js')
  assert.equal(fails(out).length, 1)
  assert.match(out[0].message, /bypasses Row Level Security/)
})

test('secrets: a Supabase PUBLISHABLE key is NOT a finding — it is meant to ship', () => {
  // CAPTURED shape — the real bundle of a live Vite+Supabase app carries exactly this.
  assert.equal(findSecrets('var ka={url:`https://x.supabase.co`,key:`sb_publishable_chspR51R86xPUFd7WxRNlw_aMq7r6_Q`}').length, 0)
})

test('secrets: a service_role JWT fails, an anon JWT does not', () => {
  assert.equal(fails(findSecrets(`key:"${jwt({ role: 'service_role', iss: 'supabase' })}"`)).length, 1)
  assert.equal(findSecrets(`key:"${jwt({ role: 'anon', iss: 'supabase' })}"`).length, 0)
})

test('secrets: each vendor prefix is detected', () => {
  const cases = [
    'sk-proj-abcdefghijklmnopqrstuvwxyz012345',
    'sk_live_abcdefghij1234567890',
    `AIza${'B'.repeat(35)}`,
    'AKIAIOSFODNN7EXAMPLE',
    `ghp_${'a'.repeat(36)}`,
    'xoxb-1234567890-abcdefghij',
    '-----BEGIN RSA PRIVATE KEY-----',
  ]
  for (const c of cases) assert.equal(fails(findSecrets(c)).length, 1, `missed: ${c.slice(0, 16)}`)
})

test('secrets: a minified bundle without credentials is clean (no entropy-based false positives)', () => {
  // HAND-BUILT: the shapes that a naive "long random string" rule would flag.
  const min = 'function Ab(e){return e.sk-1}var x="a1b2c3d4e5f6a1b2c3d4e5f6",h="sha256-8u1Bu1sQvcln2Ijcp4yaTq0Rrmfv1IB+oC7LUPXCAe4=";'
  assert.deepEqual(findSecrets(min), [])
})

test('classifySupabaseKey distinguishes all four forms', () => {
  assert.equal(classifySupabaseKey('sb_secret_abcdefgh'), 'secret')
  assert.equal(classifySupabaseKey('sb_publishable_abcdefgh'), 'publishable')
  assert.equal(classifySupabaseKey(jwt({ role: 'service_role' })), 'service_role')
  assert.equal(classifySupabaseKey(jwt({ role: 'anon' })), 'anon')
  assert.equal(classifySupabaseKey('hunter2'), 'unknown')
})

test('decodeJwtPayload returns null on junk rather than throwing', () => {
  assert.equal(decodeJwtPayload('not-base64!!'), null)
})

// ── RLS ────────────────────────────────────────────────────────────────────
const GOOD_SQL = `
create table public.profiles (id uuid primary key);
alter table public.profiles enable row level security;
create policy "own profile" on public.profiles for select using (auth.uid() = id);
`
const NO_RLS_SQL = `create table public.user_cards (id uuid primary key);`
const RLS_NO_POLICY_SQL = `
create table if not exists public.telemetry (id bigserial);
alter table public.telemetry enable row level security;
`

test('rls: a table with RLS on and a policy passes', () => {
  assert.deepEqual(rlsFindings(auditRls(GOOD_SQL)), [])
})

test('rls: a table with no RLS fails', () => {
  const out = rlsFindings(auditRls(NO_RLS_SQL))
  assert.equal(out.length, 1)
  assert.match(out[0].message, /public\.user_cards.*NOT enabled/)
})

test('rls: RLS enabled with ZERO policies fails — the trap that looks protected', () => {
  const out = rlsFindings(auditRls(RLS_NO_POLICY_SQL))
  assert.equal(out.length, 1)
  assert.match(out[0].message, /ZERO policies/)
})

test('rls: a COMMENTED-OUT enable cannot vouch for a table', () => {
  const sql = `create table public.notes (id int);\n-- alter table public.notes enable row level security;\n/* create policy p on public.notes for all using (true); */`
  const out = rlsFindings(auditRls(sql))
  assert.equal(out.length, 1)
  assert.match(out[0].message, /NOT enabled/)
})

test('rls: schema-qualified, unqualified and quoted names are the same table', () => {
  const sql = `create table "notes" (id int);\nalter table public.notes enable row level security;\ncreate policy p on notes for all using (true);`
  assert.deepEqual(rlsFindings(auditRls(sql)), [])
})

test('rls: one good table does not vouch for a bad sibling', () => {
  const out = rlsFindings(auditRls(GOOD_SQL + NO_RLS_SQL))
  assert.equal(out.length, 1)
  assert.match(out[0].message, /user_cards/)
})

test('stripSqlComments removes both comment forms', () => {
  assert.equal(stripSqlComments('a -- x\nb /* y */ c').replace(/\s+/g, ' ').trim(), 'a b c')
})

// ── headers ────────────────────────────────────────────────────────────────
// CAPTURED — the live response of a real Vercel-hosted SPA on 2026-09-16.
const LIVE_HEADERS = {
  'content-security-policy-report-only': "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; connect-src 'self' https://*.supabase.co http://localhost:*",
  'strict-transport-security': 'max-age=63072000; includeSubDomains; preload',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
  'referrer-policy': 'strict-origin-when-cross-origin',
}

test('headers: a Report-Only CSP with no reporting endpoint fails as decoration', () => {
  const out = auditHeaders(LIVE_HEADERS)
  const csp = fails(out).find((f) => /Report-Only/.test(f.message))
  assert.ok(csp, 'report-only CSP must fail')
  assert.match(csp.message, /reports nowhere/)
})

test('headers: the captured live response is missing permissions-policy', () => {
  assert.ok(fails(auditHeaders(LIVE_HEADERS)).some((f) => /permissions-policy/.test(f.message)))
})

test('headers: a fully-configured response passes', () => {
  const good = { ...LIVE_HEADERS, 'permissions-policy': 'camera=(), microphone=()' }
  delete good['content-security-policy-report-only']
  good['content-security-policy'] = "default-src 'self'"
  assert.deepEqual(fails(auditHeaders(good)), [])
})

test('headers: a Report-Only CSP that DOES report still fails, with a different reason', () => {
  const h = { ...LIVE_HEADERS, 'content-security-policy-report-only': "default-src 'self'; report-uri /csp" }
  const csp = fails(auditHeaders(h)).find((f) => /Report-Only/.test(f.message))
  assert.match(csp.message, /Promote it/)
})

test('headers: localhost left in a live CSP warns but does not fail', () => {
  const h = { ...LIVE_HEADERS, 'permissions-policy': 'camera=()', 'content-security-policy': "default-src 'self'; connect-src http://localhost:*" }
  delete h['content-security-policy-report-only']
  const out = auditHeaders(h)
  assert.deepEqual(fails(out), [])
  assert.ok(out.some((f) => f.severity === SEVERITY.WARN && /localhost/.test(f.message)))
})

test('headers: no CSP at all fails', () => {
  const h = { ...LIVE_HEADERS, 'permissions-policy': 'camera=()' }
  delete h['content-security-policy-report-only']
  assert.ok(fails(auditHeaders(h)).some((f) => /missing content-security-policy\b/.test(f.message)))
})

// ── third parties ──────────────────────────────────────────────────────────
test('extractOrigins finds each distinct host once', () => {
  assert.deepEqual(extractOrigins('a https://fonts.googleapis.com/x b https://fonts.googleapis.com/y https://va.vercel-scripts.com/z'), ['fonts.googleapis.com', 'va.vercel-scripts.com'])
})

test('hostAllowed: one leading wildcard label, and never the bare suffix', () => {
  assert.equal(hostAllowed('abc.supabase.co', '*.supabase.co'), true)
  assert.equal(hostAllowed('supabase.co', '*.supabase.co'), false)
  assert.equal(hostAllowed('evil-supabase.co', '*.supabase.co'), false)
})

test('third-parties: an undeclared origin fails', () => {
  const out = auditThirdParties(['fonts.gstatic.com'], [{ host: 'fonts.googleapis.com', basis: 'webfont css' }])
  assert.equal(fails(out).length, 1)
  assert.match(out[0].message, /undeclared third-party origin: fonts\.gstatic\.com/)
})

test('third-parties: a declared origin with no stated basis fails — declaring is not deciding', () => {
  const out = auditThirdParties([], [{ host: 'va.vercel-scripts.com' }])
  assert.equal(fails(out).length, 1)
  assert.match(out[0].message, /no "basis"/)
})

test('third-parties: an origin that receives personal data with no consent recorded fails', () => {
  const out = auditThirdParties([], [{ host: 'x.example.com', basis: 'analytics', personalData: true }])
  assert.equal(fails(out).length, 1)
  assert.match(out[0].message, /no consent mechanism/)
})

test('third-parties: a consent field that is still a TODO does NOT count as answered', () => {
  const out = auditThirdParties([], [{ host: 'fonts.gstatic.com', basis: 'webfonts', personalData: true, consent: 'TODO — self-host the fonts' }])
  assert.equal(fails(out).length, 1)
  assert.match(out[0].message, /still an open question/)
})

test('third-parties: TBD and bare question marks are open questions too', () => {
  for (const c of ['TBD', '???', 'tbd: ask a lawyer']) {
    assert.equal(fails(auditThirdParties([], [{ host: 'x.com', basis: 'b', personalData: true, consent: c }])).length, 1, `not caught: ${c}`)
  }
})

test('third-parties: an origin that handles no personal data needs no consent answer', () => {
  assert.deepEqual(fails(auditThirdParties([], [{ host: 'react.dev', basis: 'error-message text, never fetched', consent: 'n/a' }])), [])
})

test('third-parties: fully declared origins pass', () => {
  const declared = [{ host: '*.supabase.co', basis: 'own backend' }, { host: 'fonts.gstatic.com', basis: 'webfont files' }]
  assert.deepEqual(fails(auditThirdParties(['abc.supabase.co', 'fonts.gstatic.com'], declared)), [])
})

// ── legal ──────────────────────────────────────────────────────────────────
const REQUIRED_LEGAL = [{ name: 'Privacy policy', markers: ['Privacy Policy', 'Dasar Privasi'], why: 'you store user data', severity: 'fail' }]

test('legal: a missing privacy policy fails', () => {
  assert.equal(fails(auditLegalMarkers('<h1>Welcome</h1>', REQUIRED_LEGAL)).length, 1)
})

test('legal: the marker is matched case-insensitively anywhere in what ships', () => {
  assert.deepEqual(auditLegalMarkers('…href="/privacy">privacy policy</a>…', REQUIRED_LEGAL), [])
})

test('legal: any one of the alternative markers satisfies it', () => {
  assert.deepEqual(auditLegalMarkers('Dasar Privasi', REQUIRED_LEGAL), [])
})

test('legal: severity warn downgrades instead of failing', () => {
  const out = auditLegalMarkers('', [{ name: 'Refund policy', markers: ['Refund'], why: 'no payments yet', severity: 'warn' }])
  assert.equal(out[0].severity, SEVERITY.WARN)
})

// ── a11y ───────────────────────────────────────────────────────────────────
test('a11y: no checker installed fails', () => {
  const out = auditA11yTooling({ packageJson: { dependencies: { react: '19' } } })
  assert.equal(fails(out).length, 1)
  assert.match(out[0].message, /no accessibility checker is installed/)
})

test('a11y: jsx-a11y installed but not wired into eslint warns', () => {
  const out = auditA11yTooling({ packageJson: { devDependencies: { 'eslint-plugin-jsx-a11y': '6' } }, eslintConfigText: 'export default []' })
  assert.equal(fails(out).length, 0)
  assert.equal(out[0].severity, SEVERITY.WARN)
})

test('a11y: jsx-a11y wired into eslint passes', () => {
  assert.deepEqual(auditA11yTooling({ packageJson: { devDependencies: { 'eslint-plugin-jsx-a11y': '6' } }, eslintConfigText: "import a11y from 'eslint-plugin-jsx-a11y'" }), [])
})

test('a11y: axe alone passes without an eslint mention — it runs in tests, not lint', () => {
  assert.deepEqual(auditA11yTooling({ packageJson: { devDependencies: { 'axe-core': '4' } } }), [])
})

// ── summary ────────────────────────────────────────────────────────────────
test('summarise: warnings alone do not fail the gate', () => {
  const s = summarise([{ severity: SEVERITY.WARN }, { severity: SEVERITY.WARN }])
  assert.equal(s.ok, true)
  assert.equal(s.warns.length, 2)
})

test('summarise: one failure fails the gate', () => {
  assert.equal(summarise([{ severity: SEVERITY.WARN }, { severity: SEVERITY.FAIL }]).ok, false)
})
