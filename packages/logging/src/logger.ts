import {hostname} from 'node:os';
import type {Transport, LogLevel, LogEntry} from './types.ts';
import {LOG_LEVEL_VALUES} from './types.ts';

// ── ILogger interface ─────────────────────────────────────────────────────────

export interface ILogger {
    trace(msg: string, fields?: Record<string, unknown>): void;
    debug(msg: string, fields?: Record<string, unknown>): void;
    info(msg: string, fields?: Record<string, unknown>): void;
    warn(msg: string, fields?: Record<string, unknown>): void;
    error(msg: string, fields?: Record<string, unknown>): void;
    fatal(msg: string, fields?: Record<string, unknown>): void;
    /** Create a child logger that inherits this logger's fields and transports. */
    child(fields: Record<string, unknown>): ILogger;
}

// ── Logger ────────────────────────────────────────────────────────────────────

export interface LoggerOptions {
    transports: Transport[];
    /** Minimum level to emit. Entries below this level are silently dropped. Default: 'info'. */
    level?: LogLevel;
    /** Context fields merged into every entry produced by this logger. */
    fields?: Record<string, unknown>;
}

export class Logger implements ILogger {
    private readonly transports: Transport[];
    private readonly minLevel: LogLevel;
    private readonly fields: Record<string, unknown>;

    // Cached at construction so we don't call os.hostname() on every write.
    private readonly pid: number;
    private readonly host: string;

    constructor(options: LoggerOptions) {
        this.transports = options.transports;
        this.minLevel = options.level ?? 'info';
        this.fields = options.fields ?? {};
        this.pid = process.pid;
        this.host = hostname();
    }

    // ── write ─────────────────────────────────────────────────────────────────

    private write(level: LogLevel, msg: string, fields?: Record<string, unknown>): void {
        if (LOG_LEVEL_VALUES[level] < LOG_LEVEL_VALUES[this.minLevel]) return;

        const entry: LogEntry = {
            // pino-fixed fields first so tools like pino-pretty pick them up
            level: LOG_LEVEL_VALUES[level],
            time: Date.now(),
            pid: this.pid,
            hostname: this.host,
            // context fields from .child() / constructor
            ...this.fields,
            // per-call fields (override context if same key)
            ...fields,
            // msg last so it's never shadowed
            msg,
        };

        for (const t of this.transports) t.write(entry);
    }

    // ── ILogger impl ──────────────────────────────────────────────────────────

    trace(msg: string, fields?: Record<string, unknown>): void {
        this.write('trace', msg, fields);
    }

    debug(msg: string, fields?: Record<string, unknown>): void {
        this.write('debug', msg, fields);
    }

    info(msg: string, fields?: Record<string, unknown>): void {
        this.write('info', msg, fields);
    }

    warn(msg: string, fields?: Record<string, unknown>): void {
        this.write('warn', msg, fields);
    }

    error(msg: string, fields?: Record<string, unknown>): void {
        this.write('error', msg, fields);
    }

    fatal(msg: string, fields?: Record<string, unknown>): void {
        this.write('fatal', msg, fields);
    }

    // ── child ─────────────────────────────────────────────────────────────────

    /**
     * Returns a new Logger that inherits this logger's transports and level,
     * with `fields` merged on top of the parent's context fields.
     *
     * @example
     * const reqLog = logger.child({ reqId: crypto.randomUUID(), method: 'GET', path: '/users' });
     * reqLog.info('Request received');
     * // → {"level":30,"time":...,"msg":"Request received","reqId":"abc","method":"GET","path":"/users"}
     */
    child(fields: Record<string, unknown>): Logger {
        return new Logger({
            transports: this.transports,
            level: this.minLevel,
            fields: {...this.fields, ...fields},
        });
    }
}