# URL Shortener

A production-grade URL shortener backend built with **Node.js + Fastify**, featuring distributed short code generation, Redis caching, Kafka-powered analytics streaming, and an Elasticsearch analytics sink.

## Architecture

```
Client
  │
  ▼
Fastify API (Node.js)
  ├── POST /api/urls        → Shorten URL (Postgres range-based ID + Base62)
  ├── GET /:code            → Redirect (Redis cache → Postgres fallback)
  ├── POST /api/auth/*      → Register / Login / Refresh / Logout (JWT)
  └── GET /api/analytics/*  → Click stats (Elasticsearch aggregations)
         │
         ▼ fire-and-forget
       Kafka (click_events topic)
         │
         ▼
     Kafka Consumer Worker
         │
         ▼
     Elasticsearch (analytics index)
```

## Tech Stack

| Component        | Technology                       |
|------------------|----------------------------------|
| HTTP Framework   | Fastify 4                        |
| Primary Database | PostgreSQL 16                    |
| Cache            | Redis 7                          |
| Event Streaming  | Apache Kafka (Confluent)         |
| Analytics Store  | Elasticsearch 8                  |
| Authentication   | JWT (access) + Redis (refresh)   |
| Deployment       | Docker Compose                   |

## Features

- **Distributed short code generation** — PostgreSQL sequence-based range allocation. Each service instance claims a range of IDs (default: 1000) atomically; no central bottleneck. IDs are encoded to Base62 (`a-z`, `A-Z`, `0-9`) for compact, URL-safe codes.
- **Sub-millisecond redirects** — Hot URLs are cached in Redis (24h TTL). Cache miss falls back to Postgres and re-warms the cache.
- **JWT authentication** — Short-lived access tokens (15 min) + opaque refresh tokens stored in Redis for instant revocation on logout.
- **Click event streaming** — Every redirect publishes a `click_events` Kafka message (fire-and-forget, never blocks the redirect response).
- **Analytics pipeline** — A separate Kafka consumer worker bulk-indexes click events into Elasticsearch. Query endpoints expose date-histogram, top-referer, and unique-visitor aggregations.
- **Graceful shutdown** — SIGTERM/SIGINT handlers drain connections for Postgres, Redis, and Kafka producer cleanly.

## Project Structure

```
src/
├── app.js                    # Fastify factory — registers all plugins and routes
├── server.js                 # HTTP entry point + graceful shutdown
├── worker.js                 # Kafka consumer entry point (separate process)
├── config/index.js           # Centralised env config, validates required keys on boot
├── plugins/
│   ├── postgres.js           # pg.Pool decorator → fastify.pg
│   ├── redis.js              # ioredis decorator → fastify.redis
│   ├── kafka.js              # KafkaJS producer → fastify.kafkaProducer
│   ├── elasticsearch.js      # ES client decorator → fastify.esClient
│   └── authenticate.js       # JWT preHandler decorator → fastify.authenticate
├── models/
│   ├── userModel.js          # findByEmail, createUser
│   ├── urlModel.js           # insertUrl, findByCode, findByUserId
│   └── idRangeModel.js       # claimRange (atomic nextval-based range claim)
├── services/
│   ├── authService.js        # register, login, refresh, logout
│   ├── urlService.js         # shortenUrl, resolveUrl (with Redis cache)
│   ├── idRangeService.js     # nextId() singleton with mutex guard
│   ├── clickEventService.js  # publishClickEvent (fire-and-forget)
│   └── analyticsService.js   # getClickStats (ES date-histogram aggregation)
├── routes/
│   ├── auth.js               # POST /api/auth/{register,login,refresh,logout}
│   ├── urls.js               # POST /api/urls, GET /api/urls
│   ├── redirect.js           # GET /:code → 302 redirect
│   └── analytics.js          # GET /api/analytics/:code
├── workers/
│   └── clickConsumer.js      # Kafka → Elasticsearch bulk indexer
├── migrations/
│   ├── run.js                # Lightweight migration runner
│   ├── 001_create_users.sql
│   ├── 002_create_urls.sql
│   └── 003_create_id_ranges.sql
└── utils/
    ├── base62.js             # encode(num) / decode(str)
    ├── hashPassword.js       # bcrypt wrappers
    └── errors.js             # Typed HTTP error constructors
```

## Getting Started

### Prerequisites

