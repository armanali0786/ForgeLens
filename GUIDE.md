# ForgeLens — What It Is and How It Works

This document is a plain-language walkthrough of the whole project: what problem it
solves, how data actually flows from a fake sensor reading to a diagnosis on your
screen, and what every file in the codebase does. Read this if you're getting
reoriented after time away, or explaining the project to someone else.

For the *pitch* (why this exists, what it's not) see [README.md](./README.md).
For *design rationale* on every architecture/UI choice, see
[ARCHITECTURE.md](./ARCHITECTURE.md) and [DESIGN.md](./DESIGN.md).
For the *API/DB/security* reference, see [BACKEND.md](./BACKEND.md).
This document is the "how it actually runs, file by file" layer underneath those.

---

## Table of Contents

- [1. The One-Sentence Version](#1-the-one-sentence-version)
- [2. The Cast of Characters](#2-the-cast-of-characters)
- [3. Step by Step: One Full Cycle](#3-step-by-step-one-full-cycle)
- [4. The Codebase, File by File](#4-the-codebase-file-by-file)
- [5. The Data Model, Plainly](#5-the-data-model-plainly)
- [6. How "Operator Memory" Actually Works](#6-how-operator-memory-actually-works)
- [7. Running It](#7-running-it)
- [8. Common Questions](#8-common-questions)

---

## 1. The One-Sentence Version

Five fake air-handling units (AHUs) get fake sensor readings written to Postgres
every 4 seconds; when a reading looks wrong, a small rule engine (not an ML model)
figures out *why* using correlated sensor movement, shows its work on a dashboard,
and remembers whether an engineer agreed with it so it scores better next time.

There is no real hardware anywhere in this project. "Sensors" are a `setInterval`
loop writing numbers into a `telemetry` table.

## 2. The Cast of Characters

| Thing | What it really is |
|---|---|
| An "asset" | A row in the `assets` table, e.g. `AHU-04`. Purely a label + location. |
| A "sensor" | A row in `sensors` — a name, a unit, and a normal min/max range. |
| The "simulator" | A `setInterval` in `server/simulator.ts` that invents a plausible number for every sensor on every asset, every 4 seconds, and writes it to `telemetry`. |
| A "failure mode" | A hard-coded pattern in `server/engine/signatures.ts` — e.g. "if valve command goes up AND cooling output goes down AND fan load stays flat, that's valve degradation." |
| "Detection" | A pure function (`server/engine/detection.ts`) that checks one new reading against its sensor's normal range and its own recent history. No database, no async — just math. |
| "Correlation" | The engine (`server/engine/correlation.ts`) that runs *after* detection flags something — it looks at the last 24h of every relevant sensor and scores all 3 failure modes against what actually happened. |
| An "anomaly" | A row in the `anomalies` table — the frozen record of what the correlation engine concluded at the moment detection fired. |
| "Evidence" | Rows in the `evidence` table — the specific sensor movements that justified the anomaly's likely cause, shown as the bars in the "Why do you think this?" panel. |
| "Operator memory" | A `pattern_weight` per asset+failure-mode in the `pattern_weights` table, nudged up on "Correct" feedback and down on "Wrong" feedback. |

## 3. Step by Step: One Full Cycle

This is a real trace from testing — AHU-04 developing "valve degradation."

### Step 1 — The simulator invents a number

Every 4 seconds (`TICK_MS` in `server/simulator.ts`), for every sensor on every
asset, the simulator computes one new value and calls
`prisma.telemetry.create(...)` to write it.

For a healthy asset (AHU-01, AHU-02), the value is just `baseline + random noise`.

For AHU-04, which is scripted to start failing at `tick 10`
(`ASSET_PLAN` in `simulator.ts`), the value instead ramps from its baseline toward
a "failed" target over 90 ticks (`SCENARIOS.valve_degradation`):

```
valve_command:   40  →  95   (ramping up)
cooling_output:  60  →  25   (ramping down)
supply_air_temp: 60  →  74   (ramping up — this is what actually trips the alarm)
```

Nothing here calls this "valve degradation" yet — the simulator is just *injecting
a realistic physical failure pattern* into otherwise-random data. It has no idea
what the correlation engine will conclude.

### Step 2 — Detection checks the new number

Immediately after writing each telemetry row, `simulator.ts` calls
`detectAnomaly()` from `server/engine/detection.ts` with:

- the new value
- the sensor's `normal_min` / `normal_max`
- the last 8 readings for that exact sensor (`WINDOW_SIZE`)

Two independent checks run:

```
out_of_range:   value < min OR value > max
rapid_change:   |value - windowAverage| / windowAverage > 12%
```

For `supply_air_temp`, once the ramp pushes it past `65°F` (its `normal_max`),
`out_of_range` fires. This is the only place in the whole system that makes a
"something is wrong" decision — and it's five lines of arithmetic, not a model.

### Step 3 — Correlation figures out *why*

Once one sensor flags, `simulator.ts` calls `diagnose(assetId, ...)` in
`server/engine/correlation.ts`. This is the interesting part:

1. It pulls the **last 24h of telemetry** for every sensor referenced by *any* of
   the 3 failure signatures (not just the one that tripped) — `loadRecentSeries()`.
2. For each sensor's series, `classifyDirection()` compares the average of the
   first third of the window against the average of the last third, and labels
   the sensor `up`, `down`, or `flat` (anything under a 5% swing counts as flat).
3. For each of the 3 signatures in `signatures.ts`, it checks how many of that
   signature's expected directions actually matched, and sums up the matched
   *weights* (each signature's 3 signals are weighted to add to 1.0).
4. That sum is multiplied by the asset's `pattern_weight` for that failure mode
   (starts at 1.0 — this is the operator-memory multiplier, more in §6) and
   clamped to a 5%–97% confidence range (never claim 100%, never claim 0%).
5. All 3 scored candidates are sorted by confidence. The top one is `primary`,
   the second is `alternative` — this is what powers the "Alt: Fan fault (5%)"
   line in the UI.

For AHU-04 in our test run, this produced:

```
valve_degradation:  97% (valve_command ↑22%, cooling_output ↓10%, fan_load flat ✓✓✓)
fan_fault:           5% (nothing matched)
filter_clog:         5% (nothing matched)
```

### Step 4 — The anomaly gets written and pushed live

`simulator.ts` writes one `anomalies` row (assetId, riskLevel, likelyCause,
confidence, status: `"open"`) plus one `evidence` row per matched signal, then
calls `emitAnomalyNew()` (`server/socket.ts`), which pushes an
`anomaly:new` Socket.io event to every connected browser.

It also records `openAnomalyByAsset.set(assetId, patternName)` in memory — a
guard so the *same* asset doesn't spam a new anomaly every 4 seconds while it's
still failing. (This guard is rebuilt from the DB on server startup — see the
comment in `startSimulator()` — otherwise a server restart mid-incident would
let a duplicate anomaly slip through for a condition that's already open.)

### Step 5 — The dashboard shows it

`components/Dashboard.tsx` listens for `anomaly:new` and invalidates the
`["assets"]` React Query cache, which re-fetches `GET /api/assets` and updates
the sidebar risk dot for AHU-04 to a red triangle.

Clicking AHU-04 opens `components/AlertDetail.tsx`, which fetches
`GET /api/anomalies/:id`. Notably, this endpoint **doesn't just return the frozen
database row** — `routes.ts` calls `scoreAllSignatures(assetId)` again live, so
the confidence/evidence/alternative you see always reflects *current* telemetry
and the *current* pattern_weight, not just what was true at the exact instant
detection fired. The persisted `likelyCause`/`confidence` on the anomaly row stay
as the historical snapshot used by the History panel.

The evidence bars, action plan, and ETA-to-failure all come straight from the
matched `FailureSignature` in `signatures.ts` — nothing here is generated text,
it's the same static data the correlation engine scored against.

### Step 6 — The engineer gives feedback

Clicking **Correct** in `components/FeedbackControl.tsx` calls
`POST /api/anomalies/:id/feedback`. On the server (`routes.ts`):

1. A `feedback` row is written (verdict + optional actual-cause).
2. `applyFeedback()` in `correlation.ts` looks up the asset's `pattern_weight` row
   for that failure mode (slugified from the likely-cause label — see the
   comment in `signatures.ts` about why the two have to stay in sync) and nudges
   it: **+0.08 on Correct, −0.15 on Wrong**, clamped to `[0.2, 1.5]`.
3. The anomaly's `status` flips to `resolved` (or `snoozed`).
4. The in-memory `openAnomalyByAsset` guard is cleared for that asset, so the
   *next* time detection fires for it, a fresh anomaly can be raised.
5. `anomaly:updated` and `feedback:recorded` events push out over Socket.io.

Next time this exact failure mode fires on this exact asset, step 3's confidence
math multiplies by the *new* pattern_weight — a "Correct" verdict makes the same
diagnosis score slightly higher next time; "Wrong" makes it score lower (and the
UI shows "Adjusted · N prior corrections" so this is visible, not just claimed).

## 4. The Codebase, File by File

```
prisma/
  schema.prisma        The 6 tables (assets, sensors, telemetry, anomalies,
                        evidence, feedback) + pattern_weights for operator memory.
  migrations/           SQL Prisma generated from the schema — you don't hand-edit this.
  seed.ts               Wipes everything, creates 5 AHUs with 5 sensors each.

server/
  index.ts              Entry point: Express app, Helmet, CORS, rate limiting,
                         wires up Socket.io, starts the simulator.
  db.ts                 One shared Prisma client instance.
  routes.ts             Every REST endpoint (see BACKEND.md §6 for the table).
  socket.ts             Socket.io server setup + the 3 emit helper functions.
  simulator.ts          The fake-sensor tick loop + the 3 scripted failure scenarios.
  engine/
    types.ts            Shared TS types for the Evidence JSON contract.
    detection.ts         Pure functions: threshold + rate-of-change checks.
    signatures.ts         The 3 hard-coded failure-mode definitions.
    correlation.ts         Scores signatures against telemetry, operator-memory logic.
    explain.ts              Turns a diagnosis into one plain-English paragraph.
  __tests__/             Vitest unit tests for detection.ts and correlation.ts.

app/                    Next.js App Router — layout.tsx, page.tsx, providers.tsx
                        (React Query setup), icon.svg (favicon).

components/             The dashboard UI — Dashboard.tsx is the top-level client
                         component; everything else is one visual piece
                         (AssetList, AlertDetail, EvidencePanel, ActionPlan,
                         FeedbackControl, HistoryView, RiskBadge).

lib/
  types.ts              Frontend-side copies of the API response shapes.
  api.ts                 fetch() wrappers for every endpoint.
  socket.ts               Singleton Socket.io client.

styles/globals.css      All CSS — design tokens from DESIGN.md §3, no CSS framework.
```

## 5. The Data Model, Plainly

```
assets ──< sensors ──< telemetry        (raw numbers, growing forever)
   │
   └──< anomalies ──< evidence           (frozen diagnosis snapshots)
              │
              └──< feedback              (what the engineer said)

assets ──< pattern_weights               (one row per asset+failure-mode ever
                                           corrected — this is "operator memory")
```

`pattern_weights` is the only table that isn't a straightforward transaction log —
it's a running multiplier, keyed by `(assetId, patternName)`, that the
correlation engine reads every time it re-scores that failure mode for that asset.

## 6. How "Operator Memory" Actually Works

This is the feature the whole project is built to demonstrate, so it's worth
being extremely concrete:

- Every failure signature starts at `pattern_weight = 1.0` for every asset (no
  row exists yet — `correlation.ts` treats a missing row as 1.0).
- `confidence = min(0.97, max(0.05, baseScore × pattern_weight))`, where
  `baseScore` is the sum of matched-signal weights (0.0–1.0).
- A "Correct" verdict: `pattern_weight = clamp(pattern_weight + 0.08, 0.2, 1.5)`.
- A "Wrong" verdict: `pattern_weight = clamp(pattern_weight - 0.15, 0.2, 1.5)`.
- "Snooze" doesn't touch the weight at all (it's not a verdict on correctness).
- The UI shows `Adjusted · N prior corrections` (from `correctionCount`, which
  increments on both Correct and Wrong, not Snooze) whenever `correctionCount > 0`
  — so the adjustment is always visible, never a silent number change.

Because confidence is *recomputed live* on every page load (see Step 5 above),
you can literally watch this: give the same asset a "Wrong" verdict a few times
in a row, and the next time that exact failure pattern occurs, its confidence
number will be visibly lower than the first time you saw it.

## 7. Running It

Full command reference already covered in an earlier message in this
conversation — short version:

```bash
docker start forgelens-db      # Postgres
npm run dev                     # API + Socket.io + simulator → :4000
npm run dev:web                 # Next.js dashboard → :3000
```

Then open http://localhost:3000, click an asset with a red/amber marker, and
give it feedback.

## 8. Common Questions

**Why does a low-confidence asset sometimes show the "wrong" likely cause at
first?** Early in a failure ramp, not enough sensors have moved far enough to
tell signatures apart — the engine is being honest about low confidence (e.g.
20%) rather than guessing with false certainty. This is intentional, not a bug.

**Why does the "likely cause" sometimes change if I reload the page?** Because
confidence is recomputed live against current telemetry (§5, §6), not frozen at
detection time. If the underlying pattern becomes clearer (or muddier) over the
next few minutes of simulated data, the ranking can shift. The original
detection-time diagnosis is preserved in the History panel regardless.

**Where would a real ML model plug in?** Entirely inside
`server/engine/correlation.ts`'s `scoreAllSignatures()` — as long as it returns
the same `CandidateCause[]` shape, nothing in `routes.ts`, the UI, or the
feedback loop needs to change. That's the "Evidence JSON contract" ARCHITECTURE.md
talks about.
