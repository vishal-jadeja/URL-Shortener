# URL Shortener Backend — Implementation Plan

## Context
Build a production-grade URL shortener backend from scratch. The system must support creating short URLs via distributed range-based code generation, redirecting users to original URLs (with Redis caching), JWT user authentication, and an analytics pipeline where every redirect publishes a Kafka click event consumed by an Elasticsearch indexer. Local dev runs entirely via Docker Compose.

---

## Tech Stack
- **Runtime**: Node.js + Fastify
- **Primary DB**: PostgreSQL (URL mappings, users, ID range allocation)
- **Cache**: Redis (hot redirect cache + refresh token store)
- **Streaming**: Apache Kafka (click event pub/sub)
- **Analytics sink**: Elasticsearch
- **Deployment**: Docker Compose

---

## Directory Structure
```
url-shortener/
├── docker-compose.yml
├── Dockerfile
├── package.json
├── .env.example
├── src/
│   ├── app.js                    # Fastify factory (plugin registration)
│   ├── server.js                 # HTTP entry point + graceful shutdown
│   ├── worker.js                 # Kafka consumer entry point (separate process)
│   ├── config/index.js           # Env loader, validates required keys at startup
│   ├── plugins/
│   │   ├── postgres.js           # Fastify plugin: decorates fastify.pg
│   │   ├── redis.js              # Fastify plugin: decorates fastify.redis
│   │   ├── kafka.js              # Fastify plugin: decorates fastify.kafkaProducer
│   │   └── authenticate.js       # Fastify plugin: JWT preHandler decorator
│   ├── models/
│   │   ├── userModel.js          # findByEmail, createUser
│   │   ├── urlModel.js           # insertUrl, findByCode, findByUserId
│   │   └── idRangeModel.js       # claimRange (atomic nextval-based)
│   ├── services/
│   │   ├── authService.js        # register, login, refresh, logout, issueTokens
│   │   ├── urlService.js         # shortenUrl, resolveUrl (with Redis cache)
│   │   ├── idRangeService.js     # nextId() singleton with mutex guard
│   │   ├── clickEventService.js  # publishClickEvent (fire-and-forget)
│   │   └── analyticsService.js   # getClickStats (ES aggregation query)
│   ├── routes/
│   │   ├── auth.js               # POST /api/auth/{register,login,refresh,logout}
│   │   ├── urls.js               # POST /api/urls, GET /api/urls (auth required)
│   │   ├── redirect.js           # GET /:code → 302 redirect
│   │   └── analytics.js          # GET /api/analytics/:code (auth required)
│   ├── workers/
│   │   └── clickConsumer.js      # Kafka consumer → ES bulk indexer
│   ├── migrations/
│   │   ├── run.js                # Lightweight migration runner
│   │   ├── 001_create_users.sql
│   │   ├── 002_create_urls.sql
│   │   └── 003_create_id_ranges.sql
│   └── utils/
│       ├── base62.js             # encode(num) / decode(str), handles zero
│       ├── hashPassword.js       # bcrypt wrappers
│       └── errors.js             # Typed HTTP error constructors
```

---

## npm Dependencies

**Production**: `fastify`, `@fastify/jwt`, `@fastify/cookie`, `fastify-plugin`, `pg`, `ioredis`, `kafkajs`, `@elastic/elasticsearch`, `bcrypt`, `dotenv`, `ajv-formats`

**Dev**: `nodemon`, `pino-pretty`

---

## Database Schema

### `001_create_users.sql`
```sql
CREATE TABLE users (
  id            BIGSERIAL PRIMARY KEY,
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_users_email ON users(email);
```

### `002_create_urls.sql`
```sql
CREATE TABLE urls (
  id           BIGINT PRIMARY KEY,
  code         VARCHAR(12) UNIQUE NOT NULL,
  original_url TEXT NOT NULL,
  user_id      BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX idx_urls_code ON urls(code);
CREATE INDEX idx_urls_user_id ON urls(user_id);
```

### `003_create_id_ranges.sql`
```sql
CREATE SEQUENCE id_range_seq START 1 INCREMENT BY 1;
CREATE TABLE id_ranges (range_start BIGINT PRIMARY KEY);
```

---

## Implementation Phases

### Phase 1 — Scaffold + Docker Compose
**Files**: `docker-compose.yml`, `Dockerfile`, `package.json`, `.env.example`, `src/config/index.js`

- Docker Compose services: `app`, `worker`, `postgres`, `redis`, `zookeeper`, `kafka`, `elasticsearch`
- `worker` runs same image as `app` but with `CMD ["node", "src/worker.js"]`
- Kafka: pre-create topic `click_events` with 3 partitions via `KAFKA_CREATE_TOPICS` env var
- Elasticsearch: `discovery.type=single-node`, `xpack.security.enabled=false`
- `app` entrypoint: `node src/migrations/run.js && node src/server.js`
- Config validates all required env keys on startup — fail fast if any missing

### Phase 2 — Database Layer
**Files**: `src/plugins/postgres.js`, `src/plugins/redis.js`, `src/models/*`, `src/migrations/run.js`

