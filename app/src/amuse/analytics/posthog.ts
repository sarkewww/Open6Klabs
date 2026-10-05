/**
 * PostHog no-op stub.
 *
 * The captured site bundle (`app/_reference/main-Dx8nN5Es.js:35438`) ships the
 * real `posthog-js` SDK and initializes it with an embedded project token:
 *
 *   Fa.init("<redacted-posthog-token>", { api_host: "https://glorp.6klabs.com", … })
 *
 * `posthog-js` is intentionally NOT a dependency of the rewrite (see
 * `app/package.json`). This module replaces it with a stub that **preserves the
 * observable contract** of the SDK's public surface while performing no I/O:
 *
 *   - `init(token, options)` returns the instance and flips `__loaded` to true
 *   - every mutator (`capture`, `identify`, `reset`, `register`, …) is chainable
 *     (returns the instance), exactly like the SDK
 *   - `identify(id)` makes `get_distinct_id()` return `id`; `reset()` clears it
 *   - feature flags resolve to `false` / `undefined`
 *   - `on` / `off` register and remove in-process listeners
 *   - **no network request is ever made** (the `glorp.*` ingest host is never hit)
 *
 * The real project token is intentionally NOT embedded anywhere in `app/` — the
 * stub accepts whatever token the caller passes and discards it.
 */

/** Recorded method call, for observability/tests. */
export interface PostHogCall {
  method: string;
  args: unknown[];
  at: number;
}

/** PostHog init options (subset; kept loose on purpose). */
export interface PostHogConfig {
  api_host?: string;
  person_profiles?: string;
  [key: string]: unknown;
}

type Listener = (...args: unknown[]) => void;

/**
 * In-process no-op implementation of the `posthog-js` public surface.
 * Behaviour-compatible, side-effect free.
 */
export class NoopPostHog {
  /** Mirrors `posthog.__loaded`. */
  __loaded = false;

  /** The (discarded) project token last passed to `init`. */
  token: string | null = null;

  /** The options last passed to `init` / `set_config`. */
  config: PostHogConfig = {};

  /** Every method invocation, in order. Useful for assertions. */
  readonly calls: PostHogCall[] = [];

  private distinctId = '';

  private readonly listeners = new Map<string, Set<Listener>>();

  private record(method: string, args: unknown[]): this {
    this.calls.push({ method, args, at: Date.now() });
    return this;
  }

  init(token: string, options: PostHogConfig = {}): this {
    this.record('init', [token, options]);
    if (this.__loaded) return this;
    this.token = token;
    this.config = options;
    this.__loaded = true;
    return this;
  }

  capture(event: string, properties?: Record<string, unknown>): this {
    return this.record('capture', [event, properties]);
  }

  identify(distinctId: string, properties?: Record<string, unknown>): this {
    this.distinctId = distinctId;
    return this.record('identify', [distinctId, properties]);
  }

  reset(): this {
    this.distinctId = '';
    return this.record('reset', []);
  }

  register(properties: Record<string, unknown>): this {
    return this.record('register', [properties]);
  }

  register_for_session(properties: Record<string, unknown>): this {
    return this.record('register_for_session', [properties]);
  }

  unregister(property: string): this {
    return this.record('unregister', [property]);
  }

  set_config(config: PostHogConfig): this {
    this.config = { ...this.config, ...config };
    return this.record('set_config', [config]);
  }

  debug(enabled?: boolean): this {
    return this.record('debug', [enabled]);
  }

  get_distinct_id(): string {
    return this.distinctId;
  }

  isFeatureEnabled(_flag?: string): boolean {
    return false;
  }

  getFeatureFlag(_flag?: string): boolean | undefined {
    return undefined;
  }

  reloadFeatureFlags(): this {
    return this.record('reloadFeatureFlags', []);
  }

  opt_out_capturing(): this {
    return this.record('opt_out_capturing', []);
  }

  opt_in_capturing(): this {
    return this.record('opt_in_capturing', []);
  }

  on(event: string, callback: Listener): this {
    const set = this.listeners.get(event) ?? new Set<Listener>();
    set.add(callback);
    this.listeners.set(event, set);
    return this.record('on', [event, callback]);
  }

  off(event: string, callback?: Listener): this {
    if (callback) this.listeners.get(event)?.delete(callback);
    else this.listeners.delete(event);
    return this.record('off', [event, callback]);
  }
}

/** Shared singleton — the module-level `posthog` the original bundle exposes. */
export const posthog = new NoopPostHog();

/**
 * Initialize the shared stub. Accepts a token for signature parity but stores
 * nothing sensitive; callers in this rewrite pass no real project token.
 */
export function initPostHog(
  token = '',
  config: PostHogConfig = {},
): NoopPostHog {
  return posthog.init(token, config);
}
