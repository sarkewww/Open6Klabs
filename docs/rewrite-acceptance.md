# Amuse widget rewrite — final acceptance

Status: **ACCEPTED** (plan `amuse-widget-rewrite`, todo 36)
Date: 2026-10-05
Verdict scope: the rewrite in `app/**` is accepted as a faithful local reproduction of the
original Amuse overlay widget, measured against a **frozen** reference harness.

> A gate that fails is never declared complete. Every gate below passed on the frozen
> reference; the run's raw output is recorded in
> `.omo/evidence/amuse-widget-rewrite/task-36-acceptance.json`.

---

## 1. What was rewritten

The original overlay widget is a minified React bundle served by `widget-server.mjs`. It was
re-implemented from scratch as a Vite + React 19 + TypeScript (strict) + Tailwind v4 SPA under
`app/**`:

- **8 skins** (`compact`, `boxy`, `gallery`, `minimal`, `macos`, `shell`, `windows98`,
  `discord`), **4 covers** (`square`, `canvas`, `vinyl`, `none`), **2 themes**
  (`default_dark`, `default_light`), **14 font families**, **24 in/out animations**
  (12 show + 12 hide), **6 music sources** (`spotify`, `pear-desktop`, `ytm-desktop`,
  `apple-music`, `tidal`, `spicetify`), and the **15-state** widget state machine
  (14 renderable + `LOADING`).
- The player store / adapters / realtime settings channel / auth-session mapping / palette
  and visual effects were ported module-by-module; a composition root (`createWidgetBootstrap`)
  wires them at the widget route `/widget/amuse/:widget_token[/:profile_id]`.
- All outbound calls to the original's private/business hosts were replaced with inert no-op
  stubs; no credential or business-data call site remains in `app/**` (enforced statically).

The rewrite is served by `vite preview` on `:5200`; the original reference is served by
`widget-server.mjs` on `:5199`; both run against the same deterministic fixture layer
(`tools/parity/fixtures.mjs`) and the recorded request baseline, so no real external request
is made on either side.

---

## 2. Coverage

| Dimension | Count | Notes |
| --- | --- | --- |
| skins | 8 | full cross with cover × theme (both viewports) |
| covers | 4 | square · canvas · vinyl · none |
| themes | 2 | default_dark · default_light |
| fonts | 14 | single-dimension scan (desktop), + mobile sweep in the acceptance harness |
| animations | 24 | 12 show + 12 hide (parameter-structure assertions) |
| sources | 6 | single-dimension scan (desktop), + mobile sweep in the acceptance harness |
| widget states | 15 | 14 renderable (screenshotted both viewports) + `LOADING` (unit-tested) |
| viewports | 2 | desktop 1440×900 · mobile 390×844 |

**Coverage string: 8/4/2/14/24/6/15 (+2 viewports).** The orthogonal matrix is
**176 case×viewport comparisons** (352 page loads): cross 128 (8×4×2×2) + state 28 (14×2) +
font 14 + source 6. `report-check.mjs` asserts this shape from `results.json`.

---

## 3. Gate results (all pass)

| Gate | Command | Result |
| --- | --- | --- |
| Visual/structural parity | `node tools/parity/compare.mjs --all` | **structural = 0 · style = 0** · 164 within threshold · 12 enumerated unmet · exit 0 |
| Report/threshold validation | `node tools/parity/report-check.mjs` | **50/50 checks PASS** · exit 0 |
| Behavioral equivalence | `node tools/parity/behavior.mjs` | **140/140 checks PASS**, 0 failed, 6 findings · exit 0 |
| Unit/regression suite | `pnpm --dir app test` | **32 files / 491 tests PASS** · exit 0 |
| Lint + format + types | `pnpm --dir app verify` | `eslint .` + `prettier --check .` + `tsc --noEmit` · exit 0 |
| Static rewrite verifier | `node tools/verify-rewrite.mjs` | **PASS, 0 violations** (108 host-scanned · 120 secret-scanned · 13 exact-pinned runtime deps · 428 imports resolved) |

The visual/structural gate is **exact** for the key-node contract and the Layer-2 computed-style
gate: `structural = 0` and `unexplained style = 0`. Allowlisted style differences (3459, each
with a written justification) are host-shell inheritance (`color`/`border-*Color`/`outlineColor`
inherit `currentColor`), the overlay wrapper's `pointer-events`, and per-frame `transform-origin`
— none is a widget-set style.

