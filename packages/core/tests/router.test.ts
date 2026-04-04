import { describe, it, expect } from 'bun:test';
import { Router } from '../src/router.ts';
import { RouterError } from '../src/errors/index.ts';
import type { Handler, RouteImplementation } from '../src/types.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeRouter() {
  return new Router();
}

// Minimal stub that satisfies the Handler constructor type
class StubHandler { handle() { return new Response('ok'); } }
const stub = StubHandler as unknown as Handler;

function makeImpl(extra: Partial<RouteImplementation> = {}): RouteImplementation {
  return { handler: stub, ...extra };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Router', () => {

  describe('match() — no match', () => {
    it('returns null for an unregistered path', () => {
      const r = makeRouter();
      expect(r.match('GET', '/missing')).toBeNull();
    });

    it('returns null for the wrong HTTP method', () => {
      const r = makeRouter();
      r.route('GET', '/items', makeImpl());
      expect(r.match('POST', '/items')).toBeNull();
    });

    it('returns null for a path-only string that does not match', () => {
      const r = makeRouter();
      r.route('GET', '/a', makeImpl());
      expect(r.match('GET', '/b')).toBeNull();
    });
  });

  describe('match() — exact match', () => {
    it('returns the stored implementation for an exact path', () => {
      const r = makeRouter();
      const impl = makeImpl();
      r.route('GET', '/hello', impl);
      const result = r.match('GET', '/hello');
      expect(result).not.toBeNull()
      // @ts-ignore
      expect(result!.handler).toBe(stub);
    });

    it('is method-specific — GET and POST on same path are independent', () => {
      const r = makeRouter();
      class GetHandler  { handle() { return new Response('get');  } }
      class PostHandler { handle() { return new Response('post'); } }
      r.route('GET',  '/x', { handler: GetHandler  as unknown as Handler });
      r.route('POST', '/x', { handler: PostHandler as unknown as Handler });
      // @ts-ignore
      expect(r.match('GET',  '/x')!.handler).toBe(GetHandler  as unknown as Handler);
      // @ts-ignore
      expect(r.match('POST', '/x')!.handler).toBe(PostHandler as unknown as Handler);
    });
  });

  describe('match() — URL normalization', () => {
    it('accepts a path-only string', () => {
      const r = makeRouter();
      r.route('GET', '/path', makeImpl());
      expect(r.match('GET', '/path')).not.toBeNull();
    });

    it('accepts a full URL and extracts the pathname', () => {
      const r = makeRouter();
      r.route('GET', '/path', makeImpl());
      expect(r.match('GET', 'http://localhost/path')).not.toBeNull();
    });

    it('ignores query string when matching', () => {
      const r = makeRouter();
      r.route('GET', '/search', makeImpl());
      expect(r.match('GET', 'http://localhost/search?q=hello')).not.toBeNull();
    });
  });

  describe('match() — route parameters', () => {
    it('extracts a single :param', () => {
      const r = makeRouter();
      r.route('GET', '/users/:id', makeImpl());
      const result = r.match('GET', '/users/42');
      expect(result?.params?.['id']).toBe('42');
    });

    it('extracts multiple :params', () => {
      const r = makeRouter();
      r.route('GET', '/orgs/:org/repos/:repo', makeImpl());
      const result = r.match('GET', '/orgs/blue/repos/core');
      expect(result?.params?.['org']).toBe('blue');
      expect(result?.params?.['repo']).toBe('core');
    });

    it('passes through middlewares from the stored implementation', () => {
      const r = makeRouter();
      class Mid { handle(_ctx: unknown, next: () => Response) { return next(); } }
      const impl = makeImpl({ middlewares: [Mid as unknown as import('../src/types.ts').Middleware] });
      r.route('GET', '/mw', impl);
      const result = r.match('GET', '/mw');
      expect(result?.middlewares).toHaveLength(1);
    });
  });

  describe('named routes — lookup()', () => {
    it('returns method and path for a registered name', () => {
      const r = makeRouter();
      r.route('GET', '/users/:id', makeImpl({ name: 'user.show' }));
      expect(r.lookup('user.show')).toEqual({ method: 'GET', path: '/users/:id' });
    });

    it('throws for an unknown name', () => {
      const r = makeRouter();
      expect(() => r.lookup('missing')).toThrow('No route named "missing"');
    });

    it('unnamed routes are not reachable via lookup', () => {
      const r = makeRouter();
      r.route('GET', '/anon', makeImpl());
      expect(() => r.lookup('anon')).toThrow();
    });
  });

  describe('named routes — generate()', () => {
    it('interpolates a single param', () => {
      const r = makeRouter();
      r.route('GET', '/users/:id', makeImpl({ name: 'user.show' }));
      expect(r.generate('user.show', { id: '42' })).toBe('/users/42');
    });

    it('interpolates multiple params', () => {
      const r = makeRouter();
      r.route('GET', '/orgs/:org/repos/:repo', makeImpl({ name: 'repo.show' }));
      expect(r.generate('repo.show', { org: 'blue', repo: 'core' })).toBe('/orgs/blue/repos/core');
    });

    it('appends extra params as a query string', () => {
      const r = makeRouter();
      r.route('GET', '/users/:id', makeImpl({ name: 'user.show' }));
      expect(r.generate('user.show', { id: '42', tab: 'posts' })).toBe('/users/42?tab=posts');
    });

    it('works with no params on a static route', () => {
      const r = makeRouter();
      r.route('GET', '/health', makeImpl({ name: 'health' }));
      expect(r.generate('health')).toBe('/health');
    });

    it('URI-encodes param values', () => {
      const r = makeRouter();
      r.route('GET', '/users/:name', makeImpl({ name: 'user.show' }));
      expect(r.generate('user.show', { name: 'hello world' })).toBe('/users/hello%20world');
    });

    it('throws for a missing required param', () => {
      const r = makeRouter();
      r.route('GET', '/users/:id', makeImpl({ name: 'user.show' }));
      expect(() => r.generate('user.show', {})).toThrow('Missing param "id"');
    });

    it('throws for an unknown route name', () => {
      const r = makeRouter();
      expect(() => r.generate('missing')).toThrow('No route named "missing"');
    });
  });

  describe('route conflict detection', () => {
    it('throws RouterError when the same method + path is registered twice', () => {
      const r = makeRouter();
      r.route('GET', '/dupe', makeImpl());
      expect(() => r.route('GET', '/dupe', makeImpl())).toThrow(RouterError);
    });

    it('allows the same path under different methods', () => {
      const r = makeRouter();
      r.route('GET',  '/items', makeImpl());
      expect(() => r.route('POST', '/items', makeImpl())).not.toThrow();
    });
  });

});