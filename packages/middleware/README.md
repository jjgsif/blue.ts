# @blue.ts/middleware

Built-in middleware for blue.ts. Includes CORS, request logging, input validation, rate limiting, and static file serving.

## Installation

```bash
bun add @blue.ts/middleware
```

---

## CORS

Handles preflight requests and applies `Access-Control-*` headers.

```typescript
import { createCorsMiddleware } from '@blue.ts/middleware';

// Allow any origin
const Cors = createCorsMiddleware({ origins: '*' });

// Specific origin with credentials
const Cors = createCorsMiddleware({
    origins: 'https://app.example.com',
    credentials: true,
    methods: ['GET', 'POST', 'DELETE'],
    headers: ['Content-Type', 'Authorization'],
    maxAge: 86400, // preflight cache in seconds
});

// Dynamic origin check
const Cors = createCorsMiddleware({
    origins: (origin) => origin.endsWith('.example.com'),
});

app.use(Cors);
```

For different policies per route, each `createCorsMiddleware` call produces a unique class that can be registered independently:

```typescript
const PublicCors = createCorsMiddleware({ origins: '*' });
const AdminCors  = createCorsMiddleware({ origins: 'https://admin.example.com', credentials: true });

app.group('/public', [PublicCors], (r) => { ... });
app.group('/admin',  [AdminCors],  (r) => { ... });
```

### Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `origins` | `string \| string[] \| (origin: string) => boolean` | — | Required. Allowed origins. |
| `methods` | `string[]` | All standard methods | Allowed HTTP methods. |
| `headers` | `string[]` | `['Content-Type', 'Authorization']` | Allowed request headers. |
| `credentials` | `boolean` | `false` | Set `Access-Control-Allow-Credentials`. |
| `maxAge` | `number` | `86400` | Preflight cache duration in seconds. |

---

## Request Logging

Logs method, path, status code, and duration for every request.

```typescript
import { LoggingMiddleware } from '@blue.ts/middleware';

app.use(LoggingMiddleware);
// → {"timestamp":"2024-01-01T00:00:00.000Z","method":"GET","path":"/users","status":200,"durationMs":12}
```

Custom writer — useful for integrating with `@blue.ts/logging` or suppressing output in tests:

```typescript
const Logging = new LoggingMiddleware({
    writer: (entry) => logger.info('HTTP', entry),
});
```

---

## Input Validation

Validates the request body against a schema. Returns `422 Unprocessable Entity` on failure. Works with any schema library that implements `{ safeParse(data): { success, data, error } }` (Zod, Valibot, etc.).

```typescript
import { createValidationMiddleware } from '@blue.ts/middleware';
import { z } from 'zod';

const schema = z.object({
    name: z.string().min(1),
    email: z.string().email(),
});

const Validate = createValidationMiddleware(schema);

app.post('/users', createUserHandler, { middlewares: [Validate] });
```

On validation failure:
```json
{ "error": "Validation failed", "issues": [...] }
```

---

## Rate Limiting

Sliding window rate limiter. Responds with `429 Too Many Requests` when the limit is exceeded and sets standard `X-RateLimit-*` headers.

```typescript
import { RateLimitMiddleware } from '@blue.ts/middleware';

const RateLimit = new RateLimitMiddleware({
    windowMs: 60_000, // 1 minute
    max: 100,         // requests per window
});

app.use(RateLimit);
```

Custom key function — rate limit by user ID instead of IP:

```typescript
import { getAuthUser } from '@blue.ts/auth';

const RateLimit = new RateLimitMiddleware({
    windowMs: 60_000,
    max: 1000,
    keyFn: (ctx) => getAuthUser(ctx.req)?.id ?? ctx.req.headers.get('x-forwarded-for') ?? 'unknown',
});
```

Custom store — plug in Redis or any other backend:

```typescript
import type { RateLimitStore } from '@blue.ts/middleware';

class RedisRateLimitStore implements RateLimitStore {
    increment(key: string, windowMs: number): Promise<{ count: number; resetMs: number }> {
        // ...
    }
}

const RateLimit = new RateLimitMiddleware({
    windowMs: 60_000,
    max: 100,
    store: new RedisRateLimitStore(),
});
```

### Response headers

| Header | Description |
|--------|-------------|
| `X-RateLimit-Limit` | Maximum requests per window |
| `X-RateLimit-Remaining` | Requests remaining in current window |
| `X-RateLimit-Reset` | Unix timestamp (ms) when the window resets |
| `Retry-After` | Seconds to wait (only on 429 responses) |

---

## Static Files

Serves files from a directory.

```typescript
import { StaticMiddleware } from '@blue.ts/middleware';

const Static = new StaticMiddleware({
    root: './public',
    prefix: '/static', // optional URL prefix
});

app.use(Static);
// GET /static/logo.png → serves ./public/logo.png
```

---

## Combining Middleware

Middleware is applied in order. Global middleware runs before group/route middleware.

```typescript
import { createCorsMiddleware, LoggingMiddleware, RateLimitMiddleware, createValidationMiddleware } from '@blue.ts/middleware';
import { z } from 'zod';

// Global
app.use(LoggingMiddleware);
app.use(createCorsMiddleware({ origins: '*' }));

// Per group
app.group('/api', [new RateLimitMiddleware({ windowMs: 60_000, max: 100 })], (r) => {
    r.post('/users', createUserHandler, {
        middlewares: [createValidationMiddleware(z.object({ name: z.string() }))],
    });
});
```