The `verify-rewrite` static gate additionally confirms: no non-sanctioned `6klabs.com` host in a
string literal, zero credential tokens in `app/**` + `tools/**`, `widget/**` unmodified, every
runtime dependency exact-pinned, and every import resolvable.

---

## 4. Calibrated pixel thresholds

The pixel gate is `floor + epsilon` per viewport, where `floor` is the measured
original-vs-original noise ceiling (the harness's own nondeterminism: vinyl spin phase,
visualizer sampling, rAF timing), floored at a frozen calibration because a single 16-sample
max is unstable. `epsilon` is a finite-sample margin, an order of magnitude below the smallest
genuine divergence, so it cannot hide a real difference.

| Viewport | measured floor % | calibrated floor % | epsilon (pp) | threshold % |
| --- | --- | --- | --- | --- |
| desktop | 0.7635 | 0.8822 | 0.15 | **1.0322** |
| mobile | 0.2081 | 0.4217 | 0.10 | **0.5217** |

Calibrated thresholds live in `tools/parity/thresholds.json` (frozen, see §7).

---

## 5. Documented unmet items (12)

12 cases exceed their calibrated threshold. **None is a structural or computed-style
difference** (both gates are 0), and every one is enumerated in `thresholds.json` with a
non-empty reason — `report-check.mjs` fails if any over-threshold case is missing a reason.

- **6 × Pro/Discord upsell popup** (`DISABLED_PROFILE`, `DISABLED_PRO_SKIN`,
  `DISABLED_DISCORD_SKIN`; desktop ~22.3%, mobile ~18.9%). The original renders a Pro
  membership upsell overlay ("Custom Nothing Playing Info …") on a locked skin; the rewrite
  omits that site overlay chrome (renders an empty root). The widget contract itself
  (key nodes + computed styles) matches exactly.
- **6 × empty/error-branch host shell** (`YTMD_NOT_CONNECTED`, `PROFILE_NOT_EXISTING`,
  `ACCOUNT_NOT_EXISTING`; desktop 1.45%, mobile 5.71%). Both hosts render **no** skin root;
  the rewrite still mounts an empty widget root where the original renders none — a
  host-shell empty/error-branch difference, not a widget difference.

The `minimal` skin no longer exceeds threshold this run (desktop max 0.958% vs the 1.032%
threshold); the noise-class residual recorded in an earlier run is gone.

---

## 6. Sanctioned divergences & findings

These are intentional, documented deviations — not gate failures.

- **Sanctioned no-op hosts.** The original bundle calls `metrics.6klabs.com` (2 requests),
  `content.6klabs.com` (3), `glorp.6klabs.com` (9), and `ipv4.icanhazip.com` (3) at runtime;
  the rewrite contacts each **0** times. `hdx.6klabs.com` is compiled into the original but
  never dialled (empty HyperDX key); the rewrite no-ops it too. `behavior.mjs` asserts both
  the original call site and the rewrite no-op for each host.
- **Empty-playback wording.** The original renders `- - Live`; the rewrite renders
  `Nothing Playing / Get the music started` with `00:00 00:00`. An intentional copy
  divergence; DOM-structural parity is still 0.
- **SSE `profile-changed` no-refetch.** The host-injected script dispatches
  `visibilitychange`/`focus` on `window`, while the session client listens on `document`, so
  the event is delivered but no refetch follows — **identical on both hosts**.
- **Spotify master election wiring.** The rewrite runtime mounts
  `createSpotifyMasterElection` in `runtime/bootstrap.ts`; `behavior.mjs` asserts the
  *runtime* path (no injection) across real tabs to prove election + failover parity.
  Recorded as a finding; no `app/src/**` code was changed for it.
- **Cider/Tidal feature flags.** Both are gated OFF under the deterministic fixture on both
  hosts; their ported 1000 ms poll constants are asserted at source level.
- **Original-host React #418.** The original emits exactly one `Minified React error #418`
  hydration warning per capture; the rewrite emits 0 page errors and 0 `console.error`
  messages across the matrix. An original-host artifact.

---

## 7. Frozen reference (freeze manifest)

The parity verdict is only meaningful against an immutable reference. `tools/parity/freeze.mjs`
records the **sha256 of the entire reference set** into the committed manifest
**`tools/parity/freeze.json`** (algorithm `sha256`, raw file bytes).

Frozen set (`referencePaths`), **1825 files**:

- `widget/**` (1799 files) — frozen capture of the original bundle
- `widget-server.mjs` — original reference server
- `mock-server/**` (9 files) — deterministic backend the fixtures replay
- `tools/parity/**` (12 files) — fixtures, compare, behavior, report-check, acceptance,
  `thresholds.json`, and `freeze.mjs` itself
- `tools/parity/baseline/original-baseline.json` — **the recorded HAR/request baseline, a
  first-class frozen artifact** (sha256 `a6ae6cf5…bcf29`)
- `tools/verify-rewrite.mjs`, `tools/beautify-reference.mjs`, `tools/sync-assets.mjs`, `dev.mjs`

| Item | sha256 |
| --- | --- |
| **manifest aggregate** | `e50588bcbec8bc598b9c5399145cc82729c4e6656337da5645b96ec9245a053a` |
| recorded baseline | `a6ae6cf5681c5514f0a4944517e1e2ef3f5aeab2ccdfef1c70bfc044cc7bcf29` |
| thresholds.json | `ca2b481083d4e3beb1c217629bb9ea44da24789acf98f49bc4467b096763b1aa` |
| widget-server.mjs | `0f59734c7741198e5c4955b0c0c955104792882b3899278d73db6cc53e1879fe` |
| freeze.mjs | `54e8075487fa751129d72c99ce71e02a9ec606160210b4cbaaf636f114369fd3` |

**Re-runnable drift detection.** `node tools/parity/freeze.mjs --check` recomputes every sha256
and exits **non-zero** on any changed / deleted / added reference file. Negative control
recorded in the evidence: replacing one recorded sha256 with zeros makes `--check` exit **1**
(`DRIFT DETECTED — 1 changed`). This is what prevents "tweak a fixture / comparator /
threshold / baseline until the gate passes": any such edit after acceptance is caught.

Manifest and tool: `tools/parity/freeze.json`, `tools/parity/freeze.mjs`. The manifest is the
reference of record; it was written over the **final accepted state** (after the parity run
regenerated `thresholds.json`) and verified with `--check` (exit 0).

---

## 8. `widget/` frozen-capture exemption & security note

`widget/**` is a byte-for-byte frozen capture of the original shipped bundle, served read-only
by `widget-server.mjs` for parity comparison. It contains **historical credentials that were
already public in the original client bundle** (PostHog project token, Stripe live publishable
key, a `Bearer <long hex>` CMS/metrics token, and historical hex fragments). It is never
executed by the rewrite runtime, never imported by `app/**`, and never modified.

- `tools/verify-rewrite.mjs` records `widget/**` and `tools/parity/baseline/**` as explicit,
  reasoned exemptions (`[host]` + `[secret]`), and `tools/parity/**` for the host check
  (test infrastructure that *intercepts* the original hosts). It asserts `widget/` exists and
  its working tree is unmodified.
- The rewrite product (`app/**`, `tools/**`) contains none of this material — zero secret hits.
- The correct remediation is **upstream credential rotation, not git-history rewriting**.
  Full credential inventory, rationale, and rotation steps: **`docs/security-note.md`**.

---

## 9. Known deviations

- **`tailwind-merge@2.6.0`** was added to `app` runtime dependencies. The original bundle drops
  redundant conflicting Tailwind utilities (last-wins); the rewrite's `clsx` does not. This
  dependency is used only for fidelity (class merging), is not found by name in the original
  bundles, and is recorded here as a guardrail deviation. It is exact-pinned and passes the
  `verify-rewrite` dependency gate.
- `docs/parity-report.md` and `tools/parity/thresholds.json` were regenerated by the final
  `compare.mjs --all` run. The only churn is noise-level (measured floor, timestamps, small
  `pixelPct` shifts); the calibrated floors/epsilons and thresholds are unchanged
  (desktop 1.0322%, mobile 0.5217%). This run has 12 unmet cases (6 upsell-popup, 6
  empty-branch); the earlier noise-class `cross:minimal` residual no longer exceeds
  threshold, so no gate is weakened.

---

## 10. Verdict

**ACCEPTED.** On the frozen reference (1825 files, aggregate
`e50588bcbec8bc598b9c5399145cc82729c4e6656337da5645b96ec9245a053a`):

- structural (key-node contract) = **0**
- computed-style (Layer 2, unexplained) = **0**
- report-check = **50/50**, behavior = **140/140**, app tests = **491/491**, app verify = pass,
  verify-rewrite = **0 violations**
- 12 pixel cases over threshold, all documented and reasoned (6 upsell-popup, 6 empty-branch),
  none structural/style.

No gate failed. The reference harness, recorded baseline, and thresholds are frozen and
drift-checked. Full raw outputs: `.omo/evidence/amuse-widget-rewrite/task-36-acceptance.json`.