- [Docker](https://docs.docker.com/get-docker/) and Docker Compose

### Run locally

```bash
# 1. Clone the repo
git clone https://github.com/vishal-jadeja/URL-Shortener.git
cd URL-Shortener

# 2. Install dependencies (needed for local dev outside Docker)
npm install

# 3. Start all services
docker compose up --build
```

The API will be available at `http://localhost:3000`.

> Docker Compose starts: PostgreSQL, Redis, Zookeeper, Kafka, Elasticsearch, the API server, and the analytics worker. Migrations run automatically before the server starts.

### Environment Variables

Copy `.env.example` to `.env` and adjust values for local development outside Docker:

```bash
cp .env.example .env
```

| Variable                    | Description                                  | Default                  |
|-----------------------------|----------------------------------------------|--------------------------|
| `PORT`                      | HTTP server port                             | `3000`                   |
| `BASE_URL`                  | Public base URL (used in short URL response) | `http://localhost:3000`  |
| `DATABASE_URL`              | PostgreSQL connection string                 | —                        |
| `REDIS_URL`                 | Redis connection URL                         | —                        |
| `KAFKA_BROKERS`             | Comma-separated Kafka broker addresses       | —                        |
| `ES_NODE`                   | Elasticsearch node URL                       | —                        |
| `JWT_SECRET`                | Secret for signing JWTs                      | —                        |
| `JWT_EXPIRES_IN`            | Access token lifetime                        | `15m`                    |
| `REFRESH_TOKEN_TTL_SECONDS` | Refresh token lifetime in seconds            | `604800` (7 days)        |
| `ID_RANGE_SIZE`             | IDs claimed per range allocation             | `1000`                   |

## API Reference

### Auth

```http
POST /api/auth/register
Content-Type: application/json

{ "email": "user@example.com", "password": "password123" }
```

```http
POST /api/auth/login
Content-Type: application/json

{ "email": "user@example.com", "password": "password123" }
```

Response:
```json
{ "accessToken": "<jwt>", "refreshToken": "<opaque-token>" }
```

```http
POST /api/auth/refresh
Content-Type: application/json

{ "refreshToken": "<token>" }
```

```http
POST /api/auth/logout
Content-Type: application/json

{ "refreshToken": "<token>" }
```

### URLs

```http
POST /api/urls
Authorization: Bearer <accessToken>
Content-Type: application/json

{ "originalUrl": "https://example.com/very/long/url" }
```

Response:
```json
{ "code": "aB3x9", "shortUrl": "http://localhost:3000/aB3x9", "originalUrl": "https://..." }
```

```http
GET /api/urls?limit=20&offset=0
Authorization: Bearer <accessToken>
```

### Redirect

```http
GET /:code
→ 302 redirect to original URL
```

Every redirect publishes a click event to Kafka. The analytics worker picks it up and indexes it in Elasticsearch.

### Analytics

```http
GET /api/analytics/:code?from=2024-01-01&to=2024-12-31&interval=day
Authorization: Bearer <accessToken>
```

Response:
```json
{
  "totalClicks": 142,
  "clicksOverTime": [
    { "date": "2024-06-01T00:00:00.000Z", "count": 23 }
  ],
  "topReferers": [
    { "referer": "https://twitter.com", "count": 45 }
  ],
  "uniqueVisitors": 98
}
```

### Health

```http
GET /health
→ { "status": "ok" }
```

## Design Decisions

### Distributed Range-Based ID Generation

Each running instance atomically claims a block of IDs from a PostgreSQL sequence (`id_range_seq`). Since `nextval()` is non-transactional, no two instances ever receive overlapping ranges. IDs are encoded to Base62 — 7 characters can represent over 3.5 trillion unique URLs.

### 302 vs 301 Redirects

The API uses **302 Found** (not 301 Permanent). Browsers permanently cache 301 responses, which means subsequent visits skip the server entirely — click events would stop being recorded after the first visit per browser.

### Kafka Fire-and-Forget

Click event publishing never blocks the redirect response. The redirect handler calls `publishClickEvent(...).catch(log)` without `await`. Redirect latency is decoupled from Kafka write latency entirely.

### At-Least-Once Analytics Delivery

The Kafka consumer uses `eachBatch` with per-message `resolveOffset` + `heartbeat`, followed by `commitOffsetsIfNecessary`. On a consumer crash mid-batch, some events may be re-indexed — acceptable for analytics. For exactly-once, set the Elasticsearch document `_id` to `${code}_${partition}_${offset}`.

## License

MIT
