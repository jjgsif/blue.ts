import { describe, it, expect } from 'bun:test';
import { App } from '../src/app.ts';
import { Container } from '../src/container.ts';
import { Context } from '../src/context.ts';
import { Router } from '../src/router.ts';
import type { Handler, Middleware } from '../src/types.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeApp() {
  return new App(new Container(new Map()), new Router());
}

function get(app: App, path: string) {
  return app.fetch(new Request(`http://localhost${path}`));
}

function post(app: App, path: string, body: string) {
  return app.fetch(new Request(`http://localhost${path}`, { method: 'POST', body }));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('App', () => {

  describe('404 handling', () => {
    it('returns 404 JSON for an unregistered route', async () => {
      const app = makeApp();
      const res = await get(app, '/not-found');
      expect(res.status).toBe(404);
      const body = await res.json() as { error: string };
      expect(body.error).toBe('Not Found');
    });
  });

  describe('handler invocation', () => {
    it('calls the registered handler and returns its response', async () => {
      const app = makeApp();

      class PingHandler {
        handle(_ctx: Context): Response { return Context.json({ pong: true }); }
      }

      app.registerDependency(PingHandler as unknown as Handler, {
        lifetime: 'transient',
        factory: () => new PingHandler(),
      });
      app.route('GET', '/ping', { handler: PingHandler as unknown as Handler });

      const res = await get(app, '/ping');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ pong: true });
    });

    it('handler receives correct ctx.params', async () => {
      const app = makeApp();

      class EchoHandler {
        handle(ctx: Context): Response {
          return Context.json({ id: ctx.params['id'] });
        }
      }

      app.registerDependency(EchoHandler as unknown as Handler, {
        lifetime: 'transient',
        factory: () => new EchoHandler(),
      });
      app.route('GET', '/items/:id', { handler: EchoHandler as unknown as Handler });

      const res = await get(app, '/items/99');
      expect((await res.json() as { id: string }).id).toBe('99');
    });
  });

  describe('global middleware', () => {
    it('runs middleware before the handler', async () => {
      const app = makeApp();
      const order: string[] = [];

      class TraceMiddleware {
        handle(_ctx: Context, next: () => Response | Promise<Response>) {
          order.push('middleware');
          return next();
        }
      }

      class TraceHandler {
        handle(_ctx: Context): Response {
          order.push('handler');
          return new Response('ok');
        }
      }

      app.registerDependency(TraceMiddleware as unknown as Middleware, {
        lifetime: 'scoped',
        factory: () => new TraceMiddleware(),
      });
      app.registerDependency(TraceHandler as unknown as Handler, {
        lifetime: 'transient',
        factory: () => new TraceHandler(),
      });
      app.use(TraceMiddleware as unknown as Middleware);
      app.route('GET', '/trace', { handler: TraceHandler as unknown as Handler });

      await get(app, '/trace');
      expect(order).toEqual(['middleware', 'handler']);
    });

    it('runs multiple middleware in registration order', async () => {
      const app = makeApp();
      const order: string[] = [];

      class Mid1 {
        handle(_ctx: Context, next: () => Response | Promise<Response>) {
          order.push('mid1');
          return next();
        }
      }
      class Mid2 {
        handle(_ctx: Context, next: () => Response | Promise<Response>) {
          order.push('mid2');
          return next();
        }
      }
      class OkHandler {
        handle(): Response { return new Response('ok'); }
      }

      for (const cls of [Mid1, Mid2, OkHandler]) {
        app.registerDependency(cls as unknown as Handler, {
          lifetime: 'scoped',
          factory: () => new cls(),
        });
      }

      app.use(Mid1 as unknown as Middleware, Mid2 as unknown as Middleware);
      app.route('GET', '/multi', { handler: OkHandler as unknown as Handler });

      await get(app, '/multi');
      expect(order).toEqual(['mid1', 'mid2']);
    });

    it('middleware can short-circuit without calling next', async () => {
      const app = makeApp();

      class BlockMiddleware {
        handle(_ctx: Context, _next: () => Response | Promise<Response>): Response {
          return new Response('blocked', { status: 403 });
        }
      }
      class UnreachableHandler {
        handle(): Response { return new Response('should not reach', { status: 200 }); }
      }

      app.registerDependency(BlockMiddleware as unknown as Middleware, {
        lifetime: 'scoped',
        factory: () => new BlockMiddleware(),
      });
      app.registerDependency(UnreachableHandler as unknown as Handler, {
        lifetime: 'transient',
        factory: () => new UnreachableHandler(),
      });
      app.use(BlockMiddleware as unknown as Middleware);
      app.route('GET', '/blocked', { handler: UnreachableHandler as unknown as Handler });

      const res = await get(app, '/blocked');
      expect(res.status).toBe(403);
      expect(await res.text()).toBe('blocked');
    });
  });

  describe('route-level middleware', () => {
    it('route-level middleware runs after global, before handler', async () => {
      const app = makeApp();
      const order: string[] = [];

      class GlobalMid {
        handle(_ctx: Context, next: () => Response | Promise<Response>) {
          order.push('global');
          return next();
        }
      }
      class RouteMid {
        handle(_ctx: Context, next: () => Response | Promise<Response>) {
          order.push('route');
          return next();
        }
      }
      class FinalHandler {
        handle(): Response { order.push('handler'); return new Response('ok'); }
      }

      for (const cls of [GlobalMid, RouteMid, FinalHandler]) {
        app.registerDependency(cls as unknown as Handler, {
          lifetime: 'scoped',
          factory: () => new cls(),
        });
      }

      app.use(GlobalMid as unknown as Middleware);
      app.route('GET', '/layered', {
        middlewares: [RouteMid as unknown as Middleware],
        handler: FinalHandler as unknown as Handler,
      });

      await get(app, '/layered');
      expect(order).toEqual(['global', 'route', 'handler']);
    });
  });

  describe('scoped container per request', () => {
    it('middleware resolved from the scoped container gets a fresh instance per request', async () => {
      const app = makeApp();
      const instances: object[] = [];

      // RequestService is scoped — a new one is created for each request's scope
      class RequestService { id = Math.random(); }

      class CaptureMid {
        constructor(private svc: RequestService) {}
        handle(_ctx: Context, next: () => Response | Promise<Response>) {
          instances.push(this.svc);
          return next();
        }
      }
      class OkHandler {
        handle(): Response { return new Response('ok'); }
      }

      app.registerDependency(RequestService, { lifetime: 'scoped', factory: () => new RequestService() });
      app.registerDependency(CaptureMid as unknown as Middleware, {
        lifetime: 'scoped',
        factory: async (c) => new CaptureMid(await c.get(RequestService)),
      });
      app.registerDependency(OkHandler as unknown as Handler, {
        lifetime: 'transient',
        factory: () => new OkHandler(),
      });

      app.use(CaptureMid as unknown as Middleware);
      app.route('GET', '/scoped', { handler: OkHandler as unknown as Handler });

      await get(app, '/scoped');
      await get(app, '/scoped');

      expect(instances.length).toBe(2);
      // Each request gets its own RequestService from a fresh scope
      expect(instances[0]).not.toBe(instances[1]);
    });
  });

  describe('group()', () => {
    it('registers routes under the given prefix', async () => {
      const app = makeApp();
      class OkHandler { handle(): Response { return new Response('ok'); } }
      app.registerDependency(OkHandler as unknown as Handler, { lifetime: 'transient', factory: () => new OkHandler() });

      app.group('/api/v1', (r) => {
        r.route('GET', '/users', { handler: OkHandler as unknown as Handler });
      });

      expect((await get(app, '/api/v1/users')).status).toBe(200);
    });

    it('returns 404 for the unprefixed path', async () => {
      const app = makeApp();
      class OkHandler { handle(): Response { return new Response('ok'); } }
      app.registerDependency(OkHandler as unknown as Handler, { lifetime: 'transient', factory: () => new OkHandler() });

      app.group('/api/v1', (r) => {
        r.route('GET', '/users', { handler: OkHandler as unknown as Handler });
      });

      expect((await get(app, '/users')).status).toBe(404);
    });

    it('group middleware runs after global middleware, before handler', async () => {
      const app = makeApp();
      const order: string[] = [];

      class GlobalMid {
        handle(_ctx: Context, next: () => Response | Promise<Response>) { order.push('global'); return next(); }
      }
      class GroupMid {
        handle(_ctx: Context, next: () => Response | Promise<Response>) { order.push('group'); return next(); }
      }
      class OkHandler {
        handle(): Response { order.push('handler'); return new Response('ok'); }
      }

      for (const cls of [GlobalMid, GroupMid, OkHandler]) {
        app.registerDependency(cls as unknown as Handler, { lifetime: 'scoped', factory: () => new cls() });
      }

      app.use(GlobalMid as unknown as Middleware);
      app.group('/api', [GroupMid as unknown as Middleware], (r) => {
        r.route('GET', '/ping', { handler: OkHandler as unknown as Handler });
      });

      await get(app, '/api/ping');
      expect(order).toEqual(['global', 'group', 'handler']);
    });

    it('nested groups compose prefixes', async () => {
      const app = makeApp();
      class OkHandler { handle(): Response { return new Response('ok'); } }
      app.registerDependency(OkHandler as unknown as Handler, { lifetime: 'transient', factory: () => new OkHandler() });

      app.group('/api', (r) => {
        r.group('/v1', (v1) => {
          v1.route('GET', '/users', { handler: OkHandler as unknown as Handler });
        });
      });

      expect((await get(app, '/api/v1/users')).status).toBe(200);
      expect((await get(app, '/v1/users')).status).toBe(404);
    });

    it('nested groups compose middleware', async () => {
      const app = makeApp();
      const order: string[] = [];

      class OuterMid {
        handle(_ctx: Context, next: () => Response | Promise<Response>) { order.push('outer'); return next(); }
      }
      class InnerMid {
        handle(_ctx: Context, next: () => Response | Promise<Response>) { order.push('inner'); return next(); }
      }
      class OkHandler {
        handle(): Response { order.push('handler'); return new Response('ok'); }
      }

      for (const cls of [OuterMid, InnerMid, OkHandler]) {
        app.registerDependency(cls as unknown as Handler, { lifetime: 'scoped', factory: () => new cls() });
      }

      app.group('/api', [OuterMid as unknown as Middleware], (r) => {
        r.group('/v1', [InnerMid as unknown as Middleware], (v1) => {
          v1.route('GET', '/users', { handler: OkHandler as unknown as Handler });
        });
      });

      await get(app, '/api/v1/users');
      expect(order).toEqual(['outer', 'inner', 'handler']);
    });
  });

  describe('functional handlers', () => {
    it('app.get() registers a function handler', async () => {
      const app = makeApp();
      app.get('/health', () => new Response('ok'));
      expect((await get(app, '/health')).status).toBe(200);
      expect(await (await get(app, '/health')).text()).toBe('ok');
    });

    it('app.post() registers a function handler', async () => {
      const app = makeApp();
      app.post('/echo', async (ctx) => new Response(await ctx.text()));
      const res = await post(app, '/echo', 'hello');
      expect(await res.text()).toBe('hello');
    });

    it('function handler receives ctx.params', async () => {
      const app = makeApp();
      app.get('/users/:id', (ctx) => Context.json({ id: ctx.params['id'] }));
      const res = await get(app, '/users/42');
      expect((await res.json() as { id: string }).id).toBe('42');
    });

    it('function handler can be named for url()', () => {
      const app = makeApp();
      app.get('/users/:id', (ctx) => new Response(ctx.params['id'] ?? ''), { name: 'user.show' });
      expect(app.url('user.show', { id: '99' })).toBe('/users/99');
    });

    it('function handler works inside group()', async () => {
      const app = makeApp();
      app.group('/api/v1', (r) => {
        r.get('/ping', () => new Response('pong'));
      });
      expect(await (await get(app, '/api/v1/ping')).text()).toBe('pong');
    });

    it('global middleware runs before a function handler', async () => {
      const app = makeApp();
      const order: string[] = [];

      class TraceMid {
        handle(_ctx: Context, next: () => Response | Promise<Response>) {
          order.push('middleware');
          return next();
        }
      }

      app.registerDependency(TraceMid as unknown as Middleware, {
        lifetime: 'scoped',
        factory: () => new TraceMid(),
      });
      app.use(TraceMid as unknown as Middleware);
      app.get('/trace', () => { order.push('handler'); return new Response('ok'); });

      await get(app, '/trace');
      expect(order).toEqual(['middleware', 'handler']);
    });

    it('route(fn) and route(class) can coexist', async () => {
      const app = makeApp();

      class ClassHandler { handle(): Response { return new Response('class'); } }
      app.registerDependency(ClassHandler as unknown as Handler, {
        lifetime: 'transient',
        factory: () => new ClassHandler(),
      });

      app.get('/fn',    () => new Response('fn'));
      app.route('GET', '/class', { handler: ClassHandler as unknown as Handler });

      expect(await (await get(app, '/fn')).text()).toBe('fn');
      expect(await (await get(app, '/class')).text()).toBe('class');
    });
  });

  describe('url()', () => {
    it('generates a URL for a named route', () => {
      const app = makeApp();
      class StubHandler { handle(): Response { return new Response('ok'); } }
      app.registerDependency(StubHandler as unknown as Handler, { lifetime: 'transient', factory: () => new StubHandler() });
      app.route('GET', '/users/:id', { name: 'user.show', handler: StubHandler as unknown as Handler });
      expect(app.url('user.show', { id: '42' })).toBe('/users/42');
    });
  });

  describe('auto-registration', () => {
    it('class handler with no deps works without registerDependency', async () => {
      const app = makeApp();

      class PingHandler {
        handle(): Response { return new Response('pong'); }
      }

      app.route('GET', '/ping', { handler: PingHandler as unknown as Handler });

      const res = await get(app, '/ping');
      expect(res.status).toBe(200);
      expect(await res.text()).toBe('pong');
    });

    it('route-level middleware with no deps works without registerDependency', async () => {
      const app = makeApp();
      const order: string[] = [];

      class TagMid {
        handle(_ctx: Context, next: () => Response | Promise<Response>) {
          order.push('mid');
          return next();
        }
      }
      class OkHandler {
        handle(): Response { order.push('handler'); return new Response('ok'); }
      }

      app.route('GET', '/tagged', {
        middlewares: [TagMid as unknown as Middleware],
        handler: OkHandler as unknown as Handler,
      });

      await get(app, '/tagged');
      expect(order).toEqual(['mid', 'handler']);
    });

    it('explicit registerDependency is not overridden by auto-registration', async () => {
      const app = makeApp();
      let factoryCalled = false;

      class MyHandler {
        handle(): Response { return new Response('explicit'); }
      }

      app.registerDependency(MyHandler as unknown as Handler, {
        lifetime: 'transient',
        factory: () => { factoryCalled = true; return new MyHandler(); },
      });
      app.route('GET', '/explicit', { handler: MyHandler as unknown as Handler });

      const res = await get(app, '/explicit');
      expect(res.status).toBe(200);
      expect(factoryCalled).toBe(true);
    });

    it('auto-registered handler is transient (new instance per request)', async () => {
      const app = makeApp();
      const instances: object[] = [];

      class TrackHandler {
        handle(): Response {
          instances.push(this);
          return new Response('ok');
        }
      }

      app.route('GET', '/track', { handler: TrackHandler as unknown as Handler });

      await get(app, '/track');
      await get(app, '/track');

      expect(instances.length).toBe(2);
      expect(instances[0]).not.toBe(instances[1]);
    });
  });

  describe('error handling', () => {
    it('onError receives a HandlerError with cause set to the original error', async () => {
      const app = makeApp();
      const original = new Error('boom');
      let captured: unknown;

      class BoomHandler { handle(): Response { throw original; } }
      app.registerDependency(BoomHandler as unknown as Handler, { lifetime: 'transient', factory: () => new BoomHandler() });
      app.route('GET', '/boom', { handler: BoomHandler as unknown as Handler });
      app.onError((_ctx, err) => { captured = err.cause; return new Response('err', { status: 500 }); });

      await get(app, '/boom');
      expect(captured).toBe(original);
    });

    it('HandlerError message includes the HTTP method and URL', async () => {
      const app = makeApp();
      let message = '';

      class BoomHandler { handle(): Response { throw new Error('boom'); } }
      app.registerDependency(BoomHandler as unknown as Handler, { lifetime: 'transient', factory: () => new BoomHandler() });
      app.route('GET', '/boom', { handler: BoomHandler as unknown as Handler });
      app.onError((_ctx, err) => { message = err.message; return new Response('err', { status: 500 }); });

      await get(app, '/boom');
      expect(message).toContain('GET');
      expect(message).toContain('/boom');
    });
  });

});