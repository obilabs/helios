/**
 * Evidence builders — the ONLY way a tracking request becomes a phish_event row.
 *
 * Two invariants live here and are pinned by tests:
 *   1. Credential VALUES are never stored. `buildSubmitEvidence` accepts the raw form body and
 *      records WHICH fields were populated (names + lengths), never their contents. The body is
 *      not referenced by the returned object.
 *   2. IP data is minimised. The durable column gets a /24 (v4) or /48 (v6) prefix; the full IP
 *      goes only under a TTL key in request_meta, which the retention job redacts (the one
 *      sanctioned UPDATE on phish_event).
 */
import { IP_TRUNCATION, type EventType, type EventSource } from './contract.js'

export interface RequestEvidenceInput {
  ip?: string | null
  userAgent?: string | null
  headers?: Record<string, string | string[] | undefined>
  /** ASN resolved by the caller (lookup tables are iterable config, not a bone). */
  asn?: number | null
}

export interface PhishEventInsert {
  event_type: EventType
  source: EventSource
  link_slug: string | null
  request_ip_trunc: string | null
  request_asn: number | null
  user_agent: string | null
  request_meta: Record<string, unknown>
}

/** Headers worth keeping verbatim for the classifier (small, non-PII, high-signal). */
const KEPT_HEADERS = [
  'sec-fetch-user', 'sec-fetch-mode', 'sec-fetch-dest', 'sec-fetch-site',
  'referer', 'via', 'accept-language', 'x-forwarded-for',
] as const

export function buildRequestEvidence(
  eventType: EventType,
  source: EventSource,
  req: RequestEvidenceInput,
  opts: { linkSlug?: string | null } = {},
): PhishEventInsert {
  const meta: Record<string, unknown> = {}
  for (const h of KEPT_HEADERS) {
    const v = req.headers?.[h]
    if (v !== undefined) meta[`h_${h.replace(/-/g, '_')}`] = Array.isArray(v) ? v.join(', ') : v
  }
  if (req.ip) meta.ip_full = req.ip // TTL key — redacted by the retention job
  return {
    event_type: eventType,
    source,
    link_slug: opts.linkSlug ?? null,
    request_ip_trunc: truncateIp(req.ip),
    request_asn: req.asn ?? null,
    user_agent: req.userAgent ? String(req.userAgent).slice(0, 512) : null,
    request_meta: meta,
  }
}

/**
 * A landing-form submit. `body` is consumed for field NAMES and value LENGTHS only and is then
 * dropped; nothing from it is returned. Storing a submitted credential would make Helios itself
 * a breach surface.
 */
export function buildSubmitEvidence(
  req: RequestEvidenceInput,
  body: Record<string, unknown> | null | undefined,
): PhishEventInsert {
  const ev = buildRequestEvidence('submitted', 'form', req)
  const fields: Record<string, { populated: boolean; length: number }> = {}
  for (const [name, value] of Object.entries(body ?? {})) {
    const str = value == null ? '' : String(value)
    fields[name.slice(0, 64)] = { populated: str.length > 0, length: str.length }
  }
  ev.request_meta.form_fields = fields
  return ev
}

/** /24 for IPv4, /48 for IPv6, as CIDR text for the inet column. Null for anything unparsable. */
export function truncateIp(ip: string | null | undefined): string | null {
  if (!ip) return null
  const s = ip.trim()
  const v4 = s.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/)
  if (v4) return `${v4[1]}.${v4[2]}.${v4[3]}.0/${IP_TRUNCATION.v4PrefixBits}`
  if (s.includes(':')) {
    const expanded = expandIpv6(s)
    if (!expanded) return null
    const groups = expanded.split(':')
    return `${groups.slice(0, 3).join(':')}::/${IP_TRUNCATION.v6PrefixBits}`
  }
  return null
}

function expandIpv6(s: string): string | null {
  const noZone = s.split('%')[0]
  if (!/^[0-9a-fA-F:.]+$/.test(noZone)) return null
  const halves = noZone.split('::')
  if (halves.length > 2) return null
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const missing = 8 - head.length - tail.length
  if (halves.length === 2 && missing < 0) return null
  if (halves.length === 1 && head.length !== 8) return null
  const groups = [...head, ...Array(halves.length === 2 ? Math.max(missing, 0) : 0).fill('0'), ...tail]
  if (groups.length !== 8 || groups.some((g) => g.length === 0 || g.length > 4)) return null
  return groups.map((g) => g.toLowerCase().padStart(4, '0')).join(':')
}
