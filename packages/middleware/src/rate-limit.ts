import type {Context} from '@blue.ts/core';
import type {RateLimitStore} from './types.ts';

export interface RateLimitOptions {
    /** Duration of the sliding window in milliseconds. e.g. 60_000 for 1 minute. */
    windowMs: number;
    /** Maximum number of requests allowed per window per key. */
    max: number;
    /** Pluggable store. Defaults to an in-memory sliding window. */
    store?: RateLimitStore;
    /**
     * Extracts the rate-limit bucket key from the request.
     * Defaults to the first IP in X-Forwarded-For, or 'unknown'.
     */
    keyFn?: (ctx: Context) => string;
}

// ── In-memory sliding window ──────────────────────────────────────────────────

class InMemoryStore implements RateLimitStore {
    private readonly windows = new Map<string, number[]>();

    increment(key: string, windowMs: number): { count: number; resetMs: number } {
        const now = Date.now();
        const cutoff = now - windowMs;

        let hits = (this.windows.get(key) ?? []).filter(t => t > cutoff);
        hits.push(now);
        this.windows.set(key, hits);

        // resetMs = when the oldest hit in the current window falls out
        const oldest = hits[0] ?? now;
        return {count: hits.length, resetMs: oldest + windowMs};
    }
}

// ── Middleware ────────────────────────────────────────────────────────────────

export class RateLimitMiddleware {
    private readonly store: RateLimitStore;
    private readonly keyFn: (ctx: Context) => string;

    constructor(private readonly options: RateLimitOptions) {
        this.store = options.store ?? new InMemoryStore();
        this.keyFn = options.keyFn ?? defaultKeyFn;
    }

    async handle(ctx: Context, next: () => Response | Promise<Response>): Promise<Response> {
        const key = this.keyFn(ctx);
        const result = await this.store.increment(key, this.options.windowMs);

        const remaining = Math.max(0, this.options.max - result.count);
        const retryAfter = Math.ceil((result.resetMs - Date.now()) / 1000);

        if (result.count > this.options.max) {
            return new Response(
                JSON.stringify({error: 'Too Many Requests'}),
                {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        'Retry-After': String(Math.max(1, retryAfter)),
                        'X-RateLimit-Limit': String(this.options.max),
                        'X-RateLimit-Remaining': '0',
                        'X-RateLimit-Reset': String(result.resetMs),
                    },
                }
            );
        }

        const response = await next();

        response.headers.set('X-RateLimit-Limit', String(this.options.max));
        response.headers.set('X-RateLimit-Remaining', String(remaining));
        response.headers.set('X-RateLimit-Reset', String(result.resetMs));

        return response;
    }
}

function defaultKeyFn(ctx: Context): string {
    const forwarded = ctx.req.headers.get('X-Forwarded-For');
    if (forwarded) return forwarded.split(',')[0]?.trim() ?? 'unknown';
    return 'unknown';
}