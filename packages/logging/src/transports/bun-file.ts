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
}

/**
 * Transport that writes newline-delimited JSON to a file via a dedicated
 * Bun Worker thread — keeping JSON serialisation and file I/O off the main
 * thread entirely.
 *
 * Uses `node:fs` `WriteStream` inside the worker (not `Bun.file`) to avoid
 * known issues with `Bun.file` in Worker contexts.
 *
 * The worker is lazily started on the first `write()` call.
 *
 * @example
 * new LoggingModule({
 *   transports: [new BunFileTransport({ path: 'app.log' })],
 * })
 */
export class BunFileTransport implements Transport {
    private _worker: Worker | null = null;
    private readonly options: BunFileTransportOptions;

    constructor(options: BunFileTransportOptions) {
        this.options = options;
    }

    private get worker(): Worker {
        if (!this._worker) {
            this._worker = new Worker(
                new URL('./file-worker-script.ts', import.meta.url),
                {type: 'module'},
            );
            // __init must arrive before any log entries (FIFO message order).
            this._worker.postMessage({
                __init: true,
                path: this.options.path,
                append: this.options.append !== false,
            });
        }
        return this._worker;
    }

    write(entry: LogEntry): void {
        this.worker.postMessage(entry);
    }

    /** Wait for all buffered entries to be written to the file. */
    flush(): Promise<void> {
        if (!this._worker) return Promise.resolve();

        return new Promise<void>((resolve) => {
            const handler = (e: MessageEvent<{__flushed: true}>) => {
                if (e.data.__flushed) {
                    this._worker!.removeEventListener('message', handler);
                    resolve();
                }
            };
            this._worker!.addEventListener('message', handler);
            this._worker!.postMessage({__flush: true});
        });
    }

    /** Drain, close the file handle, then terminate the worker thread. */
    async close(): Promise<void> {
        if (!this._worker) return;

        await new Promise<void>((resolve) => {
            const handler = (e: MessageEvent<{__closed: true}>) => {
                if (e.data.__closed) {
                    this._worker!.removeEventListener('message', handler);
                    resolve();
                }
            };
            this._worker!.addEventListener('message', handler);
            this._worker!.postMessage({__close: true});
        });

        this._worker.terminate();
        this._worker = null;
    }
}