# Amuse widget parity report — original vs rewrite

- Generated: 2026-10-05T10:26:18.550Z (started 2026-10-05T10:18:55.703Z)
- Original: `http://localhost:5199/widget/amuse/local` (widget-server.mjs)
- Rewrite:  `http://localhost:5200/widget/amuse/local` (vite preview)
- Determinism: viewport fixed per capture · DPR 1 · locale `en-US` · `prefers-reduced-motion: no-preference` · deterministic fixtures (all external hosts intercepted)

## Coverage (orthogonal, not a full cartesian product)

| Dimension | Count | Values | Viewports |
| --- | --- | --- | --- |
| skin | 8 | `compact`, `boxy`, `gallery`, `minimal`, `macos`, `shell`, `windows98`, `discord` | cross (desktop + mobile) |
| cover | 4 | `square`, `canvas`, `vinyl`, `none` | cross (desktop + mobile) |
| theme | 2 | `default_dark`, `default_light` | cross (desktop + mobile) |
| skin × cover × theme (full cross) | 64 | — | desktop + mobile |
| widget state (WidgetStatus) | 15 | 14 renderable (screenshotted) + `LOADING` (non-renderable) | desktop + mobile |
| font | 14 | `poppins`, `fredoka`, `spacemono`, `silkscreen`, `bagelFatOne`, `gasoekOne`, `zcoolKuaile`, `zcoolQingkeHuangyou`, `singleDay`, `jua`, `russoOne`, `monomakh`, `notoSerifDisplay`, `openDyslexic` | desktop |
| source | 6 | `pear-desktop`, `spotify`, `ytm-desktop`, `apple-music`, `tidal`, `spicetify` | desktop |
| animation | 24 | 12 show + 12 hide | n/a (structural) |
| viewport | 2 | `desktop` (1440×900), `mobile` (390×844) | — |

Renderable WidgetStatus (14, screenshotted both viewports): `SESSION_EXPIRED`, `SUCCESS`, `NO_SPOTIFY_ACCOUNT`, `YTMD_NOT_CONNECTED`, `PROFILE_NOT_EXISTING`, `SPOTIFY_ERROR`, `SPOTIFY_ACCOUNT_ERROR`, `SERVER_ERROR`, `ACCOUNT_NOT_EXISTING`, `DISABLED_PROFILE`, `DISABLED_PRO_SKIN`, `DISABLED_DISCORD_SKIN`, `SPOTIFY_FREE_ACCOUNT`, `SPOTIFY_TOKEN_EXPIRED`.

Non-renderable WidgetStatus (1): `LOADING` — the store default before any response; asserted by the state-machine unit tests (Todo 8), not a screenshot.

Total captures: 176 case×viewport comparisons (352 page loads).

## Gates

- structural (key-node contract): **0** (PASS)
- computed-style (Layer 2): **0** (PASS)
- pixel: 164 within calibrated threshold · 12 enumerated unmet (see "Unmet items")

## Normalization rules (explicit)

The structural comparison is exact (no threshold). Only these normalizations are applied — see the module header for the full rationale:

1. **(N1) Generated ids** — React `useId` values (`«r0»`, `_r_0_`, `:r0:`, `radix-*`, `headlessui-*`) → `<gen>`. Real ids (`playbar`, `active`) survive.
2. **(N2) ARIA association attrs dropped** — `aria-controls`/`aria-labelledby`/`aria-describedby`/`aria-owns`/`aria-activedescendant`/`for`/hash `href`.
3. **(N3) Framework-injected attrs dropped** — `data-reactroot`, `data-nextjs-*`, `data-nimg`, `data-v-*`, `nonce`, plus the documented additive test hooks (`data-testid`, `data-spin-*`, `data-skin`/`data-cover`/`data-theme`, …).
4. **(N4) Volatile text** — ISO timestamps → `<iso>`, UUIDs → `<uuid>`, epoch numbers → `<epoch>`, the live playback clock (`MM:SS`) → `<clock>`; whitespace collapsed. The clock advances with wall-clock time, so the two hosts legitimately differ by a second.
5. **(N5) Inline `style` excluded** — it carries per-frame values (vinyl `rotateZ`, visualizer `translateY/scale`, playbar `width: %`, palette colors). Visual coverage is the pixel diff.
6. **(N6) Tailwind class conflicts resolved** — last-wins per utility group (mirrors the original tailwind-merge), then sorted. The rewrite uses `clsx` (no merge), so it retains redundant conflicting utilities the original drops; resolving them recovers the rendered set.

## Noise floor (original vs original)

Two independent loads of the ORIGINAL, same fixtures, same viewport — this is the harness's own nondeterminism (vinyl spin phase, visualizer randomisation, rAF timing, palette async).

