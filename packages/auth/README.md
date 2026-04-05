# @blue.ts/auth

Authentication package for blue.ts. Supports JWT, session cookies, API keys, and HTTP Basic auth — applied per route or group, never globally.

## Installation

```bash
bun add @blue.ts/auth
```

---

## Quick Start

### 1. Register the provider

```typescript
import { AuthProvider } from '@blue.ts/auth';

const auth = new AuthProvider({
    jwt: {
        url: 'https://your-issuer/.well-known/jwks.json',
        issuer: 'https://your-issuer',
        audience: 'your-api',
    },
});

app.registerProvider(auth);
```

The provider creates and owns the adapter as a **singleton** in the DI container. Auth middleware is **not** added globally — apply it explicitly to the routes that need it.

### 2. Protect routes

```typescript
import { requireRole, getAuthUser } from '@blue.ts/auth';

// Public routes — no middleware
app.post('/login', loginHandler);

// Protected group — reference auth.jwtMiddleware directly
app.group('/api', [auth.jwtMiddleware], (r) => {
    r.get('/profile', (ctx) => {
        const user = getAuthUser(ctx.req);
        return Context.json({ user });
    });

    // Require a specific role on top of auth
    r.delete('/admin/users/:id', adminHandler, {
        middlewares: [requireRole('admin')],
    });
});
```

---

## Auth Strategies

### JWT

Verifies Bearer tokens using [jose](https://github.com/panva/jose). Supports remote JWKS or static keys.

```typescript
import { JWTAdapter } from '@blue.ts/auth';

// Remote JWKS (recommended)
const jwtAdapter = new JWTAdapter({
    url: 'https://your-issuer/.well-known/jwks.json',
    issuer: 'https://your-issuer',
    audience: 'your-api',
});

// Static keys
const jwtAdapterStatic = new JWTAdapter({ keys: [{ kty: 'oct', k: '...' }] });

// Custom header (default is 'Authorization: Bearer ...')
jwtAdapter.setHeader('X-Auth-Token');
```

### Sessions

Cookie-based sessions backed by a `SessionStore`. Use the built-in `MemorySessionStore` or implement your own.

```typescript
import { MemorySessionStore, AuthProvider } from '@blue.ts/auth';

const store = new MemorySessionStore();
const auth = new AuthProvider({ session: { store, cookie: 'sid' } });

app.registerProvider(auth);

// Protected routes
app.group('/dashboard', [auth.sessionMiddleware], (r) => { ... });
```

**Login handler** — create a session and set the cookie:

```typescript
import { randomUUID } from 'crypto';

app.post('/login', async (ctx) => {
    const { username, password } = await ctx.json<{ username: string; password: string }>();

    const user = await verifyCredentials(username, password);
    if (!user) return Context.json({ error: 'Invalid credentials' }, { status: 401 });

    const sessionId = randomUUID();
    await store.set(sessionId, { id: user.id, roles: user.roles }, 3600); // 1h TTL

    return new Response(null, {
        status: 204,
        headers: { 'Set-Cookie': `sid=${sessionId}; HttpOnly; Path=/; SameSite=Strict` },
    });
});
```

**Logout handler** — destroy the session:

```typescript
app.post('/logout', async (ctx) => {
    const sessionId = ctx.cookies.get('sid');
    if (sessionId) await store.delete(sessionId);

    return new Response(null, {
        status: 204,
        headers: { 'Set-Cookie': 'sid=; HttpOnly; Path=/; Max-Age=0' },
    });
});
```

### API Keys

```typescript
const auth = new AuthProvider({
    apiKey: {
        keys: ['key-abc', 'key-xyz'],
        header: 'x-api-key', // optional, this is the default
    },
});

app.registerProvider(auth);
app.group('/api', [auth.apiKeyMiddleware], (r) => { ... });
```

### Basic Auth

Provide a `verify` callback — credentials are never hardcoded in the adapter.

```typescript
const auth = new AuthProvider({
    basic: {
        verify: async (username, password) => {
            const user = await db.users.findByCredentials(username, password);
            return user ? { id: user.id, roles: user.roles } : null;
        },
    },
});

app.registerProvider(auth);
app.group('/internal', [auth.basicMiddleware], (r) => { ... });
```

---

## Custom Session Store

Implement `SessionStore` to use any backend (Redis, database, etc.):

```typescript
import type { SessionStore, AuthUser } from '@blue.ts/auth';

class RedisSessionStore implements SessionStore {
    async get(id: string): Promise<AuthUser | null> {
        const data = await redis.get(id);
        return data ? JSON.parse(data) : null;
    }

    async set(id: string, user: AuthUser, ttlSeconds = 3600): Promise<void> {
        await redis.set(id, JSON.stringify(user), 'EX', ttlSeconds);
    }

    async delete(id: string): Promise<void> {
        await redis.del(id);
    }
}
```

---

## Custom Adapter

Extend `Adapter` and pass it directly to `createAuthMiddleware` for strategies not covered by the built-in options:

```typescript
import { Adapter, createAuthMiddleware } from '@blue.ts/auth';
import type { AuthUser } from '@blue.ts/auth';

class HMACAdapter extends Adapter {
    async authenticate(request: Request): Promise<AuthUser | null> {
        const sig = request.headers.get('x-signature');
        if (!sig || !verifyHMAC(request, sig)) return null;
        return { id: 'service-account' };
    }
}

const hmacMiddleware = createAuthMiddleware(new HMACAdapter());
app.group('/webhooks', [hmacMiddleware], (r) => { ... });
```

---

## Reading the Authenticated User

After `createAuthMiddleware` runs, the authenticated user is available anywhere in the request lifecycle:

```typescript
import { getAuthUser } from '@blue.ts/auth';

app.get('/me', (ctx) => {
    const user = getAuthUser(ctx.req); // AuthUser | undefined
    return Context.json(user);
});
```

---

## RBAC

`requireRole` must be used **after** `createAuthMiddleware` in the middleware chain:

```typescript
import { createAuthMiddleware, requireRole } from '@blue.ts/auth';

app.group('/admin', [createAuthMiddleware(jwtAdapter), requireRole('admin')], (r) => {
    r.get('/dashboard', dashboardHandler);
});

// Or per-route
app.delete('/posts/:id', deleteHandler, {
    middlewares: [createAuthMiddleware(jwtAdapter), requireRole('editor', 'admin')],
});
```