import {describe, it, expect} from 'bun:test';
import {createValidationMiddleware} from '../src/validate.ts';
import {makeCtx, callMw} from './helpers.ts';
import type {SchemaLike} from '../src/types.ts';

// ── Fake schemas (no Zod dependency in tests) ─────────────────────────────────

function passing<T>(data: T): SchemaLike<T> {
    return {safeParse: () => ({success: true, data})};
}

function failing(issues: Array<{ path: (string | number)[]; message: string }>): SchemaLike<unknown> {
    return {safeParse: () => ({success: false, error: {issues}})};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('validate()', () => {

    describe('factory', () => {
        it('returns a class constructor', () => {
            const Mw = createValidationMiddleware(passing({}));
            expect(typeof Mw).toBe('function');
        });

        it('can be instantiated with new', () => {
            const Mw = createValidationMiddleware(passing({}));
            const instance = new Mw();
            expect(typeof instance.handle).toBe('function');
        });
    });

    describe('valid body', () => {
        it('calls next() when safeParse succeeds', async () => {
            const Mw = createValidationMiddleware(passing({name: 'Alice'}));
            const mw = new Mw();
            let called = false;
            const ctx = makeCtx({
                method: 'POST',
                body: '{"name":"Alice"}',
                headers: {'Content-Type': 'application/json'}
            });
            await callMw(mw, ctx, () => {
                called = true;
                return new Response('ok');
            });
            expect(called).toBe(true);
        });

        it('returns the response from next()', async () => {
            const Mw = createValidationMiddleware(passing({}));
            const mw = new Mw();
            const ctx = makeCtx({method: 'POST', body: '{}', headers: {'Content-Type': 'application/json'}});
            const res = await callMw(mw, ctx, () => new Response('downstream', {status: 201}));
            expect(res.status).toBe(201);
        });
    });

    describe('invalid body', () => {
        it('returns 422 when safeParse returns { success: false }', async () => {
            const Mw = createValidationMiddleware(failing([{path: ['name'], message: 'Required'}]));
            const mw = new Mw();
            const ctx = makeCtx({method: 'POST', body: '{}', headers: {'Content-Type': 'application/json'}});
            const res = await callMw(mw, ctx);
            expect(res.status).toBe(422);
        });

        it('response body contains error and issues', async () => {
            const Mw = createValidationMiddleware(failing([{path: ['name'], message: 'Required'}]));
            const mw = new Mw();
            const ctx = makeCtx({method: 'POST', body: '{}', headers: {'Content-Type': 'application/json'}});
            const body = await (await callMw(mw, ctx)).json() as {
                error: string;
                issues: { path: string; message: string }[]
            };
            expect(body.error).toBe('Validation failed');
            expect(body.issues).toHaveLength(1);
            expect(body.issues[0]!.message).toBe('Required');
        });

        it('joins nested path with dots', async () => {
            const Mw = createValidationMiddleware(failing([{path: ['user', 'address', 'zip'], message: 'Invalid'}]));
            const mw = new Mw();
            const ctx = makeCtx({method: 'POST', body: '{}', headers: {'Content-Type': 'application/json'}});
            const body = await (await callMw(mw, ctx)).json() as { issues: { path: string }[] };
            expect(body.issues[0]!.path).toBe('user.address.zip');
        });

        it('does not call next() on failure', async () => {
            const Mw = createValidationMiddleware(failing([{path: [], message: 'Bad'}]));
            const mw = new Mw();
            let called = false;
            const ctx = makeCtx({method: 'POST', body: '{}', headers: {'Content-Type': 'application/json'}});
            await callMw(mw, ctx, () => {
                called = true;
                return new Response('ok');
            });
            expect(called).toBe(false);
        });
    });

    describe('malformed JSON', () => {
        it('returns 422 with empty issues array for invalid JSON body', async () => {
            const Mw = createValidationMiddleware(passing({}));
            const mw = new Mw();
            const ctx = makeCtx({method: 'POST', body: 'not-json', headers: {'Content-Type': 'application/json'}});
            const res = await callMw(mw, ctx);
            const body = await res.json() as { error: string; issues: unknown[] };
            expect(res.status).toBe(422);
            expect(body.error).toBe('Invalid JSON');
            expect(body.issues).toHaveLength(0);
        });
    });

});