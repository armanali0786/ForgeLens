# ForgeLens

**Explainable Industrial Decision Copilot** — a deterministic-first alternative to black-box anomaly alerts

[Architecture](./ARCHITECTURE.md) · [Design](./DESIGN.md) · [Backend, Database & Security](./BACKEND.md)

> Built in the same problem space platforms like Honeywell Forge and Experion are actively investing in — guided diagnosis, explainable root cause, and operator trust — as a small, self-contained portfolio build.

---

## Table of Contents

- [1. Problem](#1-problem)
- [2. Goals](#2-goals)
- [3. Non-Goals (V1)](#3-non-goals-v1)
- [4. Positioning](#4-positioning)
- [5. Tech Stack](#5-tech-stack)
- [6. System Architecture](#6-system-architecture)
- [7. Data Model](#7-data-model)
- [8. Core Features](#8-core-features)
- [9. UI Scope](#9-ui-scope)
- [10. Build Plan](#10-build-plan)
- [11. Success Criteria](#11-success-criteria)
- [12. Key Architecture Decisions](#12-key-architecture-decisions)
- [13. Roadmap (V2+)](#13-roadmap-v2)
- [14. Getting Started](#14-getting-started)

---

## 1. Problem

Industrial monitoring systems are good at detecting anomalies but bad at explaining them. A typical alert looks like:

> ⚠️ AHU-04 temperature abnormal.

An operator is left to manually answer: *Why did this happen? How serious is it? What changed? What should I check first? Can this wait?*

Anomaly detection is a mature, well-covered capability across the industry. The part of the workflow this project focuses on is the **last-mile decision experience** — turning a raw signal into a trusted, explainable action in under a minute, with a visible record of how the system's judgment improves from operator input over time.

## 2. Goals

- Convert a sensor anomaly into a ranked, evidence-backed action plan in real time.
- Make every recommendation explainable — no black-box "87% confidence, trust me."
- Let engineers correct the system, and have those corrections visibly change future recommendations (operator memory).
- Keep the diagnostic core deterministic and auditable. Treat generative AI as an optional narration layer, not the decision engine.

## 3. Non-Goals (V1)

- No real hardware/IoT integration — synthetic telemetry only.
- No production-grade ML (no Isolation Forest / XGBoost in V1). A rule + correlation engine proves the "explainable, deterministic core" thesis without unfamiliar tooling, and it's something that can be defended line-by-line in review.
- No multi-tenant auth, billing, or org management — single demo workspace only.
- No mobile app.
- Scope is intentionally narrow: one asset type (Air Handling Unit), five sensors, three failure modes.

## 4. Positioning

The pitch is not "an AI chatbot for HVAC." The pitch is:

> A demonstration of how explainability and operator feedback can shorten the gap between an industrial anomaly and a trusted maintenance decision. The diagnostic core is deterministic and evidence-based; generative AI, where used at all, only narrates the reasoning in plain language — it never makes the call.

This project doesn't claim to solve something the industry hasn't touched. It's a scoped, end-to-end demonstration of the same category of capability — guided diagnosis, transparent evidence, visible operator feedback — built solo to showcase frontend architecture, real-time data flow, and product judgment.

## 5. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js + TypeScript + React | Core strength, best place to make the demo shine |
| Realtime | Socket.io | Live alert feed |
| Backend API | Node.js + Express | Consistent stack, no unnecessary framework switch |
| Database | PostgreSQL | Simple relational model is sufficient for V1 scope |
| Diagnostic engine | Rule/correlation engine in TypeScript | Deterministic, explainable, no unfamiliar ML dependency |
| Explanation layer | Template-based text, optional LLM call for phrasing only | Keeps cost near zero, keeps the trust model honest |
| Hosting | Azure (App Service + Postgres) | Matches the cloud platform Forge itself runs on |

Estimated cost: ₹0–₹500 (only if an LLM call is added for narration; the diagnostic core has no API dependency).

## 6. System Architecture

```
Sensor Simulator (Node cron job)
        ↓
PostgreSQL (raw telemetry table)
        ↓
Correlation/Rule Engine (runs on new data)
        ↓
Evidence JSON (structured, deterministic)
        ↓
Explanation Formatter (template, optional LLM polish)
        ↓
Express API (REST + Socket.io push)
        ↓
Next.js Dashboard (React)
        ↓
Engineer feedback (approve / reject / correct)
        ↓
Feedback stored → adjusts future rule weighting ("operator memory")
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for the reasoning behind each layer, including why the diagnostic core emits a stable evidence-JSON contract — the seam where a real ML model could be swapped in later without touching the UI or feedback loop.

## 7. Data Model

| Table | Fields |
|---|---|
| `assets` | id, name, type, location |
| `sensors` | id, asset_id, name, unit, normal_range_min, normal_range_max |
| `telemetry` | id, sensor_id, value, recorded_at |
| `anomalies` | id, asset_id, detected_at, risk_level, likely_cause, confidence, status |
| `evidence` | id, anomaly_id, signal_name, change_description, weight |
| `feedback` | id, anomaly_id, engineer_verdict, actual_cause, created_at |

## 8. Core Features

**8.1 Anomaly Detection** — Rule-based thresholds + rate-of-change checks per sensor. Flags when a signal deviates from its normal range or moves too fast over a rolling window.

**8.2 Root-Cause Correlation** — When an anomaly fires, the engine pulls the last 24h of related sensors on the same asset and checks for correlated movement (e.g., valve command up + cooling output down + fan load flat → valve degradation pattern). Each failure mode is a small rule set mapping signal patterns to a likely cause and confidence score.

**8.3 Explainability Panel ("Why do you think this?")** — Shows the raw evidence list with actual percentage changes, not just a confidence number. Includes an alternative hypothesis with its own probability, so the tool visibly reasons rather than asserts.

**8.4 Action Plan** — Each failure mode maps to a short ranked checklist (inspect X, verify Y, check Z) and an estimated time-to-failure range.

**8.5 Operator Feedback Loop ("Operator Memory")** — Engineer marks a diagnosis Correct, Wrong, or Snooze. On "Wrong," they pick the actual cause. Future occurrences of that signal pattern surface: "Engineers previously identified this pattern as [cause] N times — recommendation adjusted." This is the feature most likely to stand out — it demonstrates a full loop: human expertise → structured feedback → system improvement, visibly, not just claimed.

## 9. UI Scope

- Live asset list with risk badges (color-coded)
- Alert detail view: observation, likely cause, confidence, evidence, recommended actions, ETA to failure
- "Why do you think this?" expandable panel
- Feedback buttons (Correct / Wrong / Snooze) with follow-up cause picker
- History view showing how recommendations improved over time for a given failure pattern

## 10. Build Plan

| Day | Focus |
|---|---|
| 1 | Data model, Postgres setup, sensor simulator generating realistic HVAC telemetry |
| 2 | Threshold-based anomaly detection service |
| 3 | Root-cause correlation rule engine (3 failure modes) |
| 4 | Evidence JSON → explanation formatter, action plan generator |
| 5 | Next.js dashboard: alert list + detail view + explainability panel |
| 6 | Feedback loop (approve/reject/correct) + operator memory logic |
| 7 | Socket.io live updates, polish, demo script, Azure deploy, README/GitHub cleanup |

## 11. Success Criteria

- A visitor understands the value in under 30 seconds from the dashboard alone.
- Every recommendation is traceable to specific evidence — no unexplained numbers.
- The feedback loop visibly changes behavior on a repeated scenario (demoable side-by-side, not just claimed).
- The whole thing runs on free/low-cost infra with zero required paid API keys.

## 12. Key Architecture Decisions

Full detail in [ARCHITECTURE.md](./ARCHITECTURE.md). Summary:

- **Rule engine over ML for V1** — deterministic core is auditable and defensible line-by-line; the evidence-JSON output contract is the seam where a real ML model plugs in later without touching downstream code.
- **Postgres over Timescale** — telemetry volume in V1 doesn't justify a time-series DB; noted as the first thing to revisit at real scale.
- **Socket.io push over polling** — matches the "under a minute" decision-speed goal; noted tradeoffs around reconnect/backpressure handling for production.
- **LLM confined to narration only** — keeps the trust model honest for a safety-adjacent domain; the diagnosis itself never depends on a non-deterministic call.

## 13. Roadmap (V2+)

- Swap the rule engine for a real ML model behind the same evidence-JSON contract.
- Multi-asset, multi-tenant support.
- Real telemetry ingestion (OPC-UA / BACnet) instead of synthetic data.
- Role-based access for multi-engineer feedback attribution.

## 14. Getting Started

```bash
git clone <repo-url>
cd forgelens
npm install

# Environment
cp .env.example .env   # set DATABASE_URL, (optional) LLM_API_KEY

# Database
npm run db:migrate
npm run db:seed        # seeds assets, sensors, and 3 failure-mode scenarios

# Run
npm run dev            # starts API + sensor simulator + Next.js dashboard
```

Dashboard: http://localhost:3000

See [BACKEND.md](./BACKEND.md) for full local setup (including Docker Postgres) and the API reference.

---

**Author:** Arman Ali · Portfolio project, not affiliated with Honeywell International Inc.
