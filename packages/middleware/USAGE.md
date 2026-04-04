# @blue.ts/middleware — Usage Guide

All middleware in this package follows the same pattern: they are classes registered in
the DI container and applied globally via `app.use()` or per-route via `middlewares: [...]`.

```typescript
import { CorsMiddleware, LoggingMiddleware, RateLimitMiddleware,
         StaticMiddleware, validate } from '@blue.ts/middleware';
```

---

## Table of Contents

- [CorsMiddleware](#corsmiddleware)
- [validate()](#validate)
- [StaticMiddleware](#staticmiddleware)
- [LoggingMiddleware](#loggingmiddleware)
- [RateLimitMiddleware](#ratelimitmiddleware)

---

## CorsMiddleware

Handles CORS preflight (`OPTIONS`) requests and annotates regular responses with the
appropriate `Access-Control-*` headers.

There are two ways to use CORS depending on whether you need a single global policy
or different policies per route.

### Global policy — `CorsMiddleware`

Register once and apply to every route via `app.use()`:

```typescript
app.registerDependency(CorsMiddleware, {
  lifetime: 'singleton',
  factory: () => new CorsMiddleware({
    origins: ['https://app.example.com', 'https://staging.example.com'],
  }),
});

app.use(CorsMiddleware);
```

### Per-route policy — `cors()` factory

`cors(options)` works like `validate()`: each call returns a unique class with the
options baked in, so different routes can have independent CORS configurations
registered as separate container identifiers.

```typescript
import {createCorsMiddleware} from "@blue.ts/middleware";

const PublicCors = createCorsMiddleware({origins: '*'});
const AdminCors = createCorsMiddleware({origins: 'https://admin.example.com', credentials: true});

app.registerDependency(PublicCors, {
  lifetime: 'singleton',
  factory: () => new PublicCors(),
});
app.registerDependency(AdminCors, {
  lifetime: 'singleton',
  factory: () => new AdminCors(),
});

// Public routes — any origin allowed
app.route('GET', '/api/products', {middlewares: [PublicCors], handler: ListProductsHandler});

// Admin routes — restricted origin + credentials
app.route('GET', '/admin/users', {middlewares: [AdminCors], handler: ListUsersHandler});
```

Each call to `cors()` produces a distinct class, so `PublicCors !== AdminCors` and they
occupy separate slots in the container.

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `origins` | `string \| string[] \| (origin: string) => boolean` | — | **Required.** Allowed origins. `'*'` permits all. |
| `methods` | `string[]` | `['GET','HEAD','PUT','PATCH','POST','DELETE']` | Allowed HTTP methods |
| `headers` | `string[]` | `['Content-Type','Authorization']` | Allowed and exposed request headers |
| `credentials` | `boolean` | `false` | Set `Access-Control-Allow-Credentials: true` |
| `maxAge` | `number` | `86400` | Preflight cache duration in seconds |

### Origin matching

```typescript
// Exact string
new CorsMiddleware({ origins: 'https://example.com' })

// Array of allowed origins
new CorsMiddleware({ origins: ['https://app.com', 'https://admin.app.com'] })

// Wildcard — allows any origin
new CorsMiddleware({ origins: '*' })

// Predicate function — for dynamic logic (e.g. allow all subdomains)
new CorsMiddleware({ origins: (origin) => origin.endsWith('.example.com') })
```

### Behaviour

- **Preflight (`OPTIONS`)** — returns `204` immediately, never calls `next()`.
  CORS headers are added only when the request origin is allowed.
- **Regular requests** — calls `next()` and adds CORS headers to the response.
- **Missing `Origin` header** — no CORS headers are added; the request passes through unchanged.
- **`credentials: true` with `origins: '*'`** — the CORS spec forbids the `*` wildcard
  when credentials mode is enabled. `CorsMiddleware` automatically echoes the actual
  request origin instead:
  ```typescript
  // ✅ Correct — do not combine these naively
  new CorsMiddleware({ origins: '*', credentials: true })
  // Access-Control-Allow-Origin will be the actual request origin, not '*'
  ```

---

## validate()

A factory that returns a `Middleware` constructor with a schema baked in via closure.
Returns `422 Unprocessable Entity` on failure with a structured issues array.

Compatible with any schema library that implements `safeParse()` — Zod, Valibot, ArkType.

### Registration

Each call to `validate()` produces a unique class, so each validator is registered
independently. Use it per-route via `middlewares: [...]`.

```typescript
import { z } from 'zod';
import { validate } from '@blue.ts/middleware';

const CreateUserSchema = z.object({
  name:  z.string().min(1),
  email: z.string().email(),
  age:   z.number().int().min(0).optional(),
});

const CreateUserValidator = validate(CreateUserSchema);

app.registerDependency(CreateUserValidator, {
  lifetime: 'transient',
  factory: () => new (CreateUserValidator as any)(),
});

app.route('POST', '/users', {
  middlewares: [CreateUserValidator],
  handler:     CreateUserHandler,
});
```

### Error response

When validation fails, the middleware returns `422` and never calls `next()`:

```json
{
  "error": "Validation failed",
  "issues": [
    { "path": "email",        "message": "Invalid email" },
    { "path": "address.zip",  "message": "Required" }
  ]
}
```

Nested field paths are joined with `.` (e.g. `address.zip` from `['address', 'zip']`).

When the request body is not valid JSON at all:

```json
{ "error": "Invalid JSON", "issues": [] }
```

### Body caching

`validate()` reads the request body via `ctx.json()`. Because `Context` caches the raw
body buffer, the downstream handler can call `ctx.json()` again without re-reading the
stream:

```typescript
class CreateUserHandler {
  async handle(ctx: Context): Promise<Response> {
    // Safe to call even though validate() already read the body
    const body = await ctx.json<{ name: string; email: string }>();
    // ...
  }
}
```

### Using a non-Zod schema

Any object with a compatible `safeParse()` method works:

```typescript
import * as v from 'valibot';

const schema = v.object({ name: v.string() });

// Wrap Valibot's standalone safeParse to match SchemaLike<T>
const BodyValidator = validate({
  safeParse: (data) => v.safeParse(schema, data),
});
```

---

## StaticMiddleware

Serves files from a directory on disk. Uses `Bun.file()` on Bun for zero-copy serving
and falls back to `node:fs/promises` on Node.js. Passes through to `next()` on a miss.

### Registration

```typescript
app.registerDependency(StaticMiddleware, {
  lifetime: 'singleton',
  factory: () => new StaticMiddleware({ dir: './public' }),
});

app.use(StaticMiddleware);
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `dir` | `string` | — | **Required.** Directory to serve from. Resolved to an absolute path at construction. |
| `prefix` | `string` | `''` | URL prefix to strip before resolving the file path |

### Prefix stripping

```typescript
// Serves GET /static/app.js from ./public/app.js
new StaticMiddleware({ dir: './public', prefix: '/static' })

// Without a prefix, GET /app.js maps to ./public/app.js
new StaticMiddleware({ dir: './public' })
```

Requests whose path does not start with the configured prefix are passed to `next()`
immediately — the static middleware is never in the hot path for non-static routes.

### MIME types

Common extensions are detected automatically:

| Extension | Content-Type |
|---|---|
| `.html`, `.htm` | `text/html; charset=utf-8` |
| `.css` | `text/css; charset=utf-8` |
| `.js`, `.mjs` | `text/javascript; charset=utf-8` |
| `.json` | `application/json` |
| `.png`, `.jpg`, `.gif`, `.webp` | image types |
| `.svg` | `image/svg+xml` |
| `.woff`, `.woff2` | font types |
| other | `application/octet-stream` |

### Security

- **Path traversal via URL** — literal `..` sequences in URLs (`/../etc/passwd`) are
  normalised by the URL API before the middleware sees them.
- **Encoded traversal** — `%2e%2e%2f` sequences are decoded by `decodeURIComponent` and
  then caught by the `path.relative()` containment check, which returns `403 Forbidden`.
- **Directory requests** — a URL that resolves to the base directory itself calls
  `next()`, allowing a handler to serve an index page.

---

## LoggingMiddleware

Writes one structured log entry per request after the response is returned. Duration
is measured from when `handle()` is called to when `next()` resolves.

### Registration

```typescript
app.registerDependency(LoggingMiddleware, {
  lifetime: 'singleton',
  factory: () => new LoggingMiddleware(),
});

app.use(LoggingMiddleware);
```

### Default output

Each entry is written as a single-line JSON string via `console.log`:

```json
{"timestamp":"2026-04-04T12:00:00.123Z","method":"POST","path":"/users","status":201,"durationMs":14}
```

### Custom writer

Inject a `writer` function to forward log entries to a structured logger, log aggregator,
or test assertion:

```typescript
import pino from 'pino';
const logger = pino();

new LoggingMiddleware({
  writer: (entry) => logger.info(entry),
})
```

### LogEntry type

```typescript
interface LogEntry {
  timestamp: string;   // ISO 8601
  method:    string;   // HTTP method
  path:      string;   // URL pathname only (no query string)
  status:    number;   // Response status code
  durationMs: number;  // Elapsed milliseconds
}
```

### Error behaviour

When `next()` throws, `LoggingMiddleware` logs the entry with `status: 500` and
re-throws the error. `App.onError` still runs — the logger does not swallow errors.

```
GET /users → throws → log { status: 500 } → re-throw → App.onError → 500 response
```

---

## RateLimitMiddleware

Limits the number of requests per time window using a sliding window algorithm.
Returns `429 Too Many Requests` with `Retry-After` and `X-RateLimit-*` headers when
the limit is exceeded.

### Registration

Register as a `singleton` so the in-memory window store persists across requests.

```typescript
app.registerDependency(RateLimitMiddleware, {
  lifetime: 'singleton',
  factory: () => new RateLimitMiddleware({ windowMs: 60_000, max: 100 }),
});

// Globally — applies to every route
app.use(RateLimitMiddleware);

// Or per-route — tighter limits on sensitive endpoints
app.route('POST', '/auth/login', {
  middlewares: [RateLimitMiddleware],
  handler:     LoginHandler,
});
```

### Options

| Option | Type | Default | Description |
|---|---|---|---|
| `windowMs` | `number` | — | **Required.** Sliding window duration in milliseconds |
| `max` | `number` | — | **Required.** Maximum requests allowed per window |
| `store` | `RateLimitStore` | In-memory | Pluggable store for distributed rate limiting |
| `keyFn` | `(ctx: Context) => string` | First IP in `X-Forwarded-For` | Extracts the bucket key from the request |

### Response headers

All responses (allowed and blocked) carry rate limit headers:

| Header | Description |
|---|---|
| `X-RateLimit-Limit` | The configured `max` value |
| `X-RateLimit-Remaining` | Requests remaining in the current window |
| `X-RateLimit-Reset` | Unix timestamp (ms) when the oldest hit leaves the window |
| `Retry-After` | Seconds until the limit resets (blocked responses only) |

### Custom key function

By default, requests are bucketed by the first IP in `X-Forwarded-For`. Override
`keyFn` to bucket by user, API key, or any other dimension:

```typescript
new RateLimitMiddleware({
  windowMs: 60_000,
  max: 1000,
  keyFn: (ctx) => ctx.req.headers.get('X-Api-Key') ?? 'anonymous',
})
```

### Pluggable store

The default in-memory store works for single-instance deployments. For multi-instance
or horizontally scaled applications, implement `RateLimitStore` and back it with Redis
or a database:

```typescript
import type { RateLimitStore } from '@blue.ts/middleware';

class RedisStore implements RateLimitStore {
  constructor(private redis: Redis) {}

  async increment(key: string, windowMs: number) {
    const now    = Date.now();
    const cutoff = now - windowMs;
    const pipe   = this.redis.pipeline();

    pipe.zremrangebyscore(key, 0, cutoff);
    pipe.zadd(key, now, `${now}-${Math.random()}`);
    pipe.zcard(key);
    pipe.pexpire(key, windowMs);

    const results = await pipe.exec();
    const count   = results![2]![1] as number;
    const resetMs = now + windowMs;  // approximate

    return { count, resetMs };
  }
}

app.registerDependency(RateLimitMiddleware, {
  lifetime: 'singleton',
  factory: (c) => new RateLimitMiddleware({
    windowMs: 60_000,
    max: 100,
    store: new RedisStore(redis),
  }),
});
```