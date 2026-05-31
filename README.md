# Garden Management System

An automated garden management system RESTful API.

## Table of Contents

- [Architecture](#architecture)
- [Technical Approach](#technical-approach)
- [Getting Started](#getting-started)
- [Testing](#testing)
- [Considerations](#considerations)
- [Performance Optimization](#performance-optimization)
- [Authentication & User Management](#authentication--user-management)
- [Irrigation System Considerations](#irrigation-system-considerations)
- [Reporting](#reporting)

---

## Architecture

### Project Structure

```
src/
├── routes/          # HTTP handlers (thin — delegate to connectors/utils)
├── connectors/      # Data access layer (one per domain entity)
├── utils/           # Pure functions (business logic, date helpers)
├── schemas/         # Zod schemas, constants, shared types
├── db/              # Kysely instance, migrations, generated types
└── app.ts           # Plugin registration, error handler
```

### Data Model

```
User 1──N Garden 1──N Plant 1──N PlantMetric
```

- **User** — owns one or more gardens
- **Garden** — physical space with a defined surface area
- **Plant** — belongs to a garden, has a type (`vegetable`, `fruit`, `flower`) and ideal humidity level
- **PlantMetric** — time-series record of a plant's humidity and irrigation timestamps

### Error Handling

- **Centralized error handler** — maps Fastify validation errors to `400 VALIDATION_ERROR`, everything else to `500 INTERNAL_ERROR`

### Dependency Injection

Route factories (`createPlantRoutes`, `createIrrigationRoutes`) accept connectors as parameters. This allows tests to easily inject mocks.

## Technical Approach

### Framework: Fastify

I chose Fastify over other frameworks for the following reasons:

- It is a battle-tested framework with a mature ecosystem and a strong plugin architecture.
- Compared to frameworks like NestJS, Fastify is relatively lightweight and straightforward. I prefer frameworks with less abstraction and minimal “magic”.
- It provides excellent TypeScript support.
- Schema validation is integrated into the framework, making it easier to build type-safe APIs.

### Database: PostgreSQL + Kysely

I chose **PostgreSQL** over other databases for the following reasons:

- **Relational model fits the domain** — the entities (User → Garden → Plant → Metrics) have strict foreign key relationships. A relational database enforces these at the data layer.
- **Rich querying** — reports require aggregations (`SUM`, `COUNT`, `GROUP BY`), date range filtering, and joins across tables. SQL databases excel here while document stores (MongoDB) would require complex aggregation pipelines.
- **Typed enums** — `plant_type` as a Postgres enum enforces valid values at the database level.
- **ACID transactions** — multi-table operations (e.g., plant + initial metric creation) are wrapped in transactions with no performance penalty and are very easy to use.

> **Note on plant metrics:** At scale, the append-heavy, time-based nature of plant metrics could justify offloading them to a time-series database (e.g., TimescaleDB) or a write-optimized store (e.g., DynamoDB). At the current volume (one write per plant per minute), PostgreSQL handles this comfortably.

**Why not alternatives:**

- **MongoDB** — no foreign key enforcement. We would need manual consistency checks for relationships between collections.
- **MySQL** — would also be an option, but Postgres has better support for `RETURNING` clauses (used extensively with Kysely), `gen_random_uuid()`, and richer type system.

I chose **Kysely** as the query builder

- Less abstraction when compared to ORMs
- Allows us to write SQL-like queries with full TypeScript inference.
- Its migration system uses the same query builder API, which keeps the developer experience consistent across the whole application.

### Validation: Zod + `fastify-zod-openapi`

One schema does three jobs:

- **Runtime validation** — Validate inputs to make sure that the data is correct
- **TypeScript inference** — Validated data gets the correct types
- **OpenAPI generation** — `.meta()` metadata adds data to Swagger docs

This eliminates the common problem of DTOs, interfaces, and API docs drifting out of sync.

## Getting Started

### Prerequisites

- Node.js 24+
- Docker & Docker Compose
- npm

### Quick Start

```bash
# 1. Clone the repository and install the packages
npm install

# 2. Start development environment (Node.js + PostgreSQL)
npm run docker:up

# 3. Copy env file
cp .env.example .env

# 4. Run migrations and kysely codegen
npm run migrate:up

# 5. Start development server
npm run dev
```

The API will be available at `http://localhost:3000` with Swagger docs at `http://localhost:3000/docs`.

## Testing

```bash
# Run tests in watch mode
npm run test:watch

# Run tests once
npm run test
```

### Strategy

- **Unit tests** — pure utility functions (`src/utils/irrigation.ts`) tested in isolation without mocks
- **Route tests** — mock connectors injected via factory functions, validated with `Mocked<T>` for full type safety
- **Test helpers** — `createTestApp` builds a Fastify instance with validation/serialization wired up; `createMockConnector` factories provide typed mocks

## Considerations

- I am assuming that gardens are owned by a single user; if is not the case, a join table could be added to support shared access. The spec doesn't explicitly specify this.
- I did not add pagination since a user will normally not have a lot of gardens or plants. Could easily be added in the future.
- We could add linting rules to make sure that certain folders could import only from a defined set of folders.
- **No rate limiting on auth endpoints** — login and register are vulnerable to brute force without per-IP rate limiting. In production, `fastify-rate-limit` (or an API gateway throttle) would cap attempts per IP/window.
- **No email verification** — registration accepts any email string without confirming ownership. A production flow would store a verification token (hashed) with an expiry, send a link via SES/SMTP, and only activate the account once the token is confirmed. Cognito or Better Auth handle this out of the box.
- **Soft deletes on plants** — plants use a `deletedAt` column instead of hard deletes. This preserves historical metrics for accurate reporting while hiding deleted plants from active queries (surface area calculations, irrigation ticks, plant listings).

## Performance Optimization

Strategies to optimize response times of frequently used API calls in production:

### Database Query Optimization

Before adding caching layers, ensure the database itself is performing well:

- Use `EXPLAIN ANALYZE` to identify slow queries and verify index usage
- Add composite indexes that match actual query patterns — e.g., `(gardenId, createdAt)` for the plants-added query, `(plantId, lastIrrigationStartTime)` for watering frequency
- Consider partial indexes for hot paths — e.g., `WHERE lastIrrigationStartTime IS NOT NULL` to skip rows that are never relevant
- Monitor for sequential scans on large tables and address with targeted indexes

This is often the highest-ROI optimization — a missing index can make a query much slower, which no amount of caching will fully hide.

### HTTP Caching + CDN

The highest-impact, lowest-effort optimization. Most endpoints serve data that changes infrequently:

- `Cache-Control: max-age=<max age>` on garden/plant list endpoints — data rarely changes between requests
- `ETag` / `If-None-Match` for conditional requests — returns `304 Not Modified` with no body if data hasn't changed
- Reports: `Cache-Control: max-age=300` since data is only as fresh as the aggregation job interval

At the infrastructure level, a CDN or reverse proxy (CloudFront, Nginx) serves cached responses without hitting the application server at all.

### Application-Level Caching (Redis)

Useful when HTTP caching isn't sufficient (internal service-to-service calls, personalized data):

- Cache garden and plant lists keyed by `gardenId`, invalidate on write (create/update/delete)
- Cache report responses keyed by `gardenId:from:to`, TTL matching the aggregation interval
- Pattern: check cache → hit = return immediately, miss = query DB → store in cache → return

### Database Connection Pooling (PgBouncer) (RDS Proxy on AWS).

Node's `pg` pool is per-process. In production with multiple app instances behind a load balancer, connections multiply fast and can exhaust PostgreSQL's `max_connections`.

- PgBouncer sits between the app and Postgres, multiplexing connections
- Transaction-mode pooling handles most use cases
- Reduces connection setup overhead and allows more app instances without increasing DB load

### Read Replicas

- Route all GET queries to a read replica, writes to the primary
- Kysely supports this via separate database instances per connector
- Especially valuable for the report queries which scan more data

### Response Compression

- Fastify's `@fastify/compress` — gzip/brotli responses, reducing payload size 60-80% for JSON
- Nginx, for example, can also do response compression as showed in the `nginx.conf` file

### Disable Response Validation in Production

`fastify-zod-openapi` validates every field of every object in the response through Zod. For list endpoints returning hundreds of items, this adds measurable CPU overhead on data we already control.

Fastify's built-in serializer (`fast-json-stringify`) is significantly faster — it generates a stringifier from the JSON Schema at startup and skips validation entirely, only shaping the output. Since the Zod schemas are already converted to JSON Schema for OpenAPI generation, we can use that JSON Schema for serialization while disabling the Zod runtime check on responses. Input validation remains — we never trust external data.

### Horizontal Scaling

The application is stateless (no in-memory sessions, no local file state), so it scales horizontally behind a load balancer:

- Multiple app instances behind a load balancer, each connecting to the same database through a connection pool
- Auto-scaling based on CPU/memory or request latency

## Authentication & User Management

### Implemented: JWT + Refresh Token Rotation

I implemented a self-managed auth system using short-lived access tokens (15 min) + database-backed refresh tokens with rotation:

- **Register** (`POST /api/auth/register`) — bcrypt password hashing (12 rounds), returns tokens
- **Login** (`POST /api/auth/login`) — verifies credentials, issues token pair
- **Refresh** (`POST /api/auth/refresh`) — rotates refresh token (old one revoked, new pair issued)
- **Logout** (`POST /api/auth/logout`) — revokes refresh token
- **Delete account** (`DELETE /api/auth/account`) — deletes all user data via cascading FK constraints
- **Get profile** (`GET /api/auth/me`) — protected route using `authenticate` middleware

**Why this approach:**

- Access tokens are stateless — no DB lookup on most requests, just signature verification
- Refresh tokens are stored with a hash (SHA-256) in the database — revocable on logout/deletion
- Token rotation means a stolen refresh token becomes invalid once the legitimate user refreshes
- No Redis or external session store required — the database we already have is sufficient

### Token Revocation

Since JWTs can't be revoked before expiry, the trade-off is:

- **Worst case**: a revoked user retains access for ≤15 min (access token TTL)
- **Mitigation**: short TTL + refresh token rotation keeps the window small

For stricter requirements (instant revocation), a Redis blocklist keyed by token `jti` with TTL matching remaining token lifetime would provide O(1) per-request revocation checks.

Or we could use database sessions to have full control when revoking tokens.

### Authorization

Resource-based — every query filters by `userId` from the JWT `sub` claim. No role system needed; ownership is the authorization rule.

**Data isolation strategy — JOIN through ownership chain:**

Every read/write query on `plant` and `plant_metric` joins back to the `garden` table and filters by `garden.userId`. This guarantees data isolation at the database layer regardless of what the calling code passes as `gardenId`:

```sql
SELECT plant.* FROM plant
  INNER JOIN garden ON garden.id = plant."gardenId"
  WHERE plant."gardenId" = $1 AND garden."userId" = $2
```

**Alternative considered — denormalized `userId` column on every table:**

Adding a `userId` column directly to `plant`, `plant_metric`, etc. enables simple `WHERE userId = ?` without joins and is common in multi-tenant SaaS (often combined with Postgres RLS or partition-by-tenant). I rejected it because:

- The FK chain already exists (`user → garden → plant → plant_metric`), so the join is on indexed primary keys (negligible cost)
- Denormalization introduces sync risk — if gardens could be transferred between users, every child row would need updating
- `plant_metric` is append-only (written every irrigation tick); adding a `userId` column to every row is wasted storage for a column only read during auth checks
- The JOIN approach naturally supports **shared gardens** in the future — a `garden_member` join table would slot in without schema changes to child tables

If the system needed table partitioning by tenant or Postgres RLS policies, the denormalized column `userId` on every table would be the right choice.

### Production Recommendation

For a production system on AWS, **AWS Cognito** would replace the self-managed auth:

- Handles registration, email verification, OAuth (Google/Apple/GitHub), MFA, and token management
- JWT validation via cached JWKS — no Cognito calls on each request
- Integrates with the AWS infrastructure already proposed for the irrigation system

**Alternatives:** Better Auth (self-hosted, TypeScript-first, full data ownership), Auth0 (enterprise features, SAML/SCIM), Clerk (pre-built UI components, excellent DX).

| Criteria           | Cognito                  | Better Auth       | Auth0  | Clerk   |
| ------------------ | ------------------------ | ----------------- | ------ | ------- |
| Hosting            | AWS-managed              | Self-hosted       | SaaS   | SaaS    |
| Free tier          | 50k MAU                  | Unlimited         | 7k MAU | 10k MAU |
| Vendor lock-in     | Moderate                 | None              | High   | High    |
| Instant revocation | Refresh token revocation | Yes (DB sessions) | Yes    | Yes     |

## Irrigation System Considerations

### Problem Statement

A scheduler must evaluate every plant's humidity state every minute, send irrigation commands to physical hardware, and track watering duration. This is a real-time event-driven system with per-plant state.

### Constraints

- Every plant starts with **50%** as its `currentHumidityLevel`
- Every minute a plant's `currentHumidityLevel` drops:
  - **1%** for vegetables
  - **3%** for fruits
  - **4%** for flowers
- If a plant drops below its `idealHumidityLevel`, the irrigation system kicks in
- Watering takes **2 minutes** and increases `currentHumidityLevel`:
  - **+16%** for vegetables
  - **+18%** for fruits
  - **+20%** for flowers

### Architecture Options

I wrote a POST handler to showcase the logic and how it would work but we are, of course, missing other infrastructure. I mocked the irrigation system where we would send commands to. The commands include the duration that water should be given to the plant in case the hardware is capable of taking it into account and closing the water valve after the duration has elapsed. This would be the best option and then we would not need to send STOP commands to the hardware.

A good solution in production based on my experience would be something like this:

AWS — EventBridge + Lambda + DynamoDB + IoT Core

| Component                   | Role                                                                                               |
| --------------------------- | -------------------------------------------------------------------------------------------------- |
| **EventBridge Scheduler**   | Fires a "tick" event every 1 minute                                                                |
| **Tick Lambda**             | Reads all plant states from DynamoDB, applies humidity decay, decides which plants need watering   |
| **DynamoDB**                | Stores per-plant live state (`currentHumidityLevel`, `isBeingWatered`, `wateringMinutesRemaining`) |
| **AWS IoT Core**            | Sends MQTT commands (`START_WATERING` / `STOP_WATERING`) to physical irrigation controllers        |
| **SQS (Dead Letter Queue)** | Catches failed commands for retry                                                                  |
| **CloudWatch**              | Metrics/alarms for humidity thresholds and system health                                           |

#### Flow

```
EventBridge (every 1 min)
    │
    ▼
Tick Lambda
    │
    ├──▶ Read plant states from DynamoDB
    ├──▶ Apply humidity decay per plant type
    ├──▶ Evaluate thresholds
    ├──▶ Update DynamoDB (conditional writes)
    │
    ├──▶ Publish commands to AWS IoT Core (MQTT)
    │       │
    │       ├── Success → Physical Irrigation Controller
    │       │                └──▶ Open/Close valve
    │       │
    │       └── Failure ──▶ SQS Dead Letter Queue
    │                           └──▶ Retry / Alert
```

#### Why This Works

- Serverless scales well to thousands of plants
- DynamoDB handles per-plant state with very low latency
- IoT Core is purpose-built for device communication (MQTT)

## Reporting

### Current Implementation

`GET /api/reports?gardenId=...&from=...&to=...` runs three queries in parallel (`Promise.all`) and assembles the response:

| Metric             | Query                                                                                            |
| ------------------ | ------------------------------------------------------------------------------------------------ |
| Watered plants     | Count distinct plants that received irrigation (had a `lastIrrigationStartTime`) in the period   |
| Unwatered plants   | Total plants minus watered plants (includes plants that stayed healthy and didn't need watering) |
| Watering frequency | Group by plant, count distinct irrigation start times                                            |
| Plants added       | Count plants with `createdAt >= from`                                                            |

This is simple, correct, and fast enough at low volume. The queries hit indexed columns (`gardenId`, `plantId`, `createdAt`, `lastIrrigationStartTime`).
Plants use soft deletes (`deletedAt` column), so the report can count plants deleted within the period.

### Possible Approach: Pre-Aggregated Summaries

At scale (millions of metric rows, frequent report requests), running live aggregation queries becomes expensive. A better approach would be:

```
┌─────────────────────────────────────────────────┐
│  Aggregation Job (scheduled, e.g. every 5 min)  │
│  - Reads raw metrics since last run             │
│  - Computes: watering count per plant/hour,     │
│    plants added/deleted per day                 │
│  - Upserts into summary tables                  │
└─────────────────────┬───────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────┐
│  Report Endpoint                                │
│  - Reads pre-computed summaries                 │
│  - Instant response, no heavy aggregations      │
└─────────────────────────────────────────────────┘
```

**Summary tables:**

```sql
-- Per-plant hourly watering count (one row per plant per hour).
-- The job truncates timestamps to the hour (date_trunc('hour', ...))
-- and upserts the count, so multiple runs accumulate into the same row.
CREATE TABLE watering_summary (
  garden_id      UUID NOT NULL,
  plant_id       UUID NOT NULL,
  hour           TIMESTAMPTZ NOT NULL,  -- truncated, e.g., '2025-03-15T10:00:00Z'
  watering_count INTEGER DEFAULT 0,
  PRIMARY KEY (garden_id, plant_id, hour)
);

-- Per-garden daily event count
CREATE TABLE garden_daily_summary (
  garden_id      UUID NOT NULL,
  day            DATE NOT NULL,
  plants_added   INTEGER DEFAULT 0,
  plants_deleted INTEGER DEFAULT 0,
  PRIMARY KEY (garden_id, day)
);
```

The job upserts rows during the same hour (`INSERT ... ON CONFLICT UPDATE`) so it's idempotent — safe to re-run if it fails mid-execution. In this example, data is at most 5 minutes stale and the smallest queryable unit is 1 hour.

The report endpoint then becomes a simple range query over the summary:

```sql
SELECT plant_id, SUM(watering_count)
FROM watering_summary
WHERE garden_id = $1 AND hour BETWEEN $from AND $to
GROUP BY plant_id;
```

This scans ~24 rows per plant for a 24h range, instead of potentially millions of raw metric rows.

**Benefits:**

- Report endpoint responds fast regardless of data volume
- Aggregation job can run off-peak or on a read replica of the database
- Summary table is small and easily cacheable:
  Redis/Memcached — store the report response keyed by gardenId:from:to, TTL matching the aggregation interval (e.g., 5 min). Cache hit = no DB query at all.
  HTTP caching — set Cache-Control: max-age=300 on the response. Since the data only changes when the aggregation job runs, clients can serve stale responses safely.

**Alternatives considered:**

- **Async report generation** — useful for expensive exports (PDF, CSV) but unnecessary for simple JSON responses

POST /reports kicks off a job and returns a reportId. Client polls GET /reports/:id or gets a webhook/notification when ready. Good for expensive reports (PDF, large date ranges).
