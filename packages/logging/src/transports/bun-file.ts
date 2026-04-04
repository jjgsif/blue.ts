import {openSync} from 'node:fs';
import type {Transport, LogEntry} from '../types.ts';

export interface BunFileTransportOptions {
    /** Path to the log file. Created if it does not exist. */
    path: string;
    /**
     * Open the file in append mode so existing content is preserved.
     * Set to `false` to truncate the file on startup.
     * Default: `true`.
     */
    append?: boolean;
    /**
     * FileSink write buffer size in bytes.
     * Larger values reduce syscall frequency at the cost of more memory.
     * Default: Bun's internal default (~16 KB).
     */
    highWaterMark?: number;
}

/**
 * Bun-native transport that writes newline-delimited JSON to a file using
 * Bun's `FileSink` API.
 *
 * Prefer this over `FileTransport` when running on Bun — `FileSink` uses
 * Bun's internal write buffering and is slightly faster than Node.js
 * `WriteStream` in the same process.
 *
 * For off-main-thread I/O (zero serialisation cost on the hot path), use
 * `BunWorkerTransport` instead.
 *
 * @example
 * new LoggingModule({
 *   transports: [
 *     new BunFileTransport({ path: 'app.log' }),
 *   ],
 * })
 */
export class BunFileTransport implements Transport {
    private readonly sink: ReturnType<ReturnType<typeof Bun.file>['writer']>;

    constructor(options: BunFileTransportOptions) {
        // Open via fd so we can control the flags (append vs truncate).
        // Bun.file(fd) wraps an already-open file descriptor.
        const fd = openSync(options.path, options.append !== false ? 'a' : 'w');
        this.sink = Bun.file(fd).writer({
            highWaterMark: options.highWaterMark,
        });
    }

    write(entry: LogEntry): void {
        this.sink.write(JSON.stringify(entry) + '\n');
    }

    /** Flush buffered data to the OS. */
    async flush(): Promise<void> {
        await this.sink.flush();
    }

    /** Flush buffered data and close the file handle. */
    async close(): Promise<void> {
        await this.sink.end();
    }
}
