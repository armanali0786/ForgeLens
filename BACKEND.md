# ForgeLens — Backend, Database & Security

Companion to [README.md](./README.md), [ARCHITECTURE.md](./ARCHITECTURE.md), and [DESIGN.md](./DESIGN.md). This document covers everything needed to run the backend and database locally or in Azure, the API surface, and — since this project sits in a safety-adjacent industrial domain — a full accounting of security considerations, including what V1 deliberately does not cover and why.

---

## Table of Contents

- [1. Prerequisites](#1-prerequisites)
- [2. Environment Variables](#2-environment-variables)
- [3. Backend Setup](#3-backend-setup)
- [4. Database Setup](#4-database-setup)
- [5. Database Schema (Full)](#5-database-schema-full)
- [6. API Reference](#6-api-reference)
- [7. Realtime Events (Socket.io)](#7-realtime-events-socketio)
- [8. Error Handling & Logging](#8-error-handling--logging)
- [9. Security Considerations](#9-security-considerations)
- [10. Testing](#10-testing)
- [11. Deployment (Azure)](#11-deployment-azure)
- [12. Production Readiness Checklist](#12-production-readiness-checklist)

---

## 1. Prerequisites

- Node.js 20 LTS
- PostgreSQL 15+ (local, Docker, or Azure Database for PostgreSQL)
- npm 10+
- Git

## 2. Environment Variables

Create a `.env` file at the project root (never committed — see `.gitignore` and §9.2):

```bash
# Database
DATABASE_URL="postgresql://forgelens_app:<password>@localhost:5432/forgelens?schema=public"

# Server
PORT=4000
NODE_ENV=development
CLIENT_ORIGIN="http://localhost:3000"

# Optional LLM narration layer (never required — see ARCHITECTURE.md §2)
LLM_API_KEY=""
LLM_PROVIDER="groq"   # or "openai"

# Session/signing secret (used for CSRF token signing, not user auth — see §9.1)
APP_SECRET="<generate with: openssl rand -hex 32>"
```

`.env.example` should be committed with placeholder values only; `.env` itself must never be committed. See §9.2 for secrets handling in CI/CD.

## 3. Backend Setup

```bash
git clone <repo-url>
cd forgelens

npm install

cp .env.example .env
# edit .env with your local DATABASE_URL

npm run db:migrate      # applies Prisma migrations
npm run db:seed         # seeds assets, sensors, and 3 scripted failure-mode scenarios

npm run dev              # starts Express API + Socket.io + sensor simulator
# in a separate terminal:
npm run dev:web          # starts the Next.js dashboard on :3000
```

API health check: `curl http://localhost:4000/api/health` should return `{"status":"ok"}`.

## 4. Database Setup

**Local via Docker (recommended for development):**

```bash
docker run --name forgelens-db \
  -e POSTGRES_USER=forgelens_app \
  -e POSTGRES_PASSWORD=<password> \
  -e POSTGRES_DB=forgelens \
  -p 5432:5432 -d postgres:16
```

**Migrations** are managed with Prisma:

```bash
npx prisma migrate dev --name init     # create + apply a migration
npx prisma studio                       # visual DB browser, local only — see §9.5
```

**Least-privilege DB user:** the application connects as `forgelens_app`, a role granted only `SELECT/INSERT/UPDATE/DELETE` on the six application tables — not the Postgres superuser, and not schema-alteration rights at runtime. Migrations run under a separate, more privileged `forgelens_migrator` role used only in CI/deploy, never by the running application. This split is small but is exactly the kind of least-privilege habit worth calling out explicitly rather than defaulting to one shared connection string.

## 5. Database Schema (Full)

```sql
CREATE TABLE assets (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  type          TEXT NOT NULL,
  location      TEXT
);

CREATE TABLE sensors (
  id                 SERIAL PRIMARY KEY,
  asset_id           INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  name               TEXT NOT NULL,
  unit               TEXT NOT NULL,
  normal_range_min   NUMERIC NOT NULL,
  normal_range_max   NUMERIC NOT NULL
);

CREATE TABLE telemetry (
  id            BIGSERIAL PRIMARY KEY,
  sensor_id     INTEGER NOT NULL REFERENCES sensors(id) ON DELETE CASCADE,
  value         NUMERIC NOT NULL,
  recorded_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_telemetry_sensor_time ON telemetry (sensor_id, recorded_at DESC);

CREATE TABLE anomalies (
  id            SERIAL PRIMARY KEY,
  asset_id      INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  detected_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  risk_level    TEXT NOT NULL CHECK (risk_level IN ('low','medium','high')),
  likely_cause  TEXT NOT NULL,
  confidence    NUMERIC NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  status        TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','snoozed'))
);

CREATE TABLE evidence (
  id                 SERIAL PRIMARY KEY,
  anomaly_id         INTEGER NOT NULL REFERENCES anomalies(id) ON DELETE CASCADE,
  signal_name        TEXT NOT NULL,
  change_description TEXT NOT NULL,
  weight             NUMERIC NOT NULL CHECK (weight >= 0 AND weight <= 1)
);

CREATE TABLE feedback (
  id               SERIAL PRIMARY KEY,
  anomaly_id       INTEGER NOT NULL REFERENCES anomalies(id) ON DELETE CASCADE,
  engineer_verdict TEXT NOT NULL CHECK (engineer_verdict IN ('correct','wrong','snoozed')),
  actual_cause     TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pattern_weights (
  id             SERIAL PRIMARY KEY,
  asset_id       INTEGER NOT NULL REFERENCES assets(id) ON DELETE CASCADE,
  pattern_name   TEXT NOT NULL,
  weight         NUMERIC NOT NULL DEFAULT 1.0,
  correction_count INTEGER NOT NULL DEFAULT 0,
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (asset_id, pattern_name)
);
```

`CHECK` constraints on `risk_level`, `confidence`, `weight`, and `status` push validation into the database itself, not just the application layer — so a bug in the API can't silently write a `confidence` of `1.4` or a `risk_level` of `"extreme"`. `pattern_weights` is the table backing the operator-memory mechanism described in ARCHITECTURE.md §6.

## 6. API Reference

| Method | Endpoint | Purpose |
|---|---|---|
| `GET` | `/api/health` | Liveness check |
| `GET` | `/api/assets` | List assets with current risk state |
| `GET` | `/api/assets/:id` | Asset detail + sensors |
| `GET` | `/api/anomalies?status=open` | List anomalies, filterable by status |
| `GET` | `/api/anomalies/:id` | Full anomaly detail incl. evidence array |
| `POST` | `/api/anomalies/:id/feedback` | Submit Correct / Wrong / Snooze verdict |
| `GET` | `/api/assets/:id/history/:pattern` | Confidence-over-time data for the History view |

All write endpoints (`POST`) validate their request body against a schema (Zod) before touching the database — see §9.3.

## 7. Realtime Events (Socket.io)

| Event | Direction | Payload |
|---|---|---|
| `anomaly:new` | server → client | Full anomaly object incl. evidence |
| `anomaly:updated` | server → client | Anomaly with revised confidence after a feedback-driven reweight |
| `feedback:recorded` | server → client | Confirmation payload for the submitting client |

Socket connections are scoped to a single demo workspace (no per-user rooms) — an explicit V1 simplification, revisited in §9.7.

## 8. Error Handling & Logging

- All API errors return a consistent shape: `{ error: { code, message } }` — never a raw stack trace to the client.
- Structured logging (JSON lines) for every anomaly detection, correlation run, and feedback write — timestamp, entity id, and action, no telemetry values or PII in log lines beyond what's needed to trace an issue.
- Uncaught exceptions are logged and the process exits deliberately (fail-fast) rather than continuing in a possibly-corrupted state — appropriate for a service whose job is producing trustworthy diagnoses.

## 9. Security Considerations

This project has **no user authentication in V1** — stated as an explicit non-goal in README.md, for a single demo workspace. That doesn't mean security is out of scope; it means the security work that *is* in scope is about not shipping bad habits, and being explicit about what's deferred.

### 9.1 What's actually implemented in V1

- **Input validation on every write path.** All `POST` bodies validated with a schema (Zod) before reaching the database — rejects malformed `engineer_verdict` values, out-of-range confidence overrides, oversized strings, etc. Rejected requests return `400` with a specific reason, never a silent partial write.
- **Parameterized queries only.** Prisma issues parameterized SQL by construction — no raw string concatenation into queries anywhere in the codebase, which removes SQL injection as a risk class rather than "trying to remember" to escape input.
- **CORS locked to a known origin.** `CLIENT_ORIGIN` is read from environment config and enforced via an allow-list, not `*`.
- **Secure HTTP headers via Helmet.** Sets `X-Content-Type-Options`, `X-Frame-Options`, a baseline `Content-Security-Policy`, and strips the `X-Powered-By` header that would otherwise advertise the Express version.
- **Rate limiting on write endpoints.** `POST /feedback` is rate-limited per IP (e.g., 30 req/min) to blunt basic abuse of the one write path that's publicly reachable in a demo deployment.
- **Least-privilege DB role**, separate from the migration role (§4).
- **Secrets never in source control.** `.env` is git-ignored; `.env.example` holds placeholder keys only; `APP_SECRET` and any `LLM_API_KEY` are injected via environment config in every environment, including CI.

### 9.2 Secrets management

| Environment | Where secrets live |
|---|---|
| Local dev | `.env`, git-ignored |
| CI (GitHub Actions) | GitHub encrypted repository secrets, injected as env vars at build time only |
| Azure | Azure App Service Application Settings (encrypted at rest), not baked into the container image |

No secret is ever printed in application logs or CI output; CI is configured to mask secret values in the Actions log output by default.

### 9.3 Input validation, in more detail

Every external input — API request bodies, and notably the sensor simulator's own writes — passes through the same Zod schemas used to define the Evidence JSON contract in ARCHITECTURE.md §1. This means the "one evidence-JSON shape everything downstream trusts" claim in the architecture doc is actually enforced at the boundary, not just true by convention.

### 9.4 Transport security

- Local dev runs over plain HTTP, as usual.
- The Azure deployment is HTTPS-only; Azure App Service's built-in TLS termination handles this, and HTTP requests are redirected to HTTPS at the platform level rather than relying on application code to enforce it.

### 9.5 Explicit non-goals, stated plainly

- **No authentication/authorization.** Single demo workspace — anyone with the URL can view and submit feedback. This is fine for a portfolio deployment and would be the very first thing added before any real use (see §9.6 for what that would look like).
- **`prisma studio` and any DB browser tooling is local-only**, never exposed on the deployed instance.
- **No audit trail on `pattern_weights` changes beyond the `feedback` table itself** — acceptable for a demo, insufficient for a real multi-engineer deployment where "who changed this and when" needs to be independently queryable, not reconstructed from a related table.

### 9.6 What V2 authentication/authorization would add

Stated explicitly so it reads as a deliberate deferral, not a gap that wasn't considered:

- **Role-based access control** — at minimum an `engineer` role (can submit feedback) and a `viewer` role (read-only), with `anomaly_id`/`asset_id` scoping if the deployment ever becomes multi-site.
- **Per-engineer feedback attribution** — `feedback.engineer_id` instead of an anonymous write, so "who corrected this and when" is queryable directly rather than inferred.
- **Session-based or token-based auth** (e.g., NextAuth with an identity provider, or short-lived JWTs issued by the API) — deferred because it adds a login flow that has nothing to do with the thing this project is actually demonstrating.
- **Audit log as its own table**, not reconstructed from `feedback` — an append-only `audit_log` table recording every `pattern_weight` mutation with actor, old value, new value, and timestamp.

### 9.7 Realtime scoping at multi-user scale

Socket.io rooms would be split per engineer session (or per site, in a multi-asset deployment) instead of the single global channel used in V1 — today, every connected client receives every event, which is fine for one demo workspace watched by one person at a time but wouldn't scale to multiple concurrent engineers without unnecessary cross-traffic.

## 10. Testing

V1 testing is scoped to the parts of the system where a silent regression would undermine the project's actual thesis — the deterministic engine — rather than chasing full coverage everywhere:

- **Unit tests on the rule engine** (highest priority): threshold checks, rate-of-change math, and all three failure-mode signatures, including edge cases like a signal sitting exactly on a boundary value. These are pure functions with no I/O, so they're fast and deterministic to test.
- **Unit tests on `pattern_weight` reweighting logic**: verifies a "Wrong" verdict nudges the multiplier down and a "Correct" verdict nudges it up, and that the score shown is always `base_score × pattern_weight`.
- **Integration tests on the API layer**: exercised against a real (test) Postgres database via Prisma, not mocked — covers the `POST /feedback` validation path (§9.3) and the anomaly → evidence read path.
- **No end-to-end/browser test suite in V1** — explicitly deferred. Manual verification against the demo scenarios (§ seed script) substitutes for it; the ROI of a Playwright suite for a single-operator demo UI is low relative to the time cost in a short build window.

```bash
npm run test           # unit tests (engine, reweighting logic)
npm run test:integration  # API tests against a test database
```

## 11. Deployment (Azure)

Deployment topology and cost are covered in [ARCHITECTURE.md §8–9](./ARCHITECTURE.md#8-deployment-architecture-azure); this section is the operational how-to.

1. **Provision infra**: an Azure App Service (Linux, Node 20) and an Azure Database for PostgreSQL – Flexible Server (or Supabase free tier as a zero-cost substitute).
2. **Configure Application Settings** on the App Service with `DATABASE_URL`, `APP_SECRET`, `CLIENT_ORIGIN`, and (optionally) `LLM_API_KEY`/`LLM_PROVIDER` — never in the repo, per §9.2.
3. **Run migrations against the Azure database** using the `forgelens_migrator` role, as a one-off step in the deploy workflow (not from a developer machine against production).
4. **Seed data** once, on first deploy only — the seed script is not idempotent-safe to rerun against a live demo with real feedback history in it.
5. **GitHub Actions** builds on push to `main`, runs the test suite (§10), and deploys to App Service on success. Secrets are pulled from GitHub encrypted repository secrets at build time only.
6. **Verify** via `GET /api/health` against the deployed URL, then a manual smoke pass through the three seeded failure-mode scenarios.

## 12. Production Readiness Checklist

An honest accounting of what's done vs. explicitly deferred, so nothing here reads as an oversight:

| Item | V1 status |
|---|---|
| Input validation on all writes | ✅ Done (§9.1, §9.3) |
| Parameterized queries | ✅ Done by construction (Prisma) |
| Secrets out of source control | ✅ Done (§9.2) |
| HTTPS in production | ✅ Done via Azure platform TLS (§9.4) |
| Rate limiting on public write endpoints | ✅ Done, basic per-IP limit (§9.1) |
| Least-privilege DB roles | ✅ Done (§4) |
| Unit tests on the deterministic core | ✅ Done (§10) |
| Authentication / authorization | ❌ Deferred — explicit V1 non-goal (§9.5, §9.6) |
| Per-engineer audit trail | ❌ Deferred (§9.6) |
| End-to-end/browser test suite | ❌ Deferred (§10) |
| Horizontal scaling (Socket.io adapter, queued correlation) | ❌ Deferred — see ARCHITECTURE.md §10 |
| Telemetry retention/rollup policy | ❌ Deferred — see ARCHITECTURE.md ADR-2 |

---

**Author:** Arman Ali · Portfolio project, not affiliated with Honeywell International Inc.
