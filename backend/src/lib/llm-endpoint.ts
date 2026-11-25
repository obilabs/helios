/**
 * Validation for administrator-supplied LLM endpoint URLs.
 *
 * The AI settings let an administrator point Helios at their own
 * OpenAI-compatible server (often a self-hosted Ollama on the local network),
 * so destinations cannot be allowlisted. What is enforced:
 *   - http or https only;
 *   - no credentials embedded in the URL;
 *   - not a link-local address (169.254.0.0/16, fe80::/10), which is where
 *     cloud instance metadata services live, and not the well-known metadata
 *     host names.
 */

import { trimTrailing } from '../utils/strings.js';

export class LlmEndpointError extends Error {}

const METADATA_HOSTS = new Set(['metadata.google.internal', 'metadata', 'instance-data']);

function isLinkLocal(hostname: string): boolean {
  const host = hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (/^169\.254\.\d{1,3}\.\d{1,3}$/.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/.test(host)) return true;
  // IPv4-mapped IPv6 form of a link-local address
  if (/^::ffff:169\.254\./.test(host) || /^::ffff:a9fe:/.test(host)) return true;
  return false;
}

/** Returns the endpoint without a trailing slash, or throws LlmEndpointError. */
export function validateLlmEndpoint(raw: unknown): string {
  if (typeof raw !== 'string' || raw.trim() === '') {
    throw new LlmEndpointError('Endpoint URL is required');
  }
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new LlmEndpointError('Endpoint must be a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new LlmEndpointError('Endpoint must use http or https');
  }
  if (url.username || url.password) {
    throw new LlmEndpointError('Endpoint must not contain credentials; use the API key field');
  }
  if (isLinkLocal(url.hostname) || METADATA_HOSTS.has(url.hostname.toLowerCase())) {
    throw new LlmEndpointError('Endpoint address is not allowed');
  }
  return trimTrailing(`${url.origin}${url.pathname}`, '/');
}

/**
 * The base address chat requests are sent to.
 *
 * OpenAI-compatible servers serve chat under `/v1` (Ollama, LM Studio, vLLM and
 * OpenAI itself). An address with no path, such as `http://host:11434`, is what
 * an administrator copies from the model server; model discovery accepts it, so
 * the chat address must too. Anything with a path is left as given.
 */
export function chatBaseUrl(validatedEndpoint: string): string {
  const url = new URL(validatedEndpoint);
  return url.pathname === '' || url.pathname === '/' ? `${url.origin}/v1` : validatedEndpoint;
}

/**
 * True for the errors fetch() raises when nothing answered at the address:
 * refused, timed out, name not found, unreachable network.
 */
export function isUnreachable(error: unknown): boolean {
  const e = error as { message?: string; cause?: { code?: string } } | undefined;
  const code = e?.cause?.code || '';
  return (
    /fetch failed|ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ENETUNREACH|ETIMEDOUT|EAI_AGAIN|UND_ERR/i.test(
      `${e?.message || ''} ${code}`
    )
  );
}

/** What to tell an administrator when the model server did not answer. */
export function unreachableMessage(endpoint: string): string {
  let origin = endpoint;
  try {
    origin = new URL(endpoint).origin;
  } catch {
    /* keep the text as given */
  }
  return (
    `Helios could not reach ${origin}. The address has to be reachable from the server Helios runs on, ` +
    `not only from your browser. Check the address and port, and that the model server accepts connections from that machine.`
  );
}

