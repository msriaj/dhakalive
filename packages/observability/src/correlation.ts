import { randomUUID } from 'node:crypto'

/** Header the edge and every internal hop use to carry the correlation id. */
export const CORRELATION_HEADER = 'x-correlation-id'
export const REQUEST_ID_HEADER = 'x-request-id'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const SAFE_ID_RE = /^[A-Za-z0-9_-]{8,64}$/

export function newCorrelationId(): string {
  return randomUUID()
}

/**
 * Accepts an inbound correlation id only if it is a plausible opaque token.
 * An unvalidated header value ends up in log files and dashboards, which is a
 * log-injection vector, so anything unexpected is replaced rather than trusted.
 */
export function normaliseCorrelationId(value: string | null | undefined): string {
  if (!value) return newCorrelationId()
  const trimmed = value.trim()
  if (UUID_RE.test(trimmed) || SAFE_ID_RE.test(trimmed)) return trimmed
  return newCorrelationId()
}

export function correlationIdFromHeaders(headers: Headers): string {
  return normaliseCorrelationId(
    headers.get(CORRELATION_HEADER) ?? headers.get(REQUEST_ID_HEADER) ?? null,
  )
}
