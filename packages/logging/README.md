# @blue.ts/logging

Structured logging for blue.ts. Pino-compatible JSON output with child loggers, pluggable transports, and per-request scoped context via the DI container.

## Installation

```bash
bun add @blue.ts/logging
```

---

## Quick Start

```typescript
import { LoggingModule, ConsoleTransport } from '@blue.ts/logging';

app.registerProvider(
    new LoggingModule({
        transports: [new ConsoleTransport()],
        level: 'info',
        fields: { service: 'api', version: '1.0.0' },
    })
);
```

---

## Logger

`Logger` writes structured JSON entries across six severity levels.

```typescript
import { Logger, ConsoleTransport } from '@blue.ts/logging';

const logger = new Logger({
    transports: [new ConsoleTransport()],
    level: 'info',             // minimum level to emit (default: 'info')
    fields: { service: 'api' } // merged into every entry
});

logger.trace('Verbose detail');
logger.debug('Debug info');
logger.info('Server started', { port: 3000 });
logger.warn('Slow query', { durationMs: 320, query: 'SELECT ...' });
logger.error('Request failed', { error: err.message });
logger.fatal('Unrecoverable error');
```

### Log levels (lowest → highest)

| Level | Numeric | Use |
|-------|---------|-----|
| `trace` | 10 | Highly verbose debugging |
| `debug` | 20 | Development debugging |
| `info` | 30 | Normal operational events |
| `warn` | 40 | Unexpected but recoverable |
| `error` | 50 | Failures that need attention |
| `fatal` | 60 | Process-ending errors |

### Child loggers

Child loggers inherit parent transports, level, and fields — and merge in their own:

```typescript
const reqLogger = logger.child({ reqId: crypto.randomUUID(), userId: 'u123' });
reqLogger.info('Processing request');
// → { "level": 30, "msg": "Processing request", "service": "api", "reqId": "...", "userId": "u123" }
```

---

## LoggingModule

`LoggingModule` is a `ConfigProvider` that wires the logger into the DI container.

It registers two tokens:

| Token | Lifetime | Description |
|-------|----------|-------------|
| `LoggerToken` | singleton | Root logger — same instance for the process lifetime |
| `RequestLoggerToken` | scoped | Child logger with a unique `reqId` per request |

```typescript
import { LoggingModule, ConsoleTransport, LoggerToken, RequestLoggerToken } from '@blue.ts/logging';
import type { ILogger } from '@blue.ts/logging';

app.registerProvider(
    new LoggingModule({
        transports: [new ConsoleTransport()],
        level: 'debug',
        fields: { service: 'my-api', env: process.env.NODE_ENV },
    })
);

// Inject into a class-based handler
class MyHandler {
    constructor(private readonly log: ILogger) {}

    handle(ctx) {
        this.log.info('Handling request', { path: ctx.req.url });
        return Context.json({ ok: true });
    }
}

app.registerDependency(MyHandler, {
    lifetime: 'transient',
    factory: async (c) => new MyHandler(await c.get(RequestLoggerToken)),
});
```

---

## Transports

### ConsoleTransport

Writes JSON entries to `stdout`. Best for development and containerised deployments.

```typescript
import { ConsoleTransport } from '@blue.ts/logging';

new ConsoleTransport()
// → {"level":30,"time":1712345678901,"pid":12345,"hostname":"host","msg":"..."}
```

### FileTransport

Appends newline-delimited JSON to a file. Rotates when the file exceeds `maxBytes`.

```typescript
import { FileTransport } from '@blue.ts/logging';

new FileTransport({
    path: './logs/app.log',
    maxBytes: 10 * 1024 * 1024, // 10 MB — rotate after this size
});
```

### BunWorkerTransport

Offloads all I/O to a Bun Worker thread so the main thread is never blocked.

```typescript
import { BunWorkerTransport } from '@blue.ts/logging';

const transport = new BunWorkerTransport({
    path: './logs/app.log',
    maxBytes: 10 * 1024 * 1024,
});

// At graceful shutdown — flush and close the worker
await transport.flush();
await transport.close();
```

### Multiple transports

```typescript
new LoggingModule({
    transports: [
        new ConsoleTransport(),
        new BunWorkerTransport({ path: './logs/app.log' }),
    ],
    level: 'info',
});
```

### Custom transport

Implement the `Transport` interface to write to any backend:

```typescript
import type { Transport, LogEntry } from '@blue.ts/logging';

class DatadogTransport implements Transport {
    write(entry: LogEntry): void {
        fetch('https://http-intake.logs.datadoghq.com/api/v2/logs', {
            method: 'POST',
            body: JSON.stringify(entry),
            headers: { 'DD-API-KEY': process.env.DD_API_KEY! },
        });
    }

    async flush(): Promise<void> { /* wait for in-flight requests */ }
}
```

---

## Log Entry Shape

All entries follow the [pino](https://github.com/pinojs/pino) JSON format:

```json
{
  "level": 30,
  "time": 1712345678901,
  "pid": 12345,
  "hostname": "api-server-1",
  "msg": "Request completed",
  "service": "api",
  "reqId": "a1b2c3d4",
  "method": "GET",
  "path": "/users",
  "durationMs": 12
}
```

Compatible with `pino-pretty` for human-readable local development output:

```bash
bun run index.ts | bunx pino-pretty
```