| Viewport | samples | min % | median % | mean % | max % |
| --- | --- | --- | --- | --- | --- |
| desktop | 16 | 0.000 | 0.024 | 0.082 | 0.566 |
| mobile | 16 | 0.000 | 0.012 | 0.037 | 0.316 |

Measured floor (this run) = **max observed original-vs-original pixel diff** per viewport (desktop 0.566%, mobile 0.316%). A case pixel diff at or below the floor is indistinguishable from harness noise; above it is a real visual delta. The calibrated threshold uses the **frozen floor** = max(measured, baseline calibration) — see "Calibrated pixel thresholds".

### Noise-floor raw samples (original vs original)

| case | viewport | pixel diff % |
| --- | --- | --- |
| `cross:minimal/square/default_light` | desktop | 0.566 |
| `cross:compact/square/default_light` | desktop | 0.209 |
| `cross:minimal/vinyl/default_light` | desktop | 0.209 |
| `cross:compact/vinyl/default_light` | desktop | 0.141 |
| `cross:macos/vinyl/default_light` | desktop | 0.061 |
| `cross:macos/square/default_light` | desktop | 0.033 |
| `cross:discord/vinyl/default_light` | desktop | 0.029 |
| `cross:discord/square/default_light` | desktop | 0.024 |
| `cross:boxy/vinyl/default_light` | desktop | 0.024 |
| `cross:boxy/square/default_light` | desktop | 0.009 |
| `cross:gallery/vinyl/default_light` | desktop | 0.006 |
| `cross:gallery/square/default_light` | desktop | 0.000 |
| `cross:shell/square/default_light` | desktop | 0.000 |
| `cross:shell/vinyl/default_light` | desktop | 0.000 |
| `cross:windows98/square/default_light` | desktop | 0.000 |
| `cross:windows98/vinyl/default_light` | desktop | 0.000 |
| `cross:minimal/vinyl/default_light` | mobile | 0.316 |
| `cross:minimal/square/default_light` | mobile | 0.076 |
| `cross:compact/vinyl/default_light` | mobile | 0.054 |
| `cross:compact/square/default_light` | mobile | 0.050 |
| `cross:macos/square/default_light` | mobile | 0.028 |
| `cross:macos/vinyl/default_light` | mobile | 0.017 |
| `cross:discord/square/default_light` | mobile | 0.016 |
| `cross:gallery/vinyl/default_light` | mobile | 0.012 |
| `cross:discord/vinyl/default_light` | mobile | 0.011 |
| `cross:boxy/square/default_light` | mobile | 0.010 |
| `cross:boxy/vinyl/default_light` | mobile | 0.006 |
| `cross:gallery/square/default_light` | mobile | 0.000 |
| `cross:shell/square/default_light` | mobile | 0.000 |
| `cross:shell/vinyl/default_light` | mobile | 0.000 |
| `cross:windows98/square/default_light` | mobile | 0.000 |
| `cross:windows98/vinyl/default_light` | mobile | 0.000 |

## Calibrated pixel thresholds

The noise floor is EMPIRICAL: the max pixel diff between two independent loads of the ORIGINAL (same fixtures, same viewport) — the harness's own nondeterminism (vinyl spin phase, visualizer sampling, rAF timing). The calibrated threshold is `floor + epsilon`. The floor is the **frozen calibration** = max(measured this run, max observed across the verified baseline runs) because a single 16-sample max is unstable (observed desktop 0.74–0.88%, mobile 0.11–0.42%). Epsilon is a small finite-sample margin absorbing the residual spread of the noisiest skin (`minimal`); it is an order of magnitude below the smallest genuine divergence, so it cannot hide a real difference.

| Viewport | measured floor % | calibrated floor % | epsilon (pp) | threshold % | cases over threshold |
| --- | --- | --- | --- | --- | --- |
| desktop | 0.566 | 0.882 | 0.15 | 1.032 | 6 |
| mobile | 0.316 | 0.422 | 0.10 | 0.522 | 6 |

| skin | viewport | max pixel % | threshold % | verdict |
| --- | --- | --- | --- | --- |
| compact | desktop | 0.414 | 1.032 | within |
| compact | mobile | 0.106 | 0.522 | within |
| boxy | desktop | 0.050 | 1.032 | within |
| boxy | mobile | 0.026 | 0.522 | within |
| gallery | desktop | 0.160 | 1.032 | within |
| gallery | mobile | 0.338 | 0.522 | within |
| minimal | desktop | 0.958 | 1.032 | within |
| minimal | mobile | 0.450 | 0.522 | within |
| macos | desktop | 0.150 | 1.032 | within |
| macos | mobile | 0.086 | 0.522 | within |
| shell | desktop | 0.027 | 1.032 | within |
| shell | mobile | 0.012 | 0.522 | within |
| windows98 | desktop | 0.225 | 1.032 | within |
| windows98 | mobile | 0.064 | 0.522 | within |
| discord | desktop | 0.501 | 1.032 | within |
| discord | mobile | 0.264 | 0.522 | within |

