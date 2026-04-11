# @blue.ts/di

A lightweight, async-first dependency injection container for TypeScript. No decorators, no `reflect-metadata`, no runtime dependencies — works in Node.js, Bun, Deno, and edge runtimes.

## Installation

```bash
bun add @blue.ts/di
npm install @blue.ts/di
```

## Quick start

```ts
import { Container, Token } from "@blue.ts/di";

// 1. Define identifiers
const LoggerToken = new Token<Logger>("Logger");

// 2. Create a container and register services
const container = new Container();

container.register(LoggerToken, {
  lifetime: "singleton",
  factory: () => new Logger(),
});

container.register(Database, {
  lifetime: "singleton",
  factory: async (r) => {
    const logger = await r.get(LoggerToken);
    return new Database(logger);
  },
});

// 3. Resolve
const db = await container.get(Database);
```

---

## Identifiers

Every registration is keyed by an **identifier**. There are two kinds:

### `Token<T>`

The recommended identifier. Carries the type `T` so `get()` returns the correct type without a manual type parameter.

```ts
const DbToken = new Token<Database>("Database");

container.register(DbToken, { lifetime: "singleton", factory: () => new Database() });

const db = await container.get(DbToken); // typed as Database
```

### Constructor

A class itself can be used as its own identifier.

```ts
container.register(Database, { lifetime: "singleton", factory: () => new Database() });

const db = await container.get(Database); // typed as Database
```

---

## Lifetimes

### `singleton`

One instance for the lifetime of the container. Shared across all scopes.

```ts
container.register(Database, { lifetime: "singleton", factory: () => new Database() });
```

### `scoped`

One instance per scope. Different scopes get different instances. Useful for per-request state.

```ts
container.register(RequestContext, { lifetime: "scoped", factory: () => new RequestContext() });

const scope = container.createScope();
const ctx = await scope.get(RequestContext); // new instance per scope
```

### `transient`

A new instance on every `get()` call. Never cached.

```ts
container.register(Job, { lifetime: "transient", factory: () => new Job() });
```

### Value registration

Register a pre-constructed value as a singleton. Useful for config objects or third-party instances.

```ts
container.register(ConfigToken, {
  lifetime: "singleton",
  value: { port: 3000, host: "localhost" },
});
```

---

## Async factories

Factories can be async. The container resolves them transparently — callers always `await container.get(...)`.

```ts
container.register(Database, {
  lifetime: "singleton",
  factory: async () => {
    const db = new Database();
    await db.connect("postgres://...");
    return db;
  },
});
```

Concurrent calls for the same singleton are deduplicated — the factory is called exactly once regardless of how many callers race.

---

## `autowire`

Generates a factory from a constructor and an ordered list of dependency identifiers. Resolves all dependencies in parallel.

```ts
import { autowire } from "@blue.ts/di";

class UserService {
  constructor(readonly db: Database, readonly logger: Logger) {}
}

container.register(UserService, {
  lifetime: "singleton",
  factory: autowire(UserService, [Database, LoggerToken]),
});
```

This is equivalent to writing the factory manually:

```ts
factory: async (r) => {
  const [db, logger] = await Promise.all([r.get(Database), r.get(LoggerToken)]);
  return new UserService(db, logger);
}
```

---

## Scopes

`createScope()` creates a child container that shares the same registry and singleton cache but maintains its own scoped instance cache.

```ts
// HTTP server example
app.use(async (req, res, next) => {
  await using scope = req.container = container.createScope();
  scope.register(RequestToken, { lifetime: "singleton", value: req });
  next();
});
```

`Container` implements `Symbol.asyncDispose`, so scopes work with `await using` — the scope is disposed automatically when the block exits.

---

## Dispose

Register a `dispose` callback on any factory or value registration. Callbacks are called in reverse resolution order (dependents before dependencies) when `dispose()` is called.

```ts
container.register(Database, {
  lifetime: "singleton",
  factory: async () => {
    const db = new Database();
    await db.connect();
    return db;
  },
  dispose: (db) => db.disconnect(),
});

// On shutdown:
await container.dispose();
```

If multiple disposers fail, all of them are still called and the errors are collected into an `AggregateError`.

Scoped containers only dispose their own scoped instances. Root `dispose()` handles singletons.

```ts
{
  await using scope = container.createScope();
  // ... handle request
} // scope.dispose() called automatically — scoped instances cleaned up
```

---

## Error handling

### `NotFoundException`

Thrown synchronously when `get()` is called for an unregistered identifier.

```ts
try {
  await container.get(UnknownToken);
} catch (e) {
  if (e instanceof NotFoundException) {
    console.error("Not registered:", e.message);
  }
}
```

### `ContainerException`

Thrown when a factory fails. Includes the full resolution chain so you can see exactly which dependency caused the failure.

```
ContainerException: Error occurred while instantiating service - Database (singleton) [UserService → Database]
Caused by: Error: ECONNREFUSED 127.0.0.1:5432
```

Circular dependencies are also reported with the chain:

```
ContainerException: Circular dependency detected - ServiceA (singleton) [ServiceA → ServiceB → ServiceA]
```

---

## API reference

### `Container`

| Method | Description |
|--------|-------------|
| `register(id, registration)` | Register a service. Re-registration invalidates the existing cached instance. |
| `get<T>(id)` | Resolve a service. Returns `Promise<T>`. |
| `has(id)` | Returns `true` if the identifier is registered. Does not guarantee resolution will succeed. |
| `createScope()` | Creates a child container with its own scoped instance cache. |
| `dispose()` | Disposes all tracked instances in reverse resolution order. Collects errors into `AggregateError`. |
| `[Symbol.asyncDispose]()` | Alias for `dispose()`. Enables `await using`. |

### `Token<T>`

```ts
const MyToken = new Token<MyService>("MyService");
```

### `autowire(constructor, dependencies)`

```ts
autowire(MyService, [DepA, DepB]): Factory<MyService>
```

Returns a `Factory<T>` that resolves `dependencies` in parallel and passes them to `constructor` in order.

### `Resolver`

The object passed into every factory. Narrower than `Container` by design — factories can resolve dependencies but cannot register new ones.

```ts
interface Resolver {
  get<T>(identifier: Identifier<T>): Promise<T>;
  has<T>(identifier: Identifier<T>): boolean;
}
```

---

## Requirements

- TypeScript 5+
- Any runtime that supports ES2021 (`AggregateError`, `Symbol.asyncDispose` requires ES2022 / `--lib ES2022`)