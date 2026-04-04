import type {Transport, LogEntry} from '../types.ts';

/**
 * Synchronous transport that writes newline-delimited JSON to stdout.
 * Uses `process.stdout.write` directly to avoid console.log's extra formatting.
 * Compatible with pino-pretty and any pino-ecosystem tooling.
 */
export class ConsoleTransport implements Transport {
    write(entry: LogEntry): void {
        process.stdout.write(JSON.stringify(entry) + '\n');
    }
}