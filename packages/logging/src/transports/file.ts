import {createWriteStream} from 'node:fs';
import type {WriteStream} from 'node:fs';
import type {Transport, LogEntry} from '../types.ts';

export interface FileTransportOptions {
    /** Path to the log file. Created if it does not exist. */
    path: string;
    /**
     * Open the file in append mode so existing content is preserved.
     * Set to `false` to truncate the file on startup.
     * Default: `true`.
     */
    append?: boolean;
}

/**
 * Transport that writes newline-delimited JSON to a file.
 * Compatible with pino-pretty and any pino-ecosystem tooling pointed at the file.
 *
 * Works on Bun, Node.js, and Deno (Node compat mode).
 * For off-main-thread file writing on Bun, use `BunWorkerTransport` with the
 * `path` option instead.
 *
 * @example
 * new LoggingModule({
 *   transports: [
 *     new ConsoleTransport(),               // stdout for dev
 *     new FileTransport({ path: 'app.log' }) // file for ops
 *   ]
 * })
 */
export class FileTransport implements Transport {
    private readonly stream: WriteStream;

    constructor(options: FileTransportOptions) {
        this.stream = createWriteStream(options.path, {
            flags: options.append !== false ? 'a' : 'w',
            encoding: 'utf8',
        });
    }

    write(entry: LogEntry): void {
        this.stream.write(JSON.stringify(entry) + '\n');
    }

    /**
     * Wait for any buffered data to finish writing.
     * Resolves immediately if the write buffer is already empty.
     */
    flush(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            if (!this.stream.writableNeedDrain) {
                resolve();
                return;
            }
            this.stream.once('drain', resolve);
            this.stream.once('error', reject);
        });
    }

    /** Flush and close the underlying file handle. */
    close(): Promise<void> {
        return new Promise<void>((resolve, reject) => {
            this.stream.end((err?: Error | null) => {
                if (err) reject(err);
                else resolve();
            });
        });
    }
}