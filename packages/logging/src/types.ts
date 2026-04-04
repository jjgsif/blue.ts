// ── Log levels ────────────────────────────────────────────────────────────────

export type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal';

/** Pino-compatible numeric level values. */
export const LOG_LEVEL_VALUES: Record<LogLevel, number> = {
    trace: 10,
    debug: 20,
    info: 30,
    warn: 40,
    error: 50,
    fatal: 60,
};

// ── Log entry ─────────────────────────────────────────────────────────────────

/**
 * A single structured log entry — matches the pino JSON output format.
 *
 * Fixed fields:
 *   level    — numeric pino level (10–60)
 *   time     — Unix epoch in milliseconds
 *   pid      — process ID
 *   hostname — machine hostname
 *   msg      — human-readable message
 *
 * Any additional context fields (reqId, method, path, userId, …) are merged in
 * via the index signature.
 */
export interface LogEntry {
    level: number;
    time: number;
    pid: number;
    hostname: string;
    msg: string;
    [key: string]: unknown;
}

// ── Transport interface ───────────────────────────────────────────────────────

export interface Transport {
    /** Write a single log entry. Must be synchronous-or-fire-and-forget. */
    write(entry: LogEntry): void;

    /**
     * Wait for all buffered entries to be written. Optional — only needed for
     * async transports (e.g. BunWorkerTransport) at graceful shutdown.
     */
    flush?(): Promise<void>;

    /** Flush then release resources (e.g. terminate a worker thread). */
    close?(): Promise<void>;
}