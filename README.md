# blue.ts

A mildly opinionated HTTP framework for TypeScript. Class-based handlers and IoC dependency injection — without decorators, `experimentalDecorators`, or `reflect-metadata`. Built on [Bun](https://bun.sh), with adapters for Node.js and Deno.

```bash
bun install
```

---

## Quick Start

### Function handlers

```typescript
import { App, Container, Router, BunAdapter, Context } from '@blue.ts/core';

const app = new App(new Container(new Map()), new Router());

app.get('/health', () => new Response('ok'));

app.get('/users/:id', (ctx) =>
    Context.json({ id: ctx.params['id'] })
);

app.post('/users', async (ctx) => {
    const body = await ctx.json<{ name: string }>();
    return Context.json({ created: body.name }, { status: 201 });
});

app.listen(new BunAdapter(), { port: 3000 });
```

### Class handlers

```typescript
class GetUserHandler {
    constructor(private readonly db: Database) {}

    async handle(ctx: Context): Promise<Response> {
        const user = await this.db.find(ctx.params['id']!);
        return user
            ? Context.json(user)
            : Context.json({ error: 'Not Found' }, { status: 404 });
    }
}

// Register the handler's dependencies, then route to it.
// Zero-dependency handlers are auto-registered — no extra step needed.
app.registerDependency(GetUserHandler, {
    lifetime: 'transient',
    factory: async (c) => new GetUserHandler(await c.get(Database)),
});
app.route('GET', '/users/:id', { handler: GetUserHandler });
```

---

## Packages

| Package | Description |
|---|---|
| `@blue.ts/core` | App, Container, Router, Context, adapters |
| `@blue.ts/middleware` | CORS, validation, static files, rate limiting, request logging |
| `@blue.ts/logging` | Structured logger, pino-compatible output, pluggable transports |

---

## Core — `@blue.ts/core`

### Routing

**Function handlers** — inline functions, no container registration needed:

```typescript
app.get('/ping', () => new Response('pong'));
app.post('/echo', async (ctx) => new Response(await ctx.text()));
app.put('/users/:id', (ctx) => Context.json({ id: ctx.params['id'] }));
app.patch('/users/:id', async (ctx) => { /* ... */ });
app.delete('/users/:id', (ctx) => Context.empty());
```

**Class handlers** — resolved through the IoC container; dependencies injected via constructor:

```typescript
app.route('GET', '/users/:id', { handler: GetUserHandler });
app.route('POST', '/users',    { handler: CreateUserHandler });
```

Zero-dependency class handlers are auto-registered as `transient`. Handlers that need constructor injection require an explicit `registerDependency` call beforehand.

**Named routes** — generate URLs from a name without hardcoding paths:

```typescript
app.get('/users/:id', handler, { name: 'user.show' });
app.url('user.show', { id: '42' }); // → '/users/42'
```

### Route Groups

Group related routes under a shared prefix and middleware stack:

```typescript
app.group('/api/v1', (r) => {
    r.get('/users',     listUsers);
    r.post('/users',    createUser);
    r.get('/users/:id', getUser);
});

// With group-level middleware
app.group('/admin', [AuthMiddleware], (r) => {
    r.get('/stats', getStats);

    // Nested groups compose both prefix and middleware
    r.group('/users', [AuditMiddleware], (admin) => {
        admin.delete('/:id', deleteUser);
    });
});
```

### Middleware

Middleware is class-based with a `handle(ctx, next)` signature:

```typescript
class AuthMiddleware {
    handle(ctx: Context, next: () => Response | Promise<Response>) {
        const token = ctx.headers.get('Authorization');
        if (!token) return Context.json({ error: 'Unauthorized' }, { status: 401 });
        return next();
    }
}
```

Register globally (all routes) or per-route:

```typescript
// Global — every request
app.use(LoggingMiddleware, AuthMiddleware);

// Route-level — this route only, runs after global middleware
app.route('DELETE', '/users/:id', {
    middlewares: [OwnerOnlyMiddleware],
    handler: DeleteUserHandler,
});
```

Execution order: **global** (FIFO) → **group** → **route-level** → **handler**.

### Context

Per-request context with body caching — the body is read once from the stream and cached, so middleware and handler can both read it:

```typescript
ctx.req              // raw Request
ctx.params           // route params — Record<string, string>
ctx.headers          // request Headers
ctx.searchParams     // URLSearchParams
ctx.cookies          // ReadonlyMap<string, string> — parsed Cookie header

await ctx.text()     // body as string (cached)
await ctx.json<T>()  // body parsed as JSON (cached)
await ctx.formData() // body as FormData (cached)
```

**Response factories:**

```typescript
Context.json(data, init?)     // 200 application/json
Context.text(body, init?)     // 200 text/plain
Context.redirect(url, status) // 302 by default
Context.empty(status?)        // 204 by default
```

---

## IoC Container

```typescript
const container = new Container(new Map());

// Singleton — one instance for the lifetime of the process
container.register(DatabaseService, {
    lifetime: 'singleton',
    factory: () => new DatabaseService(process.env.DATABASE_URL),
});

// Scoped — one instance per request (fresh per request scope)
container.register(RequestLogger, {
    lifetime: 'scoped',
    factory: async (c) => new RequestLogger(await c.get(Logger)),
});

// Transient — new instance on every resolution
container.register(EmailService, {
    lifetime: 'transient',
    factory: async (c) => new EmailService(await c.get(SmtpClient)),
});
```

Identifiers can be a class constructor, string, or symbol:

```typescript
container.register('config',          { lifetime: 'singleton', factory: loadConfig });
container.register(Symbol.for('db'),  { lifetime: 'singleton', factory: connectDb });
```

Circular dependencies are detected at resolution time:

```
Error: Circular dependency detected: ServiceA → ServiceB → ServiceA
```

---

## Module System

`ConfigProvider` bundles routes, services, and async lifecycle together. Every `@blue.ts/*` package ships as a `ConfigProvider` subclass.

```typescript
class DatabaseModule extends ConfigProvider {
    constructor(private readonly url: string) { super(); }

    override registerDependency(app: App): void {
        app.registerDependency(Database, {
            lifetime: 'singleton',
            factory: () => new Database(this.url),
        });
    }

    override registerRoutes(app: App): void {
        // registerDependency() has run across ALL providers before this is called
        app.route('GET', '/health/db', { fn: () => Context.json({ ok: true }) });
    }

    override async boot(): Promise<void> {
        await (await app.container.get(Database)).connect();
    }
}

app.registerProvider(new DatabaseModule(process.env.DATABASE_URL));
await app.boot();
app.listen(new BunAdapter(), { port: 3000 });
```

### Boot lifecycle

`app.boot()` calls each provider's `boot()` in registration order. Use `BootError` to distinguish fatal from recoverable failures:

```typescript
import { BootError } from '@blue.ts/core';

override async boot(): Promise<void> {
    try {
        await this.cache.connect();
    } catch (e) {
        // isFatal: false — server starts, this module is skipped
        throw new BootError({ message: 'Cache unavailable', options: { isFatal: false } });
    }
}
```

---

## Middleware — `@blue.ts/middleware`

### CORS

```typescript
import { CorsMiddleware, createCorsMiddleware } from '@blue.ts/middleware';

// Global — default open policy
app.use(CorsMiddleware);

// Per-route factory — returns a unique class compatible with registerDependency
const StrictCors = createCorsMiddleware({
    origin: 'https://my-app.com',
    methods: ['GET', 'POST'],
    credentials: true,
});
app.route('POST', '/api/data', { middlewares: [StrictCors], handler: DataHandler });
```

### Validation

Schema-agnostic — works with Zod, Valibot, or any object with a `safeParse` method:

```typescript
import { createValidationMiddleware } from '@blue.ts/middleware';
import { z } from 'zod';

const schema = z.object({ name: z.string(), age: z.number() });
const ValidateBody = createValidationMiddleware(schema);

app.route('POST', '/users', {
    middlewares: [ValidateBody],
    handler: CreateUserHandler,
});
// Invalid body → 422 { error: 'Validation failed', issues: [...] }
```

### Static Files

```typescript
import { StaticMiddleware } from '@blue.ts/middleware';

app.use(StaticMiddleware);
app.registerDependency(StaticMiddleware, {
    lifetime: 'singleton',
    factory: () => new StaticMiddleware({ root: './public', prefix: '/static' }),
});
```

### Rate Limiting

```typescript
import { RateLimitMiddleware } from '@blue.ts/middleware';

app.use(RateLimitMiddleware);
app.registerDependency(RateLimitMiddleware, {
    lifetime: 'singleton',
    factory: () => new RateLimitMiddleware({
        windowMs: 60_000,
        max: 100,
        keyFn: (ctx) => ctx.headers.get('X-Forwarded-For') ?? 'unknown',
    }),
});
// Over limit → 429 { error: 'Too Many Requests' } + Retry-After header
```

Bring your own store by implementing `RateLimitStore`:

```typescript
import type { RateLimitStore } from '@blue.ts/middleware';

const redisStore: RateLimitStore = {
    async increment(key, windowMs) {
        // ... Redis INCR + EXPIRY logic
        return { count, resetMs };
    },
};
```

### Request Logging

```typescript
import { LoggingMiddleware } from '@blue.ts/middleware';

app.use(LoggingMiddleware);
// → {"timestamp":"...","method":"GET","path":"/users","status":200,"durationMs":4}
```

---

## Logging — `@blue.ts/logging`

Structured logger with pino-compatible JSON output and pluggable transports.

```typescript
import { LoggingModule, ConsoleTransport, LoggerToken, RequestLoggerToken } from '@blue.ts/logging';
import type { ILogger } from '@blue.ts/logging';

app.registerProvider(new LoggingModule({
    transports: [new ConsoleTransport()],
    level: 'info',
    fields: { service: 'api', version: '1.0.0' },
}));
```

Log entry format (pino-compatible):

```json
{"level":30,"time":1712345678000,"pid":1234,"hostname":"host","service":"api","msg":"Request received","reqId":"abc123"}
```

Level values: `trace=10 debug=20 info=30 warn=40 error=50 fatal=60`

### Inject the logger

```typescript
// Root logger singleton
app.registerDependency(MyService, {
    lifetime: 'singleton',
    factory: async (c) => new MyService(await c.get<ILogger>(LoggerToken)),
});

// Per-request child logger (unique reqId per request)
app.registerDependency(MyHandler, {
    lifetime: 'scoped',
    factory: async (c) => new MyHandler(await c.get<ILogger>(RequestLoggerToken)),
});
```

### Child loggers

```typescript
const reqLog = logger.child({ reqId: 'abc', method: 'GET', path: '/users' });
reqLog.info('Processing');
// → {"level":30,"time":...,"reqId":"abc","method":"GET","path":"/users","msg":"Processing"}
```

### Transports

| Transport | Description |
|---|---|
| `ConsoleTransport` | Synchronous NDJSON to stdout |
| `FileTransport` | NDJSON to a file — cross-runtime, node:fs `WriteStream` |
| `BunFileTransport` | NDJSON to a file via a Worker thread — off-main-thread I/O on Bun |
| `BunWorkerTransport` | NDJSON to stdout via a Worker thread — off-main-thread I/O on Bun |

```typescript
import { FileTransport, BunWorkerTransport } from '@blue.ts/logging';

new LoggingModule({
    transports: [
        new FileTransport({ path: 'app.log' }),          // append by default
        new FileTransport({ path: 'app.log', append: false }), // truncate on start
        new BunWorkerTransport(),                         // stdout, off-thread
    ],
})
```

Call `transport.close()` at graceful shutdown to flush buffered entries:

```typescript
process.on('SIGTERM', async () => {
    await workerTransport.close();
    process.exit(0);
});
```

---

## Error Handling

```typescript
app.onError((ctx, err) => {
    console.error(err.cause); // original error
    return Context.json({ error: 'Internal Server Error' }, { status: 500 });
});
```

`HandlerError` properties: `message` (includes HTTP method + URL), `cause` (original error), `stack` (original stack).

---

## Runtime Adapters

```typescript
import { BunAdapter }  from '@blue.ts/core';
import { NodeAdapter } from '@blue.ts/core';
import { Deno }        from '@blue.ts/core';

app.listen(new BunAdapter(),  { port: 3000 });
app.listen(new NodeAdapter(), { port: 3000 });
app.listen(new Deno(),        { port: 3000 });

// TLS — all adapters
app.listen(new BunAdapter(), {
    port: 443,
    tls: {
        key:  readFileSync('server.key',  'utf8'),
        cert: readFileSync('server.cert', 'utf8'),
    },
});
```

---

## Testing

`app.fetch()` works without binding a port:

```typescript
import { describe, it, expect } from 'bun:test';

describe('GET /users/:id', () => {
    it('returns the user', async () => {
        const res = await app.fetch(new Request('http://localhost/users/42'));
        expect(res.status).toBe(200);
        expect(await res.json()).toMatchObject({ id: '42' });
    });

    it('returns 404 for unknown user', async () => {
        const res = await app.fetch(new Request('http://localhost/users/999'));
        expect(res.status).toBe(404);
    });
});
```

Swap a dependency for a test double without a mocking library:

```typescript
app.registerDependency(Database, {
    lifetime: 'singleton',
    factory: () => new FakeDatabase(fixtures),
});
```

Run the suite:

```bash
bun test           # all packages
bun test --watch   # watch mode
```

---

## Project Structure

```
packages/
  core/
    src/
      app.ts            — App class (pipeline, middleware, providers)
      container.ts      — IoC container (singleton / scoped / transient)
      context.ts        — Per-request context (body caching, cookies, response factories)
      router.ts         — Radix tree router with named route support
      providers.ts      — ConfigProvider base class
      types.ts          — Shared types and interfaces
      adapters/         — Bun, Node.js, Deno adapters
      errors/           — BootError, HandlerError
    tests/              — container, context, router, app, providers
  middleware/
    src/
      cors.ts           — CorsMiddleware + createCorsMiddleware()
      validate.ts       — createValidationMiddleware(schema)
      static.ts         — StaticMiddleware
      logging.ts        — LoggingMiddleware (request-level)
      rate-limit.ts     — RateLimitMiddleware with pluggable store
    tests/
  logging/
    src/
      logger.ts         — Logger class + ILogger interface
      provider.ts       — LoggingModule, LoggerToken, RequestLoggerToken
      transports/
        console.ts      — ConsoleTransport
        file.ts         — FileTransport (node:fs)
        bun-file.ts     — BunFileTransport (Worker + node:fs)
        bun-worker.ts   — BunWorkerTransport (Worker → stdout)
    tests/
Roadmaps/
  phase-1-core-stability.md
  phase-2-developer-experience.md
  phase-3-built-in-middleware.md
  phase-4-first-party-modules.md
  phase-5-advanced-features.md
  phase-6-release-preparation.md
```