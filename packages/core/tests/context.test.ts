import { describe, it, expect } from 'bun:test';
import { Context } from '../src/context.ts';
import { Router } from "../src/router.ts";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeCtx(options: {
  url?: string;
  method?: string;
  body?: string;
  contentType?: string;
  cookie?: string;
  params?: Record<string, string>;
  router?: Router;
} = {}) {
  const headers = new Headers();
  if (options.contentType) headers.set('Content-Type', options.contentType);
  if (options.cookie)      headers.set('Cookie', options.cookie);

  const req = new Request(options.url ?? 'http://localhost/', {
    method: options.method ?? 'GET',
    headers,
    body: options.body,
  });

  return new Context(req, options.params ?? {}, (options.router ?? new Router()).generate);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Context', () => {

  describe('params', () => {
    it('exposes constructor params', () => {
      const ctx = makeCtx({ params: { id: '42', slug: 'hello' } });
      expect(ctx.params['id']).toBe('42');
      expect(ctx.params['slug']).toBe('hello');
    });
  });

  describe('headers', () => {
    it('delegates to req.headers', () => {
      const ctx = makeCtx({ contentType: 'application/json' });
      expect(ctx.headers.get('Content-Type')).toBe('application/json');
    });
  });

  describe('searchParams', () => {
    it('parses query string values', () => {
      const ctx = makeCtx({ url: 'http://localhost/search?q=hello&page=2' });
      expect(ctx.searchParams.get('q')).toBe('hello');
      expect(ctx.searchParams.get('page')).toBe('2');
    });

    it('returns empty URLSearchParams when no query string', () => {
      const ctx = makeCtx({ url: 'http://localhost/no-query' });
      expect(ctx.searchParams.get('q')).toBeNull();
      expect([...ctx.searchParams].length).toBe(0);
    });
  });

  describe('cookies', () => {
    it('returns empty map when Cookie header is absent', () => {
      const ctx = makeCtx();
      expect(ctx.cookies.size).toBe(0);
    });

    it('parses a single cookie', () => {
      const ctx = makeCtx({ cookie: 'session=abc123' });
      expect(ctx.cookies.get('session')).toBe('abc123');
    });

    it('parses multiple cookies', () => {
      const ctx = makeCtx({ cookie: 'session=abc; theme=dark; lang=en' });
      expect(ctx.cookies.get('session')).toBe('abc');
      expect(ctx.cookies.get('theme')).toBe('dark');
      expect(ctx.cookies.get('lang')).toBe('en');
    });

    it('decodes URI-encoded cookie names and values', () => {
      const ctx = makeCtx({ cookie: 'my%20key=hello%20world' });
      expect(ctx.cookies.get('my key')).toBe('hello world');
    });
  });

  describe('body — caching', () => {
    it('text() returns the raw body string', async () => {
      const ctx = makeCtx({ method: 'POST', body: 'hello body' });
      expect(await ctx.text()).toBe('hello body');
    });

    it('json() parses the body as JSON', async () => {
      const ctx = makeCtx({
        method: 'POST',
        body: '{"name":"blue"}',
        contentType: 'application/json',
      });
      expect(await ctx.json<{ name: string }>()).toEqual({ name: 'blue' });
    });

    it('text() then json() both succeed (shared buffer)', async () => {
      const ctx = makeCtx({ method: 'POST', body: '{"x":1}' });
      const raw = await ctx.text();
      const parsed = await ctx.json<{ x: number }>();
      expect(raw).toBe('{"x":1}');
      expect(parsed.x).toBe(1);
    });

    it('json() then text() both succeed (shared buffer)', async () => {
      const ctx = makeCtx({ method: 'POST', body: '{"x":2}' });
      const parsed = await ctx.json<{ x: number }>();
      const raw = await ctx.text();
      expect(parsed.x).toBe(2);
      expect(raw).toBe('{"x":2}');
    });

    it('concurrent calls to text() return the same result', async () => {
      const ctx = makeCtx({ method: 'POST', body: 'concurrent' });
      const [a, b] = await Promise.all([ctx.text(), ctx.text()]);
      expect(a).toBe('concurrent');
      expect(b).toBe('concurrent');
    });
  });

  describe('static response factories', () => {
    it('Context.json() sets Content-Type: application/json', () => {
      const res = Context.json({ ok: true });
      expect(res.headers.get('Content-Type')).toBe('application/json');
    });

    it('Context.json() serializes data correctly', async () => {
      const res = Context.json({ value: 42 });
      expect(await res.json()).toEqual({ value: 42 });
    });

    it('Context.json() respects a custom status code', () => {
      const res = Context.json({ error: 'bad' }, { status: 400 });
      expect(res.status).toBe(400);
    });

    it('Context.json() does not overwrite an explicit Content-Type', () => {
      const res = Context.json({}, { headers: { 'Content-Type': 'application/vnd.api+json' } });
      expect(res.headers.get('Content-Type')).toBe('application/vnd.api+json');
    });

    it('Context.text() sets Content-Type: text/plain', () => {
      const res = Context.text('hello');
      expect(res.headers.get('Content-Type')).toContain('text/plain');
    });

    it('Context.text() returns the correct body', async () => {
      const res = Context.text('world');
      expect(await res.text()).toBe('world');
    });

    it('Context.redirect() defaults to 302', () => {
      const res = Context.redirect('https://example.com');
      expect(res.status).toBe(302);
    });

    it('Context.redirect() accepts a custom status', () => {
      const res = Context.redirect('https://example.com', 301);
      expect(res.status).toBe(301);
    });

    it('Context.empty() returns 204 with no body', async () => {
      const res = Context.empty();
      expect(res.status).toBe(204);
      expect(await res.text()).toBe('');
    });

    it('Context.empty() accepts a custom status', () => {
      const res = Context.empty(404);
      expect(res.status).toBe(404);
    });
  });

});