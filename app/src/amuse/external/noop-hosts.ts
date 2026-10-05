/**
 * Sanctioned no-op stubs for the original widget's external side-effect hosts.
 *
 * The captured widget talks to five third-party / first-party service hosts
 * that must NOT be contacted by the local rewrite. Every one of them is
 * replaced by a stub that preserves the *observable* behaviour of the call site
 * (same function shape, same resolution timing, no thrown errors) while never
 * opening a socket or issuing an HTTP request.
 *
 *   host                                  original call site
 *   -----------------------------------   -------------------------------------
 *   https://ipv4.icanhazip.com            AmuseWidget.js:7303  (public IP lookup)
 *   https://metrics.6klabs.com            AmuseWidget.js:7300  (usage metrics)
 *   https://content.6klabs.com/api/graphql main-Dx8nN5Es.js:15452 (Payload CMS)
 *   https://hdx.6klabs.com                useAmuseSettings.js:142 (HyperDX OTEL)
 *   https://glorp.6klabs.com              main-Dx8nN5Es.js:35438 (PostHog ingest)
 *
 * The PostHog host is stubbed separately in `../analytics/posthog.ts`; the raw
 * host string is re-exported here so the parity report has a single list of the
 * sanctioned exemptions.
 *
 * SECURITY: the original Payload/PostHog call sites carry an embedded
 * `authorization: "Bearer <redacted>"` header and a PostHog project token. Those
 * credentials are intentionally NOT copied into `app/`; the stubs take no
 * credential and send no request.
 */

/** Public-IP lookup host (original `fetch("https://ipv4.icanhazip.com")`). */
export const ICANHAZIP_URL = 'https://ipv4.icanhazip.com';

/** Usage-metrics ingest host (original `P = "https://metrics.6klabs.com"`). */
export const METRICS_URL = 'https://metrics.6klabs.com';

/** Payload CMS GraphQL host (original `new WJ("https://content.6klabs.com/api/graphql", …)`). */
export const PAYLOAD_GRAPHQL_URL = 'https://content.6klabs.com/api/graphql';

/** HyperDX OTEL collector host (original `VITE_HYPERDX_OTEL_URL`). */
export const HYPERDX_OTEL_URL = 'https://hdx.6klabs.com';

/** PostHog ingest host (original `api_host: "https://glorp.6klabs.com"`). */
export const POSTHOG_HOST = 'https://glorp.6klabs.com';

/**
 * The complete, sanctioned no-op host allow-list. Recorded verbatim in the
 * parity evidence (`task-15-realtime.json`) with the exemption reason for each.
 */
export const EXTERNAL_NOOP_HOSTS = [
  {
    host: ICANHAZIP_URL,
    purpose: 'public IP lookup',
    reason:
      'external third-party network call; IP is never used by the local widget',
  },
  {
    host: METRICS_URL,
    purpose: 'usage metrics',
    reason: 'first-party analytics ingest; out of scope for the local rewrite',
  },
  {
    host: PAYLOAD_GRAPHQL_URL,
    purpose: 'Payload CMS GraphQL',
    reason: 'site CMS content; overlay route never renders CMS content',
  },
  {
    host: HYPERDX_OTEL_URL,
    purpose: 'HyperDX OpenTelemetry',
    reason: 'telemetry exporter; no observability backend locally',
  },
  {
    host: POSTHOG_HOST,
    purpose: 'PostHog product analytics',
    reason:
      'analytics; replaced by a no-op PostHog stub (see ../analytics/posthog.ts)',
  },
] as const;

/** A single usage-metric event (shape kept from the original call sites). */
export interface MetricEvent {
  name: string;
  value?: number;
  tags?: Record<string, unknown>;
}

/** Handle returned by `startOtel`; `shutdown` is the only observable member. */
export interface OtelHandle {
  shutdown(): Promise<void>;
}

/**
 * Observable contract of the external-host stubs. Each method resolves with the
 * same *neutral* value a failed/orig-would-be-empty call would produce, without
 * any I/O:
 *   - `fetchPublicIp`  -> `null`  (original stores the IP in a ref, never read)
 *   - `reportMetric`   -> `void`  (original fire-and-forget)
 *   - `payloadGraphql` -> `null`  (original returns CMS data; never rendered here)
 *   - `startOtel`      -> no-op handle
 */
export interface ExternalHostStubs {
  fetchPublicIp(): Promise<string | null>;
  reportMetric(event: MetricEvent): Promise<void>;
  payloadGraphql<T = unknown>(
    query: string,
    variables?: Record<string, unknown>,
  ): Promise<T | null>;
  startOtel(): OtelHandle;
}

/** Build a fresh set of no-op host stubs (no shared mutable state). */
export function createExternalHostStubs(): ExternalHostStubs {
  return {
    fetchPublicIp: () => Promise.resolve(null),
    reportMetric: () => Promise.resolve(),
    payloadGraphql: () => Promise.resolve(null),
    startOtel: () => ({ shutdown: () => Promise.resolve() }),
  };
}

/** Shared singleton stubs for runtime call sites. */
export const externalHosts: ExternalHostStubs = createExternalHostStubs();
