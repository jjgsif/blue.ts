# @blue.ts/core

The framework core for blue.ts. Provides the application container, router, dependency injection, middleware pipeline, and server adapters.

## Installation

```bash
bun add @blue.ts/core
```

---

## Quick Start

```typescript
import { App, Container, Router, Context, BunAdapter } from '@blue.ts/core';

const app = new App(new Container(new Map()), new Router());

app.get('/hello', (ctx) => Context.json({ hello: 'world' }));

await app.boot();
app.listen(new BunAdapter(), { port: 3000 });
```

---

## App

The central object. Holds the router, DI container, and middleware stack.

```typescript
const app = new App(new Container(new Map()), new Router());
```

### Routes

```typescript
app.get('/users',         (ctx) => Context.json(users));
app.post('/users',        async (ctx) => { ... });
app.put('/users/:id',     async (ctx) => { ... });
app.patch('/users/:id',   async (ctx) => { ... });
app.delete('/users/:id',  async (ctx) => { ... });
```

### Route groups

Group routes under a common prefix, with optional shared middleware:

```typescript
app.group('/api/v1', [AuthMiddleware], (r) => {
    r.get('/users',     listUsersHandler);
    r.post('/users',    createUserHandler);
    r.delete('/users/:id', deleteUserHandler);

    // Nested groups
    r.group('/admin', [AdminMiddleware], (r) => {
        r.get('/stats', statsHandler);
    });
});
```

### Named routes

```typescript
app.get('/users/:id', handler, { name: 'users.show' });

// Generate a URL from a named route
const url = app.url('users.show', { id: '42' }); // → '/users/42'
```

### Class-based handlers

```typescript
import type { HandlerInterface } from '@blue.ts/core';

class ListUsersHandler implements HandlerInterface {
    handle(ctx: Context): Response {
        return Context.json({ users: [] });
    }
}

app.get('/users', { handler: ListUsersHandler });
```

### Global middleware

```typescript
app.use(LoggingMiddleware, CorsMiddleware);
```

### Error handling

```typescript
app.onError((ctx, error) => {
    return Context.json({ error: error.message }, { status: 500 });
});
```

---

## Context

Provides access to the incoming request, URL params, cookies, and query string.

```typescript
app.get('/users/:id', async (ctx) => {
    ctx.params.id               // URL parameter
    ctx.searchParams.get('q')   // Query string
    ctx.headers                 // Request headers
    ctx.cookies.get('session')  // Parsed cookies

    const body = await ctx.json<{ name: string }>();
    const text = await ctx.text();
    const form = await ctx.formData();

    return ctx.redirectToRoute('users.show', { id: ctx.params.id });
});
```

### Static response helpers

```typescript
Context.json(data, { status: 201 })
Context.text('OK')
Context.redirect('/new-path', 302)
Context.empty(204)
```

---

## Dependency Injection

Register services into the container and inject them into class-based handlers.

### Lifetimes

```typescript
// Singleton — created once, shared for the process lifetime
app.registerDependency(DatabaseService, {
    lifetime: 'singleton',
    factory: () => new DatabaseService(process.env.DATABASE_URL),
});

// Scoped — one instance per request
app.registerDependency(RequestContext, {
    lifetime: 'scoped',
    factory: () => new RequestContext(),
});

// Transient — new instance every time it is resolved
app.registerDependency(EmailService, {
    lifetime: 'transient',
    factory: (container) => new EmailService(),
});
```

### Resolving dependencies in handlers

```typescript
class CreateUserHandler implements HandlerInterface {
    constructor(
        private readonly db: DatabaseService,
        private readonly mailer: EmailService,
    ) {}

    async handle(ctx: Context): Promise<Response> {
        // ...
    }
}

app.registerDependency(CreateUserHandler, {
    lifetime: 'transient',
    factory: async (c) => new CreateUserHandler(
        await c.get(DatabaseService),
        await c.get(EmailService),
    ),
});

app.post('/users', { handler: CreateUserHandler });
```

---

## Middleware

Middleware implements `MiddlewareInterface`:

```typescript
import type { MiddlewareInterface, Middleware } from '@blue.ts/core';

class TimingMiddleware implements MiddlewareInterface {
    async handle(ctx: Context, next: () => Response | Promise<Response>): Promise<Response> {
        const start = Date.now();
        const response = await next();
        response.headers.set('X-Response-Time', `${Date.now() - start}ms`);
        return response;
    }
}

// Apply globally
app.use(TimingMiddleware);

// Apply per route
app.get('/slow', handler, { middlewares: [TimingMiddleware] });

// Apply per group
app.group('/api', [TimingMiddleware], (r) => { ... });
```

### Factory middleware (with configuration)

```typescript
function createApiVersionMiddleware(version: string): Middleware {
    class ApiVersionMiddleware implements MiddlewareInterface {
        handle(ctx: Context, next: () => Response | Promise<Response>) {
            const response = next();
            // ...
            return response;
        }
    }
    return ApiVersionMiddleware as unknown as Middleware;
}
```

---

## ConfigProvider

Extend `ConfigProvider` to encapsulate service registration and route setup:

```typescript
import { ConfigProvider } from '@blue.ts/core';
import type { App } from '@blue.ts/core';

class DatabaseProvider extends ConfigProvider {
    override registerDependency(app: App): void {
        app.registerDependency(Database, {
            lifetime: 'singleton',
            factory: () => new Database(process.env.DATABASE_URL),
        });
    }

    override async boot(): Promise<void> {
        // Runs after all providers are registered, before the server starts
        const db = // resolve and ping...
    }
}

app.registerProvider(new DatabaseProvider());
```

---

## Server Adapters

### Bun (recommended)

```typescript
import { BunAdapter } from '@blue.ts/core';

app.listen(new BunAdapter(), { port: 3000 });
app.listen(new BunAdapter(), { port: 443, tls: { key, cert } });
```

### Node.js

```typescript
import { NodeAdapter } from '@blue.ts/core';

app.listen(new NodeAdapter(), { port: 3000 });
```

### Deno

```typescript
import { Deno } from '@blue.ts/core';

app.listen(new Deno(), { port: 3000 });
```

---

## Lifecycle

```typescript
const app = new App(new Container(new Map()), new Router());

// 1. Register providers — calls registerDependency() then registerRoutes() on each
app.registerProvider(new DatabaseProvider(), new AuthProvider());

// 2. Register additional routes directly
app.get('/health', () => Context.json({ status: 'ok' }));

// 3. Boot — calls boot() on each provider (async setup, validation, connections)
await app.boot();

// 4. Start listening
app.listen(new BunAdapter(), { port: 3000 });
```