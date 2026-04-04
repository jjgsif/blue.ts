import { describe, it, expect } from 'bun:test';
import { App } from '../src/app.ts';
import { Container } from '../src/container.ts';
import { ConfigProvider } from '../src/providers.ts';
import { Router } from '../src/router.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeApp() {
  return new App(new Container(new Map()), new Router());
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ConfigProvider', () => {

  describe('default no-op implementations', () => {
    it('can be extended without overriding any method', () => {
      class EmptyModule extends ConfigProvider {}
      const app = makeApp();
      expect(() => app.registerProvider(new EmptyModule())).not.toThrow();
    });

    it('boot() on the base class resolves without throwing', async () => {
      class EmptyModule extends ConfigProvider {}
      await expect(new EmptyModule().boot()).resolves.toBeUndefined();
    });
  });

  describe('registerProvider — registration ordering', () => {
    it('calls registerDependency before registerRoutes for a single provider', () => {
      const order: string[] = [];

      class OrderedModule extends ConfigProvider {
        override registerDependency(_app: App) { order.push('dep'); }
        override registerRoutes(_app: App)     { order.push('route'); }
      }

      makeApp().registerProvider(new OrderedModule());
      expect(order).toEqual(['dep', 'route']);
    });

    it('calls ALL registerDependency before ANY registerRoutes across providers', () => {
      const order: string[] = [];

      class ModuleA extends ConfigProvider {
        override registerDependency() { order.push('A:dep'); }
        override registerRoutes()    { order.push('A:route'); }
      }
      class ModuleB extends ConfigProvider {
        override registerDependency() { order.push('B:dep'); }
        override registerRoutes()    { order.push('B:route'); }
      }

      makeApp().registerProvider(new ModuleA(), new ModuleB());
      expect(order).toEqual(['A:dep', 'B:dep', 'A:route', 'B:route']);
    });

    it('is chainable — returns the App instance', () => {
      const app = makeApp();
      const result = app.registerProvider();
      expect(result).toBe(app);
    });
  });

  describe('boot() lifecycle', () => {
    it('calls boot() on every registered provider', async () => {
      const booted: string[] = [];

      class ModA extends ConfigProvider {
        override async boot() { booted.push('A'); }
      }
      class ModB extends ConfigProvider {
        override async boot() { booted.push('B'); }
      }

      const app = makeApp();
      app.registerProvider(new ModA(), new ModB());
      await app.boot();
      expect(booted).toContain('A');
      expect(booted).toContain('B');
    });

    it('calls boot() in registration order', async () => {
      const order: string[] = [];

      class First  extends ConfigProvider { override async boot() { order.push('first');  } }
      class Second extends ConfigProvider { override async boot() { order.push('second'); } }
      class Third  extends ConfigProvider { override async boot() { order.push('third');  } }

      const app = makeApp();
      app.registerProvider(new First(), new Second(), new Third());
      await app.boot();
      expect(order).toEqual(['first', 'second', 'third']);
    });

    it('awaits each boot() before starting the next', async () => {
      const log: string[] = [];

      class SlowModule extends ConfigProvider {
        override async boot() {
          await new Promise<void>(r => setTimeout(r, 10));
          log.push('slow-done');
        }
      }
      class FastModule extends ConfigProvider {
        override async boot() {
          log.push('fast-done');
        }
      }

      const app = makeApp();
      app.registerProvider(new SlowModule(), new FastModule());
      await app.boot();
      // SlowModule was registered first and must complete before FastModule boots
      expect(log).toEqual(['slow-done', 'fast-done']);
    });

    it('does not call boot() on providers registered after boot() was called', async () => {
      const booted: string[] = [];

      class EarlyMod extends ConfigProvider {
        override async boot() { booted.push('early'); }
      }
      class LateMod extends ConfigProvider {
        override async boot() { booted.push('late'); }
      }

      const app = makeApp();
      app.registerProvider(new EarlyMod());
      await app.boot();
      app.registerProvider(new LateMod()); // registered after boot — not booted
      expect(booted).toEqual(['early']);
    });
  });

});