import type {Transport, LogEntry} from '../types.ts';

interface FlushedAck {
    __flushed: true;
}

/**
 * Async transport that offloads JSON serialization and stdout I/O to a Bun
 * Worker thread, keeping the main thread free for request handling.
 *
 * Usage:
 *   const transport = new BunWorkerTransport();
 *   // ... handle requests ...
 *   await transport.close(); // flush + terminate before process exit
 *
 * The Worker is lazily started on first use so that importing this class in
 * environments that don't support Workers (e.g. tests) is safe — the worker
 * is only spawned when `write()` is first called.
 */
export class BunWorkerTransport implements Transport {
    private _worker: Worker | null = null;

    private get worker(): Worker {
        if (!this._worker) {
            this._worker = new Worker(
                new URL('./worker-script.ts', import.meta.url),
                {type: 'module'},
            );
        }
        return this._worker;
    }

    write(entry: LogEntry): void {
        // postMessage uses structured clone — no JSON.stringify on the main thread.
        this.worker.postMessage(entry);
    }

    /**
     * Wait for all queued log entries to be written.
     * Safe to call even if no entries have been written (resolves immediately).
     */
    flush(): Promise<void> {
        if (!this._worker) return Promise.resolve();

        return new Promise<void>((resolve) => {
            const handler = (e: MessageEvent<FlushedAck>) => {
                if (e.data.__flushed) {
                    this._worker!.removeEventListener('message', handler);
                    resolve();
                }
            };
            this._worker!.addEventListener('message', handler);
            this._worker!.postMessage({__flush: true});
        });
    }

    /** Flush all pending entries then terminate the worker thread. */
    async close(): Promise<void> {
        await this.flush();
        this._worker?.terminate();
        this._worker = null;
    }
}