# blue.ts

A mildly opinionated HTTP server framework for TypeScript. Built on [Bun](https://bun.com), with adapters for Node.js and Deno.

## Install

```bash
bun install
```

## Quick Start

```typescript
import { App, Container, Context, Router, BunAdapter } from '@blue.ts/core';

const container = new Container(new Map());
const router    = new Router();

class GetUserHandler {
  handle(ctx: Context): Response {
    return Context.json({ id: ctx.params['id'] });
  }
}

container.register(GetUserHandler, {
  lifetime: 'transient',
  factory: () => new GetUserHandler(),
});

router.route('GET', '/users/:id', { handler: GetUserHandler });

const app = new App(container, router);
await app.boot();
app.listen(new BunAdapter(), { port: 3000 });
```

---

## Core Concepts

### Handlers

Handlers are classes with a `handle(ctx): Response | Promise<Response>` method. They are resolved through the IoC container on every request, so their constructor dependencies are injected automatically.

```typescript
class CreateUserHandler {
  constructor(private db: Database) {}

  async handle(ctx: Context): Promise<Response> {
    const body = await ctx.json<{ name: string }>();
    const user = await this.db.create(body);
    return Context.json(user, { status: 201 });
  }
}
```

### Middleware

Middleware is class-based with a `handle(ctx, next)` method. Call `next()` to pass control to the next middleware or the handler. Middleware, like handlers, are also resolved through the IoC Container so dependencies are injected automatically.

```typescript
class AuthMiddleware {
  handle(ctx: Context, next: () => Response | Promise<Response>) {
    const token = ctx.headers.get('Authorization');
    if (!token) return Context.json({ error: 'Unauthorized' }, { status: 401 });
    return next();
  }
}
```

Register middleware globally on the app, or per-route:

```typescript
// Global — runs on every request
app.use(LogMiddleware);

// Per-route — runs only for this route, after global middleware
router.route('DELETE', '/users/:id', {
  middlewares: [AuthMiddleware],
  handler: DeleteUserHandler,
});
```

Middleware execution order: **global** (in registration order) → **route-level** → **handler**.

### Context

`Context` is created per-request. It exposes the request, route params, and parsed accessors. The body is read once from the stream and cached — middleware and handler can both read it.

```typescript
ctx.req              // raw Request
ctx.params           // route params — Record<string, string>
ctx.headers          // request Headers
ctx.searchParams     // URLSearchParams from the query string
ctx.cookies          // ReadonlyMap<string, string> parsed from Cookie header

await ctx.text()     // body as string (cached)
await ctx.json<T>()  // body parsed as JSON (cached)
await ctx.formData() // body as FormData (cached)
```

**Static response factories:**

```typescript
Context.json(data, init?)              // 200 application/json
Context.text(body, init?)              // 200 text/plain
Context.redirect(url, status?)         // 302 by default
Context.empty(status?)                 // 204 by default
```

---

## IoC Container

The container manages dependency lifetimes and resolves constructor dependencies.

```typescript
const container = new Container(new Map());

// Register a singleton — one instance for the lifetime of the app
container.register(DatabaseService, {
  lifetime: 'singleton',
  factory: () => new DatabaseService(process.env.DATABASE_URL),
});

// Register a scoped service — one instance per request
container.register(RequestLogger, {
  lifetime: 'scoped',
  factory: () => new RequestLogger(),
});

// Register a transient service — new instance every resolution
container.register(EmailService, {
  lifetime: 'transient',
  factory: (c) => c.get(SmtpClient).then(smtp => new EmailService(smtp)),
});
```

**Lifetimes:**

| Lifetime | Instance created | Cached |
|---|---|---|
| `singleton` | Once | On the root container |
| `scoped` | Once per request | On the request scope |
| `transient` | Every `get()` call | Never |

**Identifiers** can be a class constructor, a string, or a symbol:

```typescript
container.register('config', { lifetime: 'singleton', factory: () => loadConfig() });
container.register(Symbol.for('db'), { lifetime: 'singleton', factory: () => connectDb() });
```

**Circular dependencies** are detected at resolution time with a descriptive error:

```
Error: Circular dependency detected: ServiceA → ServiceB → ServiceA
```

---

## Module System

`ConfigProvider` is the extension point for bundling routes and services together. Any `@blue.ts/*` package ships as one or more `ConfigProvider` subclasses.

```typescript
class AuthModule extends ConfigProvider {
  constructor(private config: { secret: string }) { super(); }

  override registerDependency(app: App): void {
    app.registerDependency(TokenService, {
      lifetime: 'singleton',
      factory: () => new TokenService(this.config.secret),
    });
  }

  override registerRoutes(app: App): void {
    app.route('POST', '/auth/login', { handler: LoginHandler });
  }

  override async boot(): Promise<void> {
    // async setup — called before the server starts
  }
}

app.registerProvider(new AuthModule({ secret: process.env.JWT_SECRET }));
await app.boot();
```

`registerDependency` is always called before `registerRoutes` across all providers, so routes can rely on services registered by other modules.

### Boot lifecycle

`app.boot()` calls each provider's `boot()` in registration order, waiting for each to complete before starting the next. Throw a `BootError` to control whether a failure is fatal:

```typescript
import { BootError } from '@blue.ts/core';

override async boot(): Promise<void> {
  try {
    await this.db.connect();
  } catch (e) {
    // isFatal: false — server continues without this module
    throw new BootError({ message: 'DB unavailable', options: { isFatal: false } });
  }
}
```

---

## Error Handling

Register a global error handler with `app.onError`. It receives the `Context` and a `HandlerError` wrapping the original error.

```typescript
app.onError((ctx, err) => {
  console.error(err.cause); // the original error
  return Context.json({ error: err.message }, { status: 500 });
});
```

If no handler is registered, unhandled errors log to stderr and return a generic `500 Internal Server Error`.

---

## Runtime Adapters

blue.ts is not tied to a specific runtime. Pass an adapter to `app.listen()`.

### Bun

```typescript
import { BunAdapter } from '@blue.ts/core';
app.listen(new BunAdapter(), { port: 3000 });
```

### Node.js

```typescript
import { NodeAdapter } from '@blue.ts/core';
app.listen(new NodeAdapter(), { port: 3000 });
```

### Deno

```typescript
import { Deno as DenoAdapter } from '@blue.ts/core';
app.listen(new DenoAdapter(), { port: 3000 });
```

### TLS

All adapters accept a `tls` option with PEM-encoded key and certificate:

```typescript
import { readFileSync } from 'node:fs';

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

`app.fetch(req)` can be called directly without binding a port — ideal for unit tests.

```typescript
import { expect, test } from 'bun:test';

test('GET /users/:id returns the user', async () => {
  const res = await app.fetch(new Request('http://localhost/users/42'));
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ id: '42' });
});
```

Run the test suite:

```bash
bun test
```

---

## Comparison with Similar Frameworks

> This section tracks where blue.ts stands relative to the ecosystem. Items marked ❌ with "planned" are on the [roadmap](./Roadmaps).

### Feature Matrix

| | blue.ts | Hono | Elysia | Express | NestJS |
|---|---|---|---|---|---|
| Runtimes | Bun / Node / Deno | All | Bun-first | Node | Node |
| IoC container | ✅ | ❌ | ❌ | ❌ | ✅ |
| Decorators required | ❌ | ❌ | ❌ | ❌ | ✅ |
| Per-request scoping | ✅ | ❌ | ❌ | ❌ | ✅ |
| Type-safe params | ❌ planned | ✅ | ✅ | ❌ | ❌ |
| Built-in validation | ❌ planned | ❌ | ✅ | ❌ | ✅ |
| Body caching | ✅ | ❌ | ❌ | ❌ | ❌ |
| Module system | ✅ | ❌ | ✅ | ❌ | ✅ |
| Function handlers | ❌ | ✅ | ✅ | ✅ | ❌ |
| Ecosystem | ❌ early | ✅ | growing | ✅ | ✅ |
| Streaming / SSE | ❌ planned | ✅ | ✅ | ❌ | ❌ |

### Advantages

**Constructor injection without decorators**
NestJS is the only other framework with true IoC DI, but it requires `@Injectable()`, `@Controller()`, `experimentalDecorators`, and `emitDecoratorMetadata`. blue.ts gets the same result — testable, explicit dependency graphs, per-request scoping — with plain classes and a registry. No reflection, no metadata, no tsconfig flags.

**Per-request scoped containers**
`lifetime: 'scoped'` gives a fresh instance per request automatically. This is useful for per-request DB transactions, request-bound loggers, or user-specific state. Express, Hono, and Elysia have no equivalent built in.

**Body caching**
Reading `ctx.text()` in middleware then `ctx.json()` in the handler just works. Every other framework consumes the body stream once. This matters when auth middleware needs to inspect the raw body and the handler still needs to parse it as JSON.

**Adapter-isolated runtime**
The adapter pattern makes the runtime choice explicit at startup. Swapping `BunAdapter` for `NodeAdapter` is one line — application code including TLS config is entirely untouched.

**Module system with boot lifecycle**
`ConfigProvider` bundles routes + services + async lifecycle together, with `BootError` giving non-fatal failure semantics. NestJS modules are close but more complex. Hono, Elysia, and Express have no equivalent.

**Testability via `app.fetch()`**
`app.fetch(new Request(...))` works without binding a port. Hono supports this too. Express requires `supertest` wrapping an `http.Server`. Phase 4 adds `@blue.ts/testing` — a fluent request builder with typed response assertions and per-test service mocking built on top of this.

### Pitfalls

**Double registration friction** — the biggest one
Every handler requires two steps: `container.register(Handler, { factory: ... })` and `router.route(...)`. In Hono or Express a route is one line. `ConfigProvider` mitigates this for packaged modules, but standalone routes still pay full ceremony cost.

**No type-safe route params** *(Phase 2)*
`ctx.params['id']` is a plain string index. Hono and Elysia both infer `{ id: string }` from the route pattern at the type level. Until this ships, every param access is untyped.

**Class-only handlers — no escape hatch for simple cases**
A health check endpoint still requires a class and a container registration. There is no way to inline a one-line handler without the full ceremony.

**Async container resolution on every request**
`await Promise.all([...middleware.map(m => scoped.get(m))])` runs on every request. Hono and Elysia reference handler functions directly with no allocation overhead on the routing layer.

**No built-in validation** *(Phase 3)*
Elysia ships TypeBox schema validation as a first-class feature with end-to-end type inference. Fastify has JSON Schema. blue.ts has nothing until Phase 3.

**Zero ecosystem**
Express has thousands of middleware packages. Hono has official `@hono/*` packages. blue.ts has none yet.

**No route grouping** *(Phase 2)*
No `app.group('/api/v1', ...)`. Every route is registered with its full path.

---

## Project Structure

```
src/
  app.ts           — App class (request pipeline, middleware, providers)
  container.ts     — IoC container (singleton / scoped / transient lifetimes)
  context.ts       — Per-request context (body, cookies, searchParams, response factories)
  router.ts        — Router (memoirist radix tree)
  providers.ts     — ConfigProvider base class (module system)
  types.ts         — Shared types
  adapters/
    bun.ts         — Bun adapter
    deno.ts        — Deno adapter
    node.ts        — Node.js adapter
  errors/
    BootError.ts   — Fatal / non-fatal boot failure
    HandlerError.ts — Wraps handler/middleware errors with original cause
tests/
  container.test.ts
  context.test.ts
  router.test.ts
  app.test.ts
  providers.test.ts
Roadmaps/
  phase-1-core-stability.md     — COMPLETE
  phase-2-developer-experience.md
  phase-3-built-in-middleware.md
  phase-4-first-party-modules.md
  phase-5-advanced-features.md
  phase-6-release-preparation.md
```
