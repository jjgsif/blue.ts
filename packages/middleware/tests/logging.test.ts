import {describe, it, expect} from 'bun:test';
import {type LogEntry, LoggingMiddleware} from '../src/logging.ts';
import {makeCtx, callMw} from './helpers.ts';

describe('LoggingMiddleware', () => {

    describe('log entry contents', () => {
        it('writes one entry per request', async () => {
            const entries: unknown[] = [];
            const mw = new LoggingMiddleware({writer: (e) => entries.push(e)});
            const ctx = makeCtx({url: 'http://localhost/api/users', method: 'GET'});
            await callMw(mw, ctx, () => new Response('ok', {status: 200}));
            expect(entries).toHaveLength(1);
        });

        it('entry contains method, path, status, durationMs, timestamp', async () => {
            let entry: LogEntry | undefined;
            const mw = new LoggingMiddleware({
                writer: (e) => {
                    entry = e;
                }
            });
            const ctx = makeCtx({url: 'http://localhost/users/42', method: 'DELETE'});
            await callMw(mw, ctx, () => new Response(null, {status: 204}));
            expect(entry!['method']).toBe('DELETE');
            expect(entry!['path']).toBe('/users/42');
            expect(entry!['status']).toBe(204);
            expect(typeof entry!['durationMs']).toBe('number');
            expect(typeof entry!['timestamp']).toBe('string');
        });

        it('timestamp is valid ISO 8601', async () => {
            let ts = '';
            const mw = new LoggingMiddleware({
                writer: (e) => {
                    ts = e.timestamp;
                }
            });
            await callMw(mw, makeCtx());
            expect(() => new Date(ts).toISOString()).not.toThrow();
            expect(new Date(ts).toISOString()).toBe(ts);
        });

        it('durationMs is a non-negative number', async () => {
            let dur = -1;
            const mw = new LoggingMiddleware({
                writer: (e) => {
                    dur = e.durationMs;
                }
            });
            await callMw(mw, makeCtx());
            expect(dur).toBeGreaterThanOrEqual(0);
        });

        it('status reflects the actual response status code', async () => {
            let status = 0;
            const mw = new LoggingMiddleware({
                writer: (e) => {
                    status = e.status;
                }
            });
            await callMw(mw, makeCtx(), () => new Response('', {status: 418}));
            expect(status).toBe(418);
        });
    });

    describe('error path', () => {
        it('logs status 500 and re-throws when next() throws', async () => {
            let logged = 0;
            const mw = new LoggingMiddleware({
                writer: (e) => {
                    logged = e.status;
                }
            });
            const err = new Error('boom');
            await expect(
                callMw(mw, makeCtx(), () => {
                    throw err;
                })
            ).rejects.toBe(err);
            expect(logged).toBe(500);
        });
    });

    describe('default writer', () => {
        it('uses console.log when no writer is provided (smoke test)', async () => {
            // Just ensure it does not throw with the default writer
            const mw = new LoggingMiddleware();
            await expect(callMw(mw, makeCtx())).resolves.toBeDefined();
        });
    });

});