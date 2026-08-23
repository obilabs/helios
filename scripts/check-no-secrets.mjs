#!/usr/bin/env node
/**
 * Committed-credential gate.
 *
 * WHY THIS EXISTS
 * ---------------
 * On 2026-08-20 two working admin passwords were found in TRACKED files:
 *
 *   tools/ui-test/global-setup.ts    a real password as an `|| 'default'`
 *   docs/testing/antigravity-*.md    a real password written into prose
 *
 * The first is the instructive one. The commit that introduced it was titled
 * "env-var creds in globalSetup" — the env-var plumbing was added and the
 * password was left behind as the fallback, so the change looked like the fix
 * and shipped the bug. A reviewer skimming that diff sees `process.env.X ||`
 * and reads "now configurable", not "still hardcoded".
 *
 * Passwords belong in the environment or a gitignored file, never a tracked
 * one. This makes that a build failure rather than a convention.
 *
 * SCANS TRACKED FILES ONLY — by definition a gitignored file cannot be the
 * problem this is looking for.
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

/**
 * A quoted literal of real length appearing after a credential-shaped name.
 *
 * NOTE THE `[^'"]*` BETWEEN THE `=` AND THE QUOTE — it is the whole point.
 * An earlier version required the quote to follow the `=` immediately, so this
 * line PASSED the gate:
 *
 *     const ADMIN_PASSWORD = process.env.AEGIS_TEST_PASSWORD || 'a-real-password'
 *
 * That is the exact bug this gate exists for: the credential sits after the
 * `||`, not after the `=`. It was caught only because the control test asserted
 * the gate MUST fail on it. Do not tighten this back up.
 *
 * Matching runs line by line, so no newline handling is needed.
 */
const SECRET =
  /(password|passwd|secret|token|api[_-]?key|apikey|access[_-]?key)\s*[:=][^'"]*['"]([^'"\s]{12,})['"]/gi

/** Values that look like credentials but are not. */
const ALLOW = [
  /^\$/, // shell or template interpolation: "$license_secret", "${FOO}"
  /^process\.env/, // read from the environment

  // THE LOAD-BEARING RULE: shape, not a list of known values.
  //
  // A generated credential has mixed case or is long hex — the two real ones
  // found on 2026-08-20 were `sYmdTUzTO04B9obfVj3e` and `vMPCRxzH7fsOSDZa6nLVTg`.
  // A fixture is a lowercase identifier someone typed: `aegis_golden_key`,
  // `helios_prod_testkey`, `not_a_resend_key_format`, `provider_jwt_token`.
  //
  // So a value that is entirely lowercase (plus _ - . and digits) is treated as
  // a fixture name. That keeps the gate quiet on the ~11 legitimate test values
  // in this repo without enumerating them, which would rot the moment someone
  // adds a twelfth.
  //
  // It is a net, not a proof: an all-lowercase real password would slip through.
  // The trade is deliberate — a gate that cries wolf gets ignored (Verification
  // Rule 4), and this shape rule catches every credential generator anyone
  // actually uses.
  /^[a-z0-9_.-]+$/,

  // Obvious placeholders, regardless of case.
  /change[-_ ]?me/i,
  /^your[-_]/i,
  /^(placeholder|example|sample|dummy|redacted|fake|mock)/i,
  /paste|_here$|_here['"]?$/i, // "PASTE_YOUR_TOKEN_HERE"-style placeholders
  /^https?:\/\//, // a URL assigned to a var named token/etc — e.g. a Graph scope
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/, // an email address passed to a helper, not a token
  /^x{6,}$/i,
  /^\*+$/,
  /^[a-z]{12,}$/i, // a straight alphabet run, e.g. "abcdefghijklmnop"
  /^Probe-Passw0rd!$/, // account the security-gates spec creates itself
  /^[A-Za-z0-9_-]*(_KEY|_SECRET|_TOKEN|_PASSWORD)$/, // an env var NAME, not a value
]

const SKIP_PATH = [
  /(^|\/)(node_modules|\.next|dist|build|coverage)\//,
  /(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/,
  /\.(png|jpg|jpeg|gif|svg|ico|woff2?|ttf|pdf|zip)$/i,
  /(^|\/)scripts\/check-no-secrets\.mjs$/, // this file documents examples
]

const files = execSync('git ls-files', { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter((f) => !SKIP_PATH.some((re) => re.test(f)))

const findings = []
for (const file of files) {
  let src
  try {
    src = readFileSync(file, 'utf8')
  } catch {
    continue
  }
  src.split('\n').forEach((line, i) => {
    // Skip this gate's own vocabulary wherever it is discussed.
    if (/check-no-secrets|allowlist|ALLOW\b/i.test(line)) return
    for (const m of line.matchAll(SECRET)) {
      // Strip a trailing backslash left by JSON/shell escaping. Without this,
      // `ADMIN_TOKEN=\"test-token-for-audit-verification\"` inside a JSON
      // string captured the backslash too, so the value failed the lowercase
      // shape rule and reported a false positive on .claude/settings.json.
      const value = m[2].replace(/\\+$/, '')
      if (ALLOW.some((re) => re.test(value))) continue
      findings.push({ file, line: i + 1, name: m[1], value })
    }
  })
}

if (findings.length) {
  console.error('Committed-credential gate FAILED\n')
  for (const f of findings) {
    const masked = `${f.value.slice(0, 3)}…${f.value.slice(-2)}`
    console.error(`  ${f.file}:${f.line}  ${f.name} = "${masked}" (${f.value.length} chars)`)
  }
  console.error(
    '\n  A credential must never live in a tracked file.\n' +
      '  Read it from the environment, or from a gitignored *.local.md / .env.\n' +
      '  If this is genuinely not a secret, add it to the allowlist in\n' +
      '  scripts/check-no-secrets.mjs WITH a comment saying why —\n' +
      '  never to silence a real one.\n'
  )
  process.exit(1)
}

console.log(`Committed-credential gate OK — scanned ${files.length} tracked files`)
