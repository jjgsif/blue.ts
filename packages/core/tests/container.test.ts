import { describe, it, expect } from 'bun:test';
import { Container } from '../src/container.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeContainer() {
  return new Container(new Map());
}

class ServiceA { value = 'a'; }
class ServiceB { value = 'b'; }

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Container', () => {

  describe('get() — unregistered', () => {
    it('throws for an unknown class identifier', async () => {
      const c = makeContainer();
      expect(c.get(ServiceA)).rejects.toThrow('No registration found');
    });

    it('throws for an unknown string identifier', async () => {
      const c = makeContainer();
      expect(c.get('missing')).rejects.toThrow('No registration found');
    });

    it('throws for an unknown symbol identifier', async () => {
      const c = makeContainer();
      const sym = Symbol('test');
      expect(c.get(sym)).rejects.toThrow('No registration found');
    });
  });

  describe('singleton lifetime', () => {
    it('returns the same instance on repeated calls', async () => {
      const c = makeContainer();
      c.register(ServiceA, { lifetime: 'singleton', factory: () => new ServiceA() });
      const a1 = await c.get(ServiceA);
      const a2 = await c.get(ServiceA);
      expect(a1).toBe(a2);
    });

    it('only calls the factory once', async () => {
      const c = makeContainer();
      let calls = 0;
      c.register(ServiceA, { lifetime: 'singleton', factory: () => { calls++; return new ServiceA(); } });
      await c.get(ServiceA);
      await c.get(ServiceA);
      expect(calls).toBe(1);
    });

    it('returns the pre-set value without calling the factory', async () => {
      const c = makeContainer();
      const instance = new ServiceA();
      let factoryCalled = false;
      c.register(ServiceA, {
        lifetime: 'singleton',
        value: instance,
        factory: () => { factoryCalled = true; return new ServiceA(); },
      });
      const result = await c.get(ServiceA);
      expect(result).toBe(instance);
      expect(factoryCalled).toBe(false);
    });

    it('caches the instance on the root when resolved from a scope', async () => {
      const root = makeContainer();
      root.register(ServiceA, { lifetime: 'singleton', factory: () => new ServiceA() });
      const scope = root.createScope();
      const fromScope = await scope.get(ServiceA);
      const fromRoot  = await root.get(ServiceA);
      expect(fromScope).toBe(fromRoot);
    });

    it('does not double-initialize under concurrent async resolution', async () => {
      const c = makeContainer();
      let calls = 0;
      c.register(ServiceA, {
        lifetime: 'singleton',
        factory: () => new Promise<ServiceA>(resolve => {
          calls++;
          setTimeout(() => resolve(new ServiceA()), 0);
        }),
      });
      const [a1, a2] = await Promise.all([c.get(ServiceA), c.get(ServiceA)]);
      expect(calls).toBe(1);
      expect(a1).toBe(a2);
    });
  });

  describe('scoped lifetime', () => {
    it('returns the same instance within one scope', async () => {
      const root = makeContainer();
      root.register(ServiceA, { lifetime: 'scoped', factory: () => new ServiceA() });
      const scope = root.createScope();
      const a1 = await scope.get(ServiceA);
      const a2 = await scope.get(ServiceA);
      expect(a1).toBe(a2);
    });

    it('returns different instances across different scopes', async () => {
      const root = makeContainer();
      root.register(ServiceA, { lifetime: 'scoped', factory: () => new ServiceA() });
      const s1 = root.createScope();
      const s2 = root.createScope();
      const a1 = await s1.get(ServiceA);
      const a2 = await s2.get(ServiceA);
      expect(a1).not.toBe(a2);
    });
  });

  describe('transient lifetime', () => {
    it('returns a new instance on every get()', async () => {
      const c = makeContainer();
      c.register(ServiceA, { lifetime: 'transient', factory: () => new ServiceA() });
      const a1 = await c.get(ServiceA);
      const a2 = await c.get(ServiceA);
      expect(a1).not.toBe(a2);
    });

    it('calls the factory every time', async () => {
      const c = makeContainer();
      let calls = 0;
      c.register(ServiceA, { lifetime: 'transient', factory: () => { calls++; return new ServiceA(); } });
      await c.get(ServiceA);
      await c.get(ServiceA);
      await c.get(ServiceA);
      expect(calls).toBe(3);
    });
  });

  describe('scope delegation', () => {
    it('resolves from root when identifier is not in scope registry', async () => {
      const root = makeContainer();
      root.register(ServiceA, { lifetime: 'transient', factory: () => new ServiceA() });
      const scope = root.createScope();
      const result = await scope.get(ServiceA);
      expect(result).toBeInstanceOf(ServiceA);
    });

    it('scope registration overrides root registration', async () => {
      // Use transient so there is no cross-scope cache; each get() calls the factory.
      const root = makeContainer();
      root.register('key', { lifetime: 'transient', factory: () => 'from-root' });
      const scope = root.createScope();
      scope.register('key', { lifetime: 'transient', factory: () => 'from-scope' });
      expect(await scope.get<string>('key')).toBe('from-scope');
      expect(await root.get<string>('key')).toBe('from-root');
    });
  });

  describe('circular dependency detection', () => {
    it('throws for a direct self-dependency (transient)', async () => {
      const c = makeContainer();
      c.register(ServiceA, {
        lifetime: 'transient',
        factory: async (c) => { await c.get(ServiceA); return new ServiceA(); },
      });
      await expect(c.get(ServiceA)).rejects.toThrow('Circular dependency detected');
    });

    it('includes the cycle path in the error message', async () => {
      const c = makeContainer();
      c.register(ServiceA, {
        lifetime: 'transient',
        factory: async (c) => { await c.get(ServiceB); return new ServiceA(); },
      });
      c.register(ServiceB, {
        lifetime: 'transient',
        factory: async (c) => { await c.get(ServiceA); return new ServiceB(); },
      });
      await expect(c.get(ServiceA)).rejects.toThrow('ServiceA → ServiceB → ServiceA');
    });

    it('detects a three-node cycle (A → B → C → A)', async () => {
      const c = makeContainer();
      class C { }
      c.register(ServiceA, { lifetime: 'transient', factory: async (c) => { await c.get(ServiceB); return new ServiceA(); } });
      c.register(ServiceB, { lifetime: 'transient', factory: async (c) => { await c.get(C);        return new ServiceB(); } });
      c.register(C,        { lifetime: 'transient', factory: async (c) => { await c.get(ServiceA); return new C();        } });
      await expect(c.get(ServiceA)).rejects.toThrow('Circular dependency detected');
    });

    it('does not throw for independent resolutions of the same identifier', async () => {
      const c = makeContainer();
      c.register(ServiceA, { lifetime: 'transient', factory: () => new ServiceA() });
      // Two separate get() calls — not a cycle
      await c.get(ServiceA);
      await expect(c.get(ServiceA)).resolves.toBeInstanceOf(ServiceA);
    });

    it('does not throw for a singleton resolved twice (cache hit)', async () => {
      const c = makeContainer();
      c.register(ServiceA, { lifetime: 'singleton', factory: () => new ServiceA() });
      await c.get(ServiceA);
      await expect(c.get(ServiceA)).resolves.toBeInstanceOf(ServiceA);
    });
  });

  describe('identifier types', () => {
    it('supports string identifiers', async () => {
      const c = makeContainer();
      c.register('greeting', { lifetime: 'singleton', factory: () => 'hello' });
      expect(await c.get<string>('greeting')).toBe('hello');
    });

    it('supports symbol identifiers', async () => {
      const c = makeContainer();
      const sym = Symbol('db');
      c.register(sym, { lifetime: 'singleton', factory: () => ({ connected: true }) });
      expect(await c.get<{connected: boolean}>(sym)).toEqual({ connected: true });
    });

    it('supports class constructor identifiers', async () => {
      const c = makeContainer();
      c.register(ServiceB, { lifetime: 'transient', factory: () => new ServiceB() });
      const result = await c.get(ServiceB);
      expect(result).toBeInstanceOf(ServiceB);
      expect(result.value).toBe('b');
    });
  });

});