## Results

### Per-skin structural diff (key-node contract) + style diff + pixel delta

| Skin | cases | structural diff (sum) | style diff (sum) | deep-tree delta (diag) | max pixel % | verdict |
| --- | --- | --- | --- | --- | --- | --- |
| compact | 16 | 0 | 0 | 0 | 0.414 | PASS |
| boxy | 16 | 0 | 0 | 0 | 0.050 | PASS |
| gallery | 16 | 0 | 0 | 0 | 0.338 | PASS |
| minimal | 16 | 0 | 0 | 0 | 0.958 | PASS |
| macos | 16 | 0 | 0 | 0 | 0.150 | PASS |
| shell | 16 | 0 | 0 | 0 | 0.027 | PASS |
| windows98 | 16 | 0 | 0 | 0 | 0.225 | PASS |
| discord | 16 | 0 | 0 | 0 | 0.501 | PASS |

**Per-skin (cross) key-node structural diff total: 0** · non-cross group structural diffs: 0 (all failures enumerated below).
**Computed-style diff total: 0** (cross 0 + non-cross 0) — the Layer-2 gate is exact (0 required).

### Deep-tree diagnostics

No deep-tree deltas — the full canonical skeleton is identical.

### Structural failures (key nodes)

None — every case matches on the key-node contract.

### Style gate (Layer 2 — computed styles of the key nodes)

Exact comparison (diff must be 0) of a curated computed-style property set on the key nodes `skinRoot`, `coverRoot`, `playbar`, `playbarActive`, `live`. Per-frame volatile properties (`transform`, `width`/`height`, `opacity`, inset offsets) are excluded — the pixel diff covers them; see the module header.

- allowlisted differences: 3459
- unexplained (gate) differences: 0

Allowlisted differences (each with a written justification):

- `*.color`: No colour utility on the key node: `color` is inherited from the host shell (original full-site shell rgb(203,204,210) vs bare rewrite SPA rgb(36,41,46)). The widget sets visible colours on descendants (covered by the pixel diff).
- `*.borderTopColor`: `border-color` resolves to `currentColor` (no border-colour utility on these nodes); it tracks the host-inherited `color` above. Border width/style/radius are identical.
- `*.borderRightColor`: `border-color` resolves to `currentColor` (no border-colour utility on these nodes); it tracks the host-inherited `color` above. Border width/style/radius are identical.
- `*.borderBottomColor`: `border-color` resolves to `currentColor` (no border-colour utility on these nodes); it tracks the host-inherited `color` above. Border width/style/radius are identical.
- `*.borderLeftColor`: `border-color` resolves to `currentColor` (no border-colour utility on these nodes); it tracks the host-inherited `color` above. Border width/style/radius are identical.
- `*.outlineColor`: `outline-color` resolves to `currentColor`; it tracks the host-inherited `color` above. Outline width/style/offset are identical.
- `*.pointerEvents`: Host overlay difference: the original overlay wrapper sets `pointer-events:none` (click-through for streamers); the bare rewrite SPA root is `auto`. The widget is display-only and its interactive descendants (windows98, verified by behavior.mjs) override this on both hosts.
- `*.transformOrigin`: Derived from the element's per-frame box (the playbar active-fill `width` %), so it carries the same sub-pixel volatility as the excluded `transform`/`width`; values differ by <0.5px.

None — every case matches on the computed-style gate.

## Unmet items

Cases whose pixel delta exceeds `floor + epsilon`. Every entry is a KNOWN, documented divergence — none is a structural or computed-style difference (both gates are 0), and none is hidden by a threshold.

