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
- I did not add pagination since since a user will normally not have a lot of gardens or plants. Could easily be added in the future.
- We could add linting rules to make sure that certain folders could import only from a defined set of folders.

## Irrigation System considerations

## Problem Statement

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

## Architecture Options

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
