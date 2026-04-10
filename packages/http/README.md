## @blue.ts/http

A **PSR-7 inspired** HTTP message implementation for the modern TypeScript ecosystem. Immutable, type-safe, and runtime-agnostic — works on Bun, Deno, and Node.js 20+.

---

### Installation

```bash
npm install @blue.ts/http
```

---

### Overview

The package provides three core classes and a file upload abstraction:

| Class | Role |
|---|---|
| `ServerRequest` | Incoming request received by your server |
| `HttpRequest` | Outgoing request your code sends to an external service |
| `HttpResponse` | HTTP response, sent back to a client |
| `UploadedFile` | File received via `multipart/form-data` |

All classes are **immutable**. Methods prefixed with `with` return a new instance rather than mutating in place.

---

### ServerRequest

Wraps an incoming Fetch `Request` into a persistent, fully-parsed snapshot.

```typescript
import { ServerRequest } from '@blue.ts/http';

const request = await ServerRequest.fromRequest(nativeRequest);

// Parsed body (JSON, multipart, URL-encoded — detected automatically)
const body = request.getParsedBody<{ name: string }>();

// URL & query
const url    = request.getUrl();
const params = request.getQueryParams(); // { page: '2' }

// Headers (case-insensitive)
const auth = request.getHeaderLine('authorization');

// Cookies
const session = request.getCookieParams()['session_id'];

// Uploaded files (multipart)
const files = request.getUploadedFiles(); // Record<string, UploadedFile>

// Attach typed metadata — ideal for middleware
const authed = request.withAttribute('user', { id: 42 });
const user   = authed.getAttribute<{ id: number }>('user');
```

**Immutable withers:**

```typescript
request
  .withMethod('POST')
  .withHeader('x-request-id', crypto.randomUUID())
  .withParsedBody({ validated: true });
```

---

### HttpRequest

Builder for outgoing HTTP calls. Executes via `send()`, which returns an `HttpResponse`.

```typescript
import { HttpRequest } from '@blue.ts/http';

// Static factories
const listRes = await HttpRequest.get('https://api.example.com/users')
    .withQueryParam('page', '2')
    .withBearerToken(token)
    .send();

// POST with JSON body
const createRes = await HttpRequest.post('https://api.example.com/users')
    .withJson({ name: 'Alice', role: 'admin' })
    .send();

// Basic auth
const dataRes = await HttpRequest.get('https://api.example.com/data')
    .withBasicAuth('user', 'p@ssw0rd')
    .send();
```

**Static factories:** `HttpRequest.get()`, `.post()`, `.put()`, `.patch()`, `.delete()`, `.create(method, url)`

---

### HttpResponse

Immutable response builder. Convert to a native `Response` via `toStandard()` when returning from your handler.

```typescript
import { HttpResponse } from '@blue.ts/http';

// JSON response
const okRes = new HttpResponse(200)
    .withJson({ id: 1, name: 'Alice' });

// Custom status and headers
const createdRes = new HttpResponse(201)
    .withHeader('x-request-id', requestId)
    .withJson({ created: true });

// Redirect
const redirectRes = new HttpResponse(302)
    .withHeader('location', '/login');

// Return to adapter
return okRes.toStandard();
```

**Convert from a native `Response`** (e.g., from `fetch`):

```typescript
const fetchedRes = HttpResponse.fromStandard(await fetch(url));
const status = fetchedRes.getStatusCode(); // 200
```

---

### UploadedFile

Files from `multipart/form-data` requests are available via `ServerRequest.getUploadedFiles()`. Files larger than 256 KB are automatically spooled to disk; smaller files are kept in memory.

```typescript
const files = request.getUploadedFiles();
const avatar = files['avatar'];

avatar.name;      // original filename
avatar.mediaType; // MIME type
avatar.size;      // bytes
avatar.error;     // UploadError.OK if successful

// Stream the file
const stream = avatar.getStream();

// Move to permanent storage
await avatar.moveTo('/uploads/avatar.png');
```

---

### Interfaces

All public interfaces are re-exported for use in your own implementations or middleware:

```typescript
import type {
    MessageInterface,
    RequestInterface,
    ResponseInterface,
    ServerRequestInterface,
    ServerParams,
} from '@blue.ts/http';
```

---

### Runtime Compatibility

| Runtime | Minimum Version |
|---|---|
| Bun | 1.0+ |
| Deno | 1.28+ |
| Node.js | 20+ |

> `File` as a global requires Node.js 20+. Node 18 users must polyfill it.

---

### License

MIT