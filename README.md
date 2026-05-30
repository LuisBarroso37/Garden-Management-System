# Garden Management System

An automated garden management system RESTful API.

## Table of Contents

- [Technical Approach](#technical-approach)
- [Getting Started](#getting-started)
- [Testing](#testing)
- [Considerations](#considerations)

---

## Technical Approach

### Framework: Fastify

I chose Fastify over other frameworks for the following reasons:

- It is a battle-tested framework with a mature ecosystem and a strong plugin architecture.
- Compared to frameworks like NestJS, Fastify is relatively lightweight and straightforward. I prefer frameworks with less abstraction and minimal “magic”.
- It provides excellent TypeScript support.
- Schema validation is integrated into the framework, making it easier to build type-safe and well-structured APIs.

### Database: PostgreSQL + Kysely

I chose **PostgreSQL** other databases for the following reasons:

- **Relational model fits the domain** — the entities (User → Garden → Plant → Metrics) have strict foreign key relationships. A relational database enforces these at the data layer.
- **Rich querying** — reports require aggregations (`SUM`, `COUNT`, `GROUP BY`), date range filtering, and joins across tables. SQL databases excel here while document stores (MongoDB) would require complex aggregation pipelines or denormalization.
- **Typed enums** — `plant_type` as a Postgres enum enforces valid values at the database level.

**Why not alternatives:**

- **MongoDB** — no foreign key enforcement. We would need manual consistency checks for relationships between collections.
- **MySQL** — would also be an option, but Postgres has better support for `RETURNING` clauses (used extensively with Kysely), `gen_random_uuid()`, and richer type system.

I chose **Kysely** as the query builder

- Less abstraction when compared to ORMs
- Allows us to write SQL-like queries with full TypeScript inference.
- Its migration system uses the same query builder API, which keeps the developer experience consistent across the whole application.

### Validation: Zod + `fastify-zod-openapi`

One schema does three jobs:

- **Runtime validation** — Validate inputs to make sure that the data is corrext
- **TypeScript inference** — Validated data gets the corrrect types
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

## Considerations

- I am assuming that gardens are owned by a single user; if is not the case, a join table could be added to support shared access. The spec doesn't explicitly specify this.
- I did not add pagination since since a user will normally not have a lot of gardens or plants.
- We could add linting rules to make sure that certain folders could import only from a defined set of folders.