- Lightweight migration runner: tracks applied migrations in `schema_migrations` table
- Fastify plugins use `fastify-plugin` to share decorators across route scopes
- `idRangeModel.claimRange(pg, rangeSize)` — atomic claim via:
  ```sql
  WITH next AS (SELECT nextval('id_range_seq') AS seq_val)
  INSERT INTO id_ranges (range_start)
  SELECT seq_val * $1 FROM next
  RETURNING range_start;
  ```
  `nextval` is non-transactional — guarantees no two instances get the same range

### Phase 3 — Auth Routes
**Files**: `src/services/authService.js`, `src/plugins/authenticate.js`, `src/routes/auth.js`

- Access token: JWT, 15-min TTL, payload `{ sub: userId, email }`
- Refresh token: `crypto.randomBytes(32).toString('hex')`, stored in Redis as `refresh:<token>` → `userId`, TTL 7 days
- Routes: `POST /api/auth/register`, `/login`, `/refresh`, `/logout`
- All routes use Fastify JSON Schema for input validation (AJV)
- Refresh token returned in response body (not cookie) for API client compatibility

### Phase 4 — URL Shortening + Redirect
**Files**: `src/services/idRangeService.js`, `src/utils/base62.js`, `src/services/urlService.js`, `src/routes/urls.js`, `src/routes/redirect.js`

**ID Range Service** (singleton, one instance per Node process):
```javascript
// state: { current, max }
// nextId(pg): if current >= max, claimNewRange(pg) with mutex guard
// claimInFlight promise prevents concurrent range claims during exhaustion
```

**Base62**: alphabet `0-9a-zA-Z`, `encode(0)` must return `'0'` explicitly.

**`resolveUrl`**: Redis first (`url:<code>`), fallback to Postgres, re-warm cache on miss.

**Redirect**: Use **302** (not 301) — 301 causes browser caching which stops click events from being recorded.

**Redis cache TTL**: 24 hours on `url:<code>` keys.

### Phase 5 — Kafka Producer (Click Events)
**Files**: `src/plugins/kafka.js`, `src/services/clickEventService.js`

- Producer connects in `fastify.addHook('onReady', ...)` with retry loop (10 retries, 2s delay)
- `allowAutoTopicCreation: false` — topic typos fail loudly instead of creating ghost topics
- Message key = `code` → ensures per-code ordered partitioning for future ordered consumers
- **Fire-and-forget** in redirect route:
  ```javascript
  clickEventService.publishClickEvent(fastify.kafkaProducer, eventData)
    .catch(err => fastify.log.error(err, 'click event publish failed'));
  ```
  Never await in request path — redirect latency must not depend on Kafka

### Phase 6 — Kafka Consumer → Elasticsearch
**Files**: `src/workers/clickConsumer.js`, `src/worker.js`

- Uses `eachBatch` (not `eachMessage`) for bulk ES indexing efficiency
- Pattern: `resolveOffset(msg.offset)` per message → `heartbeat()` → `esClient.bulk()` → `commitOffsetsIfNecessary()`
- `heartbeat()` inside batch loop prevents consumer group rebalance on slow ES writes
- At-least-once delivery (acceptable for analytics; duplicates are noise)
- Exact-once upgrade path: set ES `_id = ${code}_${partition}_${offset}`
- Creates `click_events` ES index on startup (ignores 400 if already exists):
  ```
  code: keyword, originalUrl: keyword, ip: ip, userAgent: text, referer: keyword, timestamp: date
  ```
- Graceful shutdown: `process.on('SIGTERM', () => consumer.disconnect())`

### Phase 7 — Analytics Endpoint
**Files**: `src/services/analyticsService.js`, `src/routes/analytics.js`

- `GET /api/analytics/:code?from=&to=&interval=day` — auth required
- Authorization check: verify `url.user_id === request.user.sub` before querying ES (403 otherwise)
- ES aggregation: bool-filtered date histogram + top referers (`terms`) + unique visitors (`cardinality` on `ip`)
- Returns: `{ totalClicks, clicksOverTime[], topReferers[], uniqueVisitors }`

---

## Key Design Decisions

| Decision | Choice | Reason |
|---|---|---|
| Short code generation | Postgres sequence range | No central bottleneck; each instance is self-sufficient within its range |
| Base62 alphabet | `0-9a-zA-Z` | URL-safe, compact (7 chars = 3.5 trillion URLs) |
| HTTP redirect code | 302 | Prevents browser caching; ensures every redirect registers a click event |
| Kafka publish | Fire-and-forget | Redirect latency must not depend on Kafka write latency |
| Refresh token storage | Redis with TTL | Enables instant revocation on logout |
| Analytics storage | Elasticsearch | Optimized for aggregation queries over high-volume time-series events |
| Consumer delivery | At-least-once | Simpler; acceptable for analytics; upgrade path documented |

---

## Verification Plan

1. `docker compose up --build` — all 7 services start cleanly
2. `POST /api/auth/register` → `POST /api/auth/login` → receive `accessToken`
3. `POST /api/urls` with `Authorization: Bearer <token>` → receive `shortUrl`
4. `GET /:code` in browser → 302 redirect to original URL
5. Check Kafka topic: `kafka-console-consumer --topic click_events` → see click event JSON
6. Check Elasticsearch: `GET /click_events/_search` → see indexed document
7. `GET /api/analytics/:code` → see `totalClicks: 1`, timeline, referers
8. `POST /api/auth/logout` → refresh token deleted from Redis → `POST /api/auth/refresh` returns 401
