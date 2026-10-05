# Security note — frozen reference captures and upstream credential rotation

Status: accepted risk / rotation recommended
Scope: `amuse-widget-rewrite` (plan todo 34)
Last reviewed: 2026-10-05

## Summary

The local reproduction keeps two **frozen captures** of the original Amuse
widget in the repository. Both are read-only reference material: they are never
executed by the rewrite runtime, never imported by `app/**`, and never modified.
Because they are byte-for-byte captures of the original shipped bundle and a
recorded HTTP baseline, they contain **historical credentials** that were
already public in the original client bundle. The rewrite product itself
(`app/**` and `tools/**`) contains none of this material; this is enforced by
`tools/verify-rewrite.mjs` (check `[secrets]`).

## Capture inventory

| Capture | Path | Role |
| --- | --- | --- |
| Original widget bundle | `widget/**` | Frozen static capture served by `widget-server.mjs` for parity comparison. |
| Recorded HTTP baseline | `tools/parity/baseline/original-baseline.json` | Captured request shapes from the original widget against the mock backend. |

Neither path is scanned for credentials (explicit allowlist in
`tools/verify-rewrite.mjs`), and neither may be modified. Git history is **not**
rewritten.

## Credential types found in the captures

All values below are described by type/prefix only; full values are not
reproduced here or anywhere under `app/**` / `tools/**`.

1. **PostHog project token** (prefix `phc_…`) — public client-side analytics
   ingest token, present in `widget/assets/main-*.js` and
   `widget/assets/useAmuseSettings-*.js`, and embedded in the recorded PostHog
   ingest URL in `tools/parity/baseline/original-baseline.json`.
2. **Stripe live publishable key** (prefix `pk_live_…`) — present in
   `widget/assets/index-*.js` and `widget/assets/useAmuseSettings-*.js`.
   Publishable keys are designed to be shipped to browsers.
3. **`Authorization: Bearer <long hex>`** header — a long hex bearer token
   embedded in `widget/assets/main-*.js` (Payload CMS / metrics authorization).
   This is the highest-risk item because it authenticates server-side requests.
4. **Historical hex fragment** `c97816ab…` — embedded in
   `widget/assets/main-*.js`. A second fragment, `84ef802d…`, appears only in
   gitignored agent work-state under `.omo/` and in the plan text, not in the
   shipped capture; it is still covered by the secret gate.

## Why the captures are exempt

- They are **read-only reference material** required for the parity harness
  (`tools/parity/**`) and the reference server (`widget-server.mjs`).
- The material was already disclosed in the original public client bundle;
  re-scanning it would only produce noise, and "fixing" it would mutate the
  capture and invalidate parity.
- The rewrite replaces every one of these call sites with inert no-op stubs
  (`app/src/amuse/external/noop-hosts.ts`, `app/src/amuse/analytics/posthog.ts`).
  The stubs carry no credential and open no socket.

## Upstream rotation recommendation

Rotation — not history rewriting — is the correct remediation. Rotating makes
every captured copy inert.

1. **Rotate the bearer token** (item 3) upstream first. Revoke the existing
   Payload CMS / metrics API token, issue a replacement, and audit its usage
   logs for unauthorized calls. This is the only server-side credential in the
   set.
2. **Rotate the PostHog project token** (item 1) in the PostHog project
   settings. Public ingest tokens cannot be fully hidden, but rotation
   invalidates the captured copy; also restrict allowed origins if the plan
   supports it.
3. **Review the Stripe publishable key** (item 2). Publishable keys are safe to
   expose, but rotate the key pair if it was ever paired with a secret key, and
   apply domain restrictions in the Stripe dashboard.
4. **Rotate the historical hex secrets** (item 4) upstream wherever they are
   still valid.
5. **Do not rewrite git history.** If a history rewrite is ever mandated,
   coordinate with every clone and mirror first; otherwise rotation alone
   removes the risk.

## Verification

`node tools/verify-rewrite.mjs` reports `[secrets] 0 violation(s)` for
`app/**` (excluding the gitignored `app/_reference/`) plus `tools/**`, and
records `widget/**` and `tools/parity/baseline/**` as explicit, reasoned
allowlist entries. Re-run it after any change to the rewrite surface.
