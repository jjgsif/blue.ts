import {describe, it, expect} from 'bun:test';
import {createCorsMiddleware, CorsMiddleware} from '../src/cors.ts';
import {makeCtx, callMw} from './helpers.ts';

function options(url = 'http://localhost/api') {
    return makeCtx({url, method: 'OPTIONS', headers: {Origin: 'https://example.com'}});
}

function get(origin?: string) {
    return makeCtx({headers: origin ? {Origin: origin} : {}});
}

describe('CorsMiddleware', () => {

    describe('preflight (OPTIONS)', () => {
        it('returns 204 for an allowed origin', async () => {
            const mw = new CorsMiddleware({origins: 'https://example.com'});
            const res = await callMw(mw, options());
            expect(res.status).toBe(204);
        });

        it('never calls next() on OPTIONS', async () => {
            const mw = new CorsMiddleware({origins: '*'});
            let called = false;
            await callMw(mw, options(), () => {
                called = true;
                return new Response('ok');
            });
            expect(called).toBe(false);
        });

        it('sets Access-Control-Allow-Methods', async () => {
            const mw = new CorsMiddleware({origins: '*', methods: ['GET', 'POST']});
            const res = await callMw(mw, options());
            expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST');
        });

        it('sets Access-Control-Allow-Headers', async () => {
            const mw = new CorsMiddleware({origins: '*', headers: ['X-Custom']});
            const res = await callMw(mw, options());
            expect(res.headers.get('Access-Control-Allow-Headers')).toBe('X-Custom');
        });

        it('sets Access-Control-Max-Age', async () => {
            const mw = new CorsMiddleware({origins: '*', maxAge: 3600});
            const res = await callMw(mw, options());
            expect(res.headers.get('Access-Control-Max-Age')).toBe('3600');
        });

        it('returns 204 without CORS headers for a disallowed origin', async () => {
            const mw = new CorsMiddleware({origins: 'https://allowed.com'});
            const ctx = makeCtx({method: 'OPTIONS', headers: {Origin: 'https://evil.com'}});
            const res = await callMw(mw, ctx);
            expect(res.status).toBe(204);
            expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
        });
    });

    describe('regular requests', () => {
        it('adds Access-Control-Allow-Origin for an allowed origin', async () => {
            const mw = new CorsMiddleware({origins: 'https://example.com'});
            const res = await callMw(mw, get('https://example.com'));
            expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
        });

        it('calls next() and returns its response', async () => {
            const mw = new CorsMiddleware({origins: '*'});
            const res = await callMw(mw, get('https://example.com'), () => new Response('body', {status: 201}));
            expect(res.status).toBe(201);
            expect(await res.text()).toBe('body');
        });

        it('does not add CORS headers when Origin is missing', async () => {
            const mw = new CorsMiddleware({origins: '*'});
            const res = await callMw(mw, get());
            expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
        });
    });

    describe('origin matching', () => {
        it('matches wildcard "*"', async () => {
            const mw = new CorsMiddleware({origins: '*'});
            const res = await callMw(mw, get('https://anything.com'));
            expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
        });

        it('matches exact string origin', async () => {
            const mw = new CorsMiddleware({origins: 'https://exact.com'});
            const res = await callMw(mw, get('https://exact.com'));
            expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://exact.com');
        });

        it('rejects a non-matching exact string', async () => {
            const mw = new CorsMiddleware({origins: 'https://exact.com'});
            const res = await callMw(mw, get('https://other.com'));
            expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
        });

        it('matches from an array of origins', async () => {
            const mw = new CorsMiddleware({origins: ['https://a.com', 'https://b.com']});
            const res = await callMw(mw, get('https://b.com'));
            expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://b.com');
        });

        it('rejects an origin not in the array', async () => {
            const mw = new CorsMiddleware({origins: ['https://a.com']});
            const res = await callMw(mw, get('https://c.com'));
            expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
        });

        it('calls a predicate function', async () => {
            const mw = new CorsMiddleware({origins: (o) => o.endsWith('.example.com')});
            const allowed = await callMw(mw, get('https://sub.example.com'));
            const denied = await callMw(mw, get('https://evil.com'));
            expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://sub.example.com');
            expect(denied.headers.get('Access-Control-Allow-Origin')).toBeNull();
        });
    });

    describe('credentials', () => {
        it('echoes the actual origin instead of "*" when credentials is true', async () => {
            const mw = new CorsMiddleware({origins: '*', credentials: true});
            const res = await callMw(mw, get('https://example.com'));
            expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://example.com');
        });

        it('sets Access-Control-Allow-Credentials: true', async () => {
            const mw = new CorsMiddleware({origins: 'https://example.com', credentials: true});
            const res = await callMw(mw, get('https://example.com'));
            expect(res.headers.get('Access-Control-Allow-Credentials')).toBe('true');
        });
    });

});

describe('cors() factory', () => {

    it('returns a class constructor', () => {
        const Cls = createCorsMiddleware({origins: '*'});
        expect(typeof Cls).toBe('function');
    });

    it('can be instantiated with new', () => {
        const Cls = createCorsMiddleware({origins: '*'});
        const instance = new Cls();
        expect(typeof instance.handle).toBe('function');
    });

    it('each call produces a distinct class', () => {
        const A = createCorsMiddleware({origins: 'https://a.com'});
        const B = createCorsMiddleware({origins: 'https://b.com'});
        expect(A).not.toBe(B);
    });

    it('applies the configured origin', async () => {
        const Cls = createCorsMiddleware({origins: 'https://app.example.com'});
        const mw = new Cls();
        const ctx = makeCtx({headers: {Origin: 'https://app.example.com'}});
        const res = await callMw(mw, ctx);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://app.example.com');
    });

    it('different factories enforce independent policies', async () => {
        const PublicCors = createCorsMiddleware({origins: '*'});
        const AdminCors = createCorsMiddleware({origins: 'https://admin.example.com'});
        const publicMw = new PublicCors();
        const adminMw = new AdminCors();

        const publicRes = await callMw(publicMw, makeCtx({headers: {Origin: 'https://anyone.com'}}));
        const adminRes = await callMw(adminMw, makeCtx({headers: {Origin: 'https://anyone.com'}}));

        expect(publicRes.headers.get('Access-Control-Allow-Origin')).toBe('*');
        expect(adminRes.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('handles preflight correctly', async () => {
        const Cls = createCorsMiddleware({origins: 'https://example.com', methods: ['GET', 'POST']});
        const mw = new Cls();
        const ctx = makeCtx({method: 'OPTIONS', headers: {Origin: 'https://example.com'}});
        const res = await callMw(mw, ctx);
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Methods')).toBe('GET, POST');
    });

});