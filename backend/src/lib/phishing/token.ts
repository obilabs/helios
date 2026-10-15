/**
 * Opaque per-(campaign, recipient) tracking token — format h1.
 *
 * Frozen shape: `h1_` + 26 lower-case base32 chars (16 CSPRNG bytes, no padding).
 * The raw token appears ONLY in the lure URL path. Helios persists `sha256(token)` and
 * looks recipients up by that hash, so a database or backup leak cannot hand out live links.
 */
import { randomBytes, createHash } from 'crypto'
import {
  TOKEN_PREFIX_H1,
  TOKEN_H1_RANDOM_BYTES,
  TOKEN_H1_BODY_LENGTH,
  TOKEN_BASE32_ALPHABET,
  type TokenFormat,
} from './contract.js'

/** RFC 4648 base32, lower-case alphabet, no padding. */
export function base32NoPad(bytes: Uint8Array): string {
  let bits = 0
  let value = 0
  let out = ''
  for (const byte of bytes) {
    value = (value << 8) | byte
    bits += 8
    while (bits >= 5) {
      out += TOKEN_BASE32_ALPHABET[(value >>> (bits - 5)) & 31]
      bits -= 5
    }
  }
  if (bits > 0) out += TOKEN_BASE32_ALPHABET[(value << (5 - bits)) & 31]
  return out
}

export interface MintedToken {
  /** The raw token to embed in the URL. Never persist or log it. */
  token: string
  /** sha256 hex of the raw token — the only thing that goes in the database. */
  tokenHash: string
  format: TokenFormat
}

export function mintToken(): MintedToken {
  const token = TOKEN_PREFIX_H1 + base32NoPad(randomBytes(TOKEN_H1_RANDOM_BYTES))
  return { token, tokenHash: hashToken(token), format: 'h1' }
}

export function hashToken(token: string): string {
  return createHash('sha256').update(normaliseToken(token)).digest('hex')
}

const H1_RE = new RegExp(`^${TOKEN_PREFIX_H1}[${TOKEN_BASE32_ALPHABET}]{${TOKEN_H1_BODY_LENGTH}}$`)

/**
 * Parse a token from a URL path segment. Case-insensitive on the body (mail clients and
 * proxies sometimes upper-case). Returns null for anything that is not a well-formed h1
 * token so unknown/expired/garbage all take the same uniform, benign response path.
 */
export function parseToken(raw: string): { token: string; format: TokenFormat } | null {
  const t = normaliseToken(raw)
  if (H1_RE.test(t)) return { token: t, format: 'h1' }
  return null
}

function normaliseToken(raw: string): string {
  const s = String(raw ?? '').trim()
  if (s.toLowerCase().startsWith(TOKEN_PREFIX_H1)) {
    return TOKEN_PREFIX_H1 + s.slice(TOKEN_PREFIX_H1.length).toLowerCase()
  }
  return s
}
