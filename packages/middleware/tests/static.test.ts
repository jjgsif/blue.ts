import {describe, it, expect, beforeAll, afterAll} from 'bun:test';
import {StaticMiddleware} from '../src/static.ts';
import {makeCtx, callMw} from './helpers.ts';
import {mkdirSync, rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';

// ── Test fixture setup ────────────────────────────────────────────────────────

const FIXTURE_DIR = join(tmpdir(), `blue-static-test-${process.pid}`);

beforeAll(async () => {
    mkdirSync(join(FIXTURE_DIR, 'sub'), {recursive: true});
    await Bun.write(join(FIXTURE_DIR, 'index.html'), '<h1>Hello</h1>');
    await Bun.write(join(FIXTURE_DIR, 'app.js'), 'console.log("hi")');
    await Bun.write(join(FIXTURE_DIR, 'data.json'), '{"ok":true}');
    await Bun.write(join(FIXTURE_DIR, 'sub', 'page.html'), '<p>Sub</p>');
});

afterAll(() => {
    rmSync(FIXTURE_DIR, {recursive: true, force: true});
});

function req(pathname: string) {
    return makeCtx({url: `http://localhost${pathname}`});
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('StaticMiddleware', () => {

    describe('file serving', () => {
        it('serves an existing HTML file with 200', async () => {
            const mw = new StaticMiddleware({dir: FIXTURE_DIR});
            const res = await callMw(mw, req('/index.html'));
            expect(res.status).toBe(200);
            expect(await res.text()).toBe('<h1>Hello</h1>');
        });

        it('sets Content-Type: text/html for .html files', async () => {
            const mw = new StaticMiddleware({dir: FIXTURE_DIR});
            const res = await callMw(mw, req('/index.html'));
            expect(res.headers.get('Content-Type')).toContain('text/html');
        });

        it('sets Content-Type: text/javascript for .js files', async () => {
            const mw = new StaticMiddleware({dir: FIXTURE_DIR});
            const res = await callMw(mw, req('/app.js'));
            expect(res.headers.get('Content-Type')).toContain('text/javascript');
        });

        it('sets Content-Type: application/json for .json files', async () => {
            const mw = new StaticMiddleware({dir: FIXTURE_DIR});
            const res = await callMw(mw, req('/data.json'));
            expect(res.headers.get('Content-Type')).toContain('application/json');
        });

        it('serves files in subdirectories', async () => {
            const mw = new StaticMiddleware({dir: FIXTURE_DIR});
            const res = await callMw(mw, req('/sub/page.html'));
            expect(res.status).toBe(200);
            expect(await res.text()).toBe('<p>Sub</p>');
        });
    });

    describe('miss behaviour', () => {
        it('calls next() when the file does not exist', async () => {
            const mw = new StaticMiddleware({dir: FIXTURE_DIR});
            let called = false;
            await callMw(mw, req('/missing.txt'), () => {
                called = true;
                return new Response('not found');
            });
            expect(called).toBe(true);
        });
    });

    describe('prefix stripping', () => {
        it('strips the configured prefix before resolving the path', async () => {
            const mw = new StaticMiddleware({dir: FIXTURE_DIR, prefix: '/static'});
            const res = await callMw(mw, req('/static/index.html'));
            expect(res.status).toBe(200);
        });

        it('calls next() when URL does not start with the prefix', async () => {
            const mw = new StaticMiddleware({dir: FIXTURE_DIR, prefix: '/static'});
            let called = false;
            await callMw(mw, req('/other/index.html'), () => {
                called = true;
                return new Response('ok');
            });
            expect(called).toBe(true);
        });
    });

    describe('path traversal prevention', () => {
        // The URL class normalises traversal sequences before the middleware sees them:
        //   new URL('http://localhost/../etc/passwd').pathname === '/etc/passwd'
        // So /../ attacks are neutralised by the URL API itself.
        // Our relative() containment check is defence-in-depth for any path that
        // somehow bypasses URL normalisation.
        it('URL-normalised traversal resolves to a safe path that misses and calls next()', async () => {
            const mw = new StaticMiddleware({dir: FIXTURE_DIR});
            let called = false;
            // '/../etc/passwd' normalises to '/etc/passwd' — not in our fixture dir
            await callMw(mw, req('/../etc/passwd'), () => {
                called = true;
                return new Response('ok');
            });
            expect(called).toBe(true);
        });

        it('returns 403 for percent-encoded traversal (%2e%2e%2f)', async () => {
            // %2f (encoded slash) is NOT normalised by the URL API — it stays encoded in pathname.
            // decodeURIComponent() decodes it to '../etc/passwd', and our relative() check catches it.
            const mw = new StaticMiddleware({dir: FIXTURE_DIR});
            const res = await callMw(mw, req('/%2e%2e%2fetc%2fpasswd'));
            expect(res.status).toBe(403);
        });
    });

});