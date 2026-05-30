# Garden Management System

An automated garden management system RESTful API.

## Table of Contents

- [Architecture](#architecture)
- [Technical Approach](#technical-approach)
- [Getting Started](#getting-started)
- [Testing](#testing)
- [Considerations](#considerations)
- [Irrigation System Considerations](#irrigation-system-considerations)

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

I wrote a POST handler to showcase the logic and how it would work but we are, of course, missing other infrastructure. I mocked the irrigation system where we would send commands to. The commands include the duration that water should be given to the plant in case the hardware is capable of taking it into account and closing the water valve after the duration has elaped. This would be the best option and then we would not need to send STOP commands to the hardware.

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
The current system cannot count the deleted plants at the moment. That would require us to "archive" a plant instead to keep the records in the database.

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
