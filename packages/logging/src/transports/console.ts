import type {Transport, LogEntry} from '../types.ts';

/**
 * Synchronous transport that writes newline-delimited JSON to stdout.
 * Compatible with pino-pretty and any pino-ecosystem tooling.
 * Works on Bun, Node.js, Deno, and Deno Deploy.
 */
export class ConsoleTransport implements Transport {
    write(entry: LogEntry): void {
        if (typeof process !== 'undefined' && process.stdout) {
            process.stdout.write(JSON.stringify(entry) + '\n');
        } else {
            console.log(JSON.stringify(entry));
        }
    }
}