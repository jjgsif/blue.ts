import {describe, it, expect} from 'bun:test';
import {RateLimitMiddleware} from '../src/rate-limit.ts';
import {makeCtx, callMw} from './helpers.ts';
import type {RateLimitStore} from '../src/types.ts';

function makeCtxWithIp(ip: string) {
    return makeCtx({headers: {'X-Forwarded-For': ip}});
}

describe('RateLimitMiddleware', () => {

    describe('under limit', () => {
        it('calls next() when under the limit', async () => {
            const mw = new RateLimitMiddleware({windowMs: 60_000, max: 5});
            let called = false;
            await callMw(mw, makeCtxWithIp('1.2.3.4'), () => {
                called = true;
                return new Response('ok');
            });
            expect(called).toBe(true);
        });

        it('adds X-RateLimit-Limit to passing responses', async () => {
            const mw = new RateLimitMiddleware({windowMs: 60_000, max: 10});
            const res = await callMw(mw, makeCtxWithIp('1.2.3.4'));
            expect(res.headers.get('X-RateLimit-Limit')).toBe('10');
        });

        it('X-RateLimit-Remaining decrements with each request', async () => {
            const mw = new RateLimitMiddleware({windowMs: 60_000, max: 3});
            const r1 = await callMw(mw, makeCtxWithIp('10.0.0.1'));
            const r2 = await callMw(mw, makeCtxWithIp('10.0.0.1'));
            expect(Number(r1.headers.get('X-RateLimit-Remaining'))).toBe(2);
            expect(Number(r2.headers.get('X-RateLimit-Remaining'))).toBe(1);
        });
    });

    describe('at limit (exact max)', () => {
        it('the max-th request succeeds', async () => {
            const mw = new RateLimitMiddleware({windowMs: 60_000, max: 2});
            await callMw(mw, makeCtxWithIp('5.5.5.5'));
            const res = await callMw(mw, makeCtxWithIp('5.5.5.5'));
            expect(res.status).toBe(200);
        });
    });

    describe('over limit', () => {
        it('returns 429 when count exceeds max', async () => {
            const mw = new RateLimitMiddleware({windowMs: 60_000, max: 1});
            await callMw(mw, makeCtxWithIp('6.6.6.6'));
            const res = await callMw(mw, makeCtxWithIp('6.6.6.6'));
            expect(res.status).toBe(429);
        });

        it('429 body contains { error: "Too Many Requests" }', async () => {
            const mw = new RateLimitMiddleware({windowMs: 60_000, max: 1});
            await callMw(mw, makeCtxWithIp('7.7.7.7'));
            const res = await callMw(mw, makeCtxWithIp('7.7.7.7'));
            const body = await res.json() as { error: string };
            expect(body.error).toBe('Too Many Requests');
        });

        it('sets Retry-After header', async () => {
            const mw = new RateLimitMiddleware({windowMs: 60_000, max: 1});
            await callMw(mw, makeCtxWithIp('8.8.8.8'));
            const res = await callMw(mw, makeCtxWithIp('8.8.8.8'));
            expect(Number(res.headers.get('Retry-After'))).toBeGreaterThanOrEqual(1);
        });

        it('sets X-RateLimit-Remaining: 0', async () => {
            const mw = new RateLimitMiddleware({windowMs: 60_000, max: 1});
            await callMw(mw, makeCtxWithIp('9.9.9.9'));
            const res = await callMw(mw, makeCtxWithIp('9.9.9.9'));
            expect(res.headers.get('X-RateLimit-Remaining')).toBe('0');
        });

        it('does not call next() when over limit', async () => {
            const mw = new RateLimitMiddleware({windowMs: 60_000, max: 1});
            await callMw(mw, makeCtxWithIp('10.10.10.10'));
            let called = false;
            await callMw(mw, makeCtxWithIp('10.10.10.10'), () => {
                called = true;
                return new Response('ok');
            });
            expect(called).toBe(false);
        });
    });

    describe('custom keyFn', () => {
        it('uses keyFn return value as the bucket key', async () => {
            const mw = new RateLimitMiddleware({windowMs: 60_000, max: 1, keyFn: () => 'shared-key'});
            await callMw(mw, makeCtx());
            const res = await callMw(mw, makeCtx());
            expect(res.status).toBe(429);
        });

        it('different keys have independent counters', async () => {
            const mw = new RateLimitMiddleware({
                windowMs: 60_000,
                max: 1,
                keyFn: (ctx) => ctx.req.headers.get('X-User-Id') ?? 'anon'
            });
            await callMw(mw, makeCtx({headers: {'X-User-Id': 'user-a'}}));
            const res = await callMw(mw, makeCtx({headers: {'X-User-Id': 'user-b'}}));
            expect(res.status).toBe(200);
        });
    });

    describe('pluggable store', () => {
        it('calls store.increment with the key and windowMs', async () => {
            let capturedKey = '';
            let capturedWindow = 0;

            const store: RateLimitStore = {
                increment(key, windowMs) {
                    capturedKey = key;
                    capturedWindow = windowMs;
                    return {count: 1, resetMs: Date.now() + windowMs};
                },
            };

            const mw = new RateLimitMiddleware({windowMs: 30_000, max: 10, store, keyFn: () => 'test-key'});
            await callMw(mw, makeCtx());
            expect(capturedKey).toBe('test-key');
            expect(capturedWindow).toBe(30_000);
        });

        it('blocks the request when store returns count > max', async () => {
            const store: RateLimitStore = {
                increment: () => ({count: 999, resetMs: Date.now() + 60_000}),
            };
            const mw = new RateLimitMiddleware({windowMs: 60_000, max: 10, store});
            const res = await callMw(mw, makeCtx());
            expect(res.status).toBe(429);
        });
    });

});