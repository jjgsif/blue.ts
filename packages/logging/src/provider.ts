import type {App} from '@blue.ts/core';
import {ConfigProvider} from '@blue.ts/core';
import {Logger} from './logger.ts';
import type {LogLevel, Transport} from './types.ts';

// ── Tokens ────────────────────────────────────────────────────────────────────

/**
 * Container token for the root Logger singleton.
 *
 * @example
 * class MyHandler {
 *   constructor(private readonly log: ILogger) {}
 *   // register: app.registerDependency(MyHandler, { lifetime: 'transient',
 *   //   factory: async (c) => new MyHandler(await c.get(LoggerToken)) })
 * }
 */
export const LoggerToken = Symbol.for('blue.ts/logger');

/**
 * Container token for the per-request scoped child logger.
 * Each request scope gets its own child with a unique `reqId` field.
 * Inject this into request-scoped services to get per-request log context.
 */
export const RequestLoggerToken = Symbol.for('blue.ts/request-logger');

// ── LoggingModule ─────────────────────────────────────────────────────────────

export interface LoggingModuleOptions {
    /** One or more transports to write log entries to. */
    transports: Transport[];
    /** Minimum log level. Entries below this are dropped. Default: 'info'. */
    level?: LogLevel;
    /** Static fields merged into every entry (e.g. service name, version). */
    fields?: Record<string, unknown>;
}

/**
 * ConfigProvider that wires structured logging into the application container.
 *
 * Registers:
 *   LoggerToken        — singleton root logger
 *   RequestLoggerToken — scoped child logger (new reqId per request)
 *
 * @example
 * app.registerProvider(
 *   new LoggingModule({
 *     transports: [new ConsoleTransport()],
 *     level: 'info',
 *     fields: { service: 'api', version: '1.0.0' },
 *   })
 * );
 *
 * // In a scoped handler:
 * const log = await container.get<ILogger>(RequestLoggerToken);
 * log.info('Handling request');
 * // → {"level":30,"time":...,"service":"api","version":"1.0.0","reqId":"abc...","msg":"Handling request"}
 */
export class LoggingModule extends ConfigProvider {
    private readonly logger: Logger;

    constructor(options: LoggingModuleOptions) {
        super();
        this.logger = new Logger({
            transports: options.transports,
            level: options.level,
            fields: options.fields,
        });
    }

    override registerDependency(app: App): void {
        // Root logger — same instance for the lifetime of the process.
        app.registerDependency(LoggerToken, {
            lifetime: 'singleton',
            value: this.logger,
            factory: () => this.logger,
        });

        // Per-request child — new reqId for every request scope.
        // Inject additional request context (method, path) by creating a
        // further .child() inside a middleware or handler.
        app.registerDependency(RequestLoggerToken, {
            lifetime: 'scoped',
            factory: () => this.logger.child({reqId: crypto.randomUUID()}),
        });
    }
}