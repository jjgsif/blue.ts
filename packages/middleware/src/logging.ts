import type {Context} from '@blue.ts/core';

export interface LogEntry {
    timestamp: string;
    method: string;
    path: string;
    status: number;
    durationMs: number;
}

export interface LoggingOptions {
    /**
     * Custom log writer. Defaults to console.log(JSON.stringify(entry)).
     * Inject a custom writer in tests to capture log output without stdout.
     */
    writer?: (entry: LogEntry) => void;
}

export class LoggingMiddleware {
    private readonly writer: (entry: LogEntry) => void;

    constructor(options: LoggingOptions = {}) {
        this.writer = options.writer ?? ((e) => console.log(JSON.stringify(e)));
    }

    async handle(ctx: Context, next: () => Response | Promise<Response>): Promise<Response> {
        const start = Date.now();
        const path = new URL(ctx.req.url).pathname;

        let response: Response;
        try {
            response = await next();
        } catch (err) {
            // Log with 500 then re-throw so App.onError() still runs
            this.writer({
                timestamp: new Date().toISOString(),
                method: ctx.req.method,
                path,
                status: 500,
                durationMs: Date.now() - start,
            });
            throw err;
        }

        this.writer({
            timestamp: new Date().toISOString(),
            method: ctx.req.method,
            path,
            status: response.status,
            durationMs: Date.now() - start,
        });

        return response;
    }
}