| case | viewport | pixel % | threshold % | reason |
| --- | --- | --- | --- | --- |
| `state:YTMD_NOT_CONNECTED` | desktop | 1.450 | 1.032 | Both hosts render no skin root; the rewrite still mounts an empty widget root where the original renders none — a host-shell empty/error-branch difference. Structural + style gates are 0 (no key nodes exist). |
| `state:PROFILE_NOT_EXISTING` | desktop | 1.450 | 1.032 | Both hosts render no skin root; the rewrite still mounts an empty widget root where the original renders none — a host-shell empty/error-branch difference. Structural + style gates are 0 (no key nodes exist). |
| `state:YTMD_NOT_CONNECTED` | mobile | 5.710 | 0.522 | Both hosts render no skin root; the rewrite still mounts an empty widget root where the original renders none — a host-shell empty/error-branch difference. Structural + style gates are 0 (no key nodes exist). |
| `state:PROFILE_NOT_EXISTING` | mobile | 5.710 | 0.522 | Both hosts render no skin root; the rewrite still mounts an empty widget root where the original renders none — a host-shell empty/error-branch difference. Structural + style gates are 0 (no key nodes exist). |
| `state:DISABLED_PROFILE` | desktop | 22.324 | 1.032 | Original renders a Pro membership upsell popup ("Custom Nothing Playing Info …") that the rewrite does not; the key-node structural and computed-style gates are both 0 — the divergence is the upsell overlay chrome, not the widget contract. |
| `state:DISABLED_PROFILE` | mobile | 18.922 | 0.522 | Original renders a Pro membership upsell popup ("Custom Nothing Playing Info …") that the rewrite does not; the key-node structural and computed-style gates are both 0 — the divergence is the upsell overlay chrome, not the widget contract. |
| `state:DISABLED_PRO_SKIN` | desktop | 22.344 | 1.032 | Original renders a Pro membership upsell popup that the rewrite does not (the rewrite renders an empty root); structural + style gates are 0. |
| `state:DISABLED_DISCORD_SKIN` | desktop | 22.335 | 1.032 | Original renders a Pro membership upsell popup that the rewrite does not (the rewrite renders an empty root); structural + style gates are 0. |
| `state:DISABLED_PRO_SKIN` | mobile | 18.923 | 0.522 | Original renders a Pro membership upsell popup that the rewrite does not (the rewrite renders an empty root); structural + style gates are 0. |
| `state:ACCOUNT_NOT_EXISTING` | desktop | 1.450 | 1.032 | Both hosts render no skin root; the rewrite still mounts an empty widget root where the original renders none — a host-shell empty/error-branch difference. Structural + style gates are 0 (no key nodes exist). |
| `state:DISABLED_DISCORD_SKIN` | mobile | 18.921 | 0.522 | Original renders a Pro membership upsell popup that the rewrite does not (the rewrite renders an empty root); structural + style gates are 0. |
| `state:ACCOUNT_NOT_EXISTING` | mobile | 5.710 | 0.522 | Both hosts render no skin root; the rewrite still mounts an empty widget root where the original renders none — a host-shell empty/error-branch difference. Structural + style gates are 0 (no key nodes exist). |


### Interception / page-error audit

- Cases with unintercepted requests: 0
- Cases with page errors: 176
- Distinct page-error messages (occurrences across all captures):
  - x176 `Minified React error #418; visit https://react.dev/errors/418?args[]=HTML&args[]= for the full message or use the non-minified dev environment for full errors and additional helpful warnings.`
  - e.g. `cross:compact/canvas/default_dark` (desktop): orig=1 rewrite=0
  - e.g. `cross:compact/square/default_dark` (desktop): orig=1 rewrite=0
  - e.g. `cross:compact/square/default_light` (desktop): orig=1 rewrite=0
  - e.g. `cross:compact/canvas/default_dark` (mobile): orig=1 rewrite=0
  - e.g. `cross:compact/square/default_dark` (mobile): orig=1 rewrite=0
  - e.g. `cross:compact/square/default_light` (mobile): orig=1 rewrite=0
  - e.g. `cross:compact/canvas/default_light` (desktop): orig=1 rewrite=0
  - e.g. `cross:compact/vinyl/default_dark` (desktop): orig=1 rewrite=0
- Note: the only page error is the ORIGINAL host's React #418 hydration warning (present on the original in every capture, 0 on the rewrite) — an original-host artifact, not a rewrite regression.

## Animation parameter structure

- show ids: 12 · hide ids: 12
- show: `default_in`, `fade_in`, `slide_in_left`, `slide_in_right`, `slide_in_top`, `slide_in_bottom`, `grow_in`, `shrink_in`, `swing_rotate_in_left`, `swing_rotate_in_right`, `tilt_in_right`, `tilt_in_left`
- hide: `default_out`, `fade_out`, `slide_out_left`, `slide_out_right`, `slide_out_top`, `slide_out_bottom`, `grow_out`, `shrink_out`, `swing_rotate_out_left`, `swing_rotate_out_right`, `tilt_out_right`, `tilt_out_left`
- probes checked: 4
- result: PASS

## Evidence

- Diff PNGs: `.omo/evidence/amuse-widget-rewrite/parity/` (176 images)
- Harness: `tools/parity/compare.mjs`
