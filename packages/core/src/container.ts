import type { Identifier, Registration } from './types.ts';

export class Container {
  private readonly cache: Map<Identifier<unknown>, Promise<unknown>>;

  constructor(
    private readonly registry: Map<Identifier<unknown>, Registration<unknown>>,
    private readonly _root?: Container,
    // Tracks the identifier chain currently being resolved — used for cycle detection.
    // Shared across withChain() copies so the chain threads through factory calls.
    private readonly _chain: Identifier<unknown>[] = [],
    cache?: Map<Identifier<unknown>, Promise<unknown>>
  ) {
    this.cache = cache ?? new Map();
  }

  async get<T>(identifier: Identifier<T>): Promise<T> {
    // Cycle detection — if this identifier is already in the current resolution chain,
    // a factory is (directly or indirectly) requesting its own dependency.
    if (this._chain.includes(identifier as Identifier<unknown>)) {
      const path = [...this._chain, identifier].map(formatId).join(' → ');
      throw new Error(`Circular dependency detected: ${path}`);
    }

    const reg = this.findRegistration(identifier);

    if (reg === undefined) {
      throw new Error(`No registration found for identifier: ${String(identifier)}. Dependency must be configured using App.registerDependency()`);
    }

    // Extend the chain for any factory calls that happen during this resolution
    const nextChain = [...this._chain, identifier as Identifier<unknown>];

    if (reg.lifetime === 'singleton') {
      const root = this.root();

      const cached = root.cache.get(identifier as Identifier<unknown>);
      if (cached !== undefined) return cached as Promise<T>;

      if (reg.value !== undefined) {
        const promise = Promise.resolve(reg.value as T);
        root.cache.set(identifier as Identifier<unknown>, promise);
        return promise;
      }

      // Pass a chain-aware root to the factory so nested get() calls carry the chain
      const promise = Promise.resolve(reg.factory(root.withChain(nextChain))) as Promise<T>;
      root.cache.set(identifier as Identifier<unknown>, promise);
      return promise;
    }

    if (reg.lifetime === 'scoped') {
      const cached = this.cache.get(identifier as Identifier<unknown>);
      if (cached !== undefined) return cached as Promise<T>;

      const promise = Promise.resolve(reg.factory(this.withChain(nextChain))) as Promise<T>;
      this.cache.set(identifier as Identifier<unknown>, promise);
      return promise;
    }

    // transient: fresh instance, chain still propagated
    return Promise.resolve(reg.factory(this.withChain(nextChain))) as Promise<T>;
  }

  /**
   * Warning: Registering to a scoped container will register to the root.
   * Containers share the same registry to save on memory and by convention.
   */
  register<T>(identifier: Identifier<T>, registration: Registration<T>): void {
    this.registry.set(
      identifier as Identifier<unknown>,
      registration as Registration<unknown>
    );
  }

  createScope(): Container {
    // New scope starts with a fresh chain — per-request resolution is independent
    return new Container(new Map(), this);
  }

  // Returns a Container that shares all state (registry, root, cache) but carries
  // an extended resolution chain. Used to thread cycle detection through factory calls.
  private withChain(chain: Identifier<unknown>[]): Container {
    return new Container(this.registry, this.root(), chain, this.cache);
  }

  private findRegistration<T>(identifier: Identifier<T>): Registration<T> | undefined {
    return (
      this.registry.get(identifier as Identifier<unknown>) ??
      this.root()?.findRegistration(identifier)
    ) as Registration<T> | undefined;
  }

  private root(): Container {
    return this._root ? this._root.root() : this;
  }
}

function formatId(id: Identifier<unknown>): string {
  if (typeof id === 'function') return id.name || '<anonymous class>';
  if (typeof id === 'symbol') return id.description ? `Symbol(${id.description})` : 'Symbol';
  return String(id);
}