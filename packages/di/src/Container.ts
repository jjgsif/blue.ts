import type { ContainerRegistration, FactoryRegistration, Identifier, Resolver } from "./types.ts";
import { Token } from "./types.ts";
import { NotFoundException } from "./Exception/NotFoundException.ts";
import { ContainerException } from "./Exception/ContainerException.ts";

export class Container {
    private readonly instances: Map<Identifier<any>, any> = new Map();
    private readonly resolving: Set<Identifier<any>> = new Set();
    private readonly disposables: Array<() => Promise<void> | void> = [];

    constructor(
        private readonly root?: Container,
        private readonly registry: Map<Identifier<any>, ContainerRegistration<any>> = new Map()
    ) {}

    register<T>(identifier: Identifier<T>, registration: ContainerRegistration<T>): void {
        // Invalidate any cached instance from a previous registration so the new
        // factory is used instead of silently returning the old resolved value
        (this.root?.instances ?? this.instances).delete(identifier);

        this.registry.set(identifier, registration);

        // Value registrations have no factory to hook into, so register their
        // disposer eagerly at registration time
        if ("value" in registration && registration.dispose) {
            (this.root ?? this).disposables.push(() => registration.dispose!(registration.value));
        }
    }

    async get<T>(identifier: Identifier<T>): Promise<T> {
        return this.resolveWithChain(identifier, []);
    }

    private async resolveWithChain<T>(identifier: Identifier<T>, parentChain: Identifier<any>[]): Promise<T> {
        const registration = this.registry.get(identifier) as ContainerRegistration<T> | undefined;

        if (!registration) {
            throw new NotFoundException(getIdentifierString(identifier));
        }

        if (registration.lifetime === "singleton") {
            if ("value" in registration) {
                return registration.value;
            }
            const singletonCache = this.root?.instances ?? this.instances;
            if (singletonCache.has(identifier)) {
                return singletonCache.get(identifier);
            }
        } else if (registration.lifetime === "scoped") {
            if (this.instances.has(identifier)) {
                return this.instances.get(identifier);
            }
        }

        const chain = [...parentChain, identifier];
        const chainStr = () => chain.map(getIdentifierString).join(" → ");

        const resolvingSet = this.root?.resolving ?? this.resolving;
        if (resolvingSet.has(identifier)) {
            throw new ContainerException(
                "Circular dependency detected",
                { identifier: getIdentifierString(identifier), lifetime: registration.lifetime, chain: chainStr() },
                new Error(`Circular dependency: ${chainStr()}`)
            );
        }
        
        resolvingSet.add(identifier);

        const resolver = this.createResolver(chain);
        const factory = (registration as FactoryRegistration<T>).factory;

        let promise: Promise<T>;
        try {
            promise = Promise.resolve(factory(resolver));
        } catch (error) {
            resolvingSet.delete(identifier);
            throw new ContainerException(
                "Error occurred while instantiating service",
                { identifier: getIdentifierString(identifier), lifetime: registration.lifetime, chain: chainStr() },
                error as Error
            );
        }


        if (registration.lifetime === "singleton") {
            const singletonCache = this.root?.instances ?? this.instances;
            singletonCache.set(identifier, promise);
        } else if (registration.lifetime === "scoped") {
            this.instances.set(identifier, promise);
        }

        return promise.then(
            (instance) => {
                resolvingSet.delete(identifier);

                if (registration.lifetime === "singleton") {
                    const singletonCache = this.root?.instances ?? this.instances;
                    singletonCache.set(identifier, instance);
                    if (registration.dispose) {
                        (this.root ?? this).disposables.push(() => registration.dispose!(instance));
                    }
                } else if (registration.lifetime === "scoped") {
                    this.instances.set(identifier, instance);
                    if (registration.dispose) {
                        this.disposables.push(() => registration.dispose!(instance));
                    }
                }

                return instance;
            },
            (error) => {
                resolvingSet.delete(identifier);

                if (registration.lifetime === "singleton") {
                    const singletonCache = this.root?.instances ?? this.instances;
                    singletonCache.delete(identifier);
                } else if (registration.lifetime === "scoped") {
                    this.instances.delete(identifier);
                }

                if (error instanceof ContainerException) throw error;

                throw new ContainerException(
                    "Error occurred while instantiating service",
                    { identifier: getIdentifierString(identifier), lifetime: registration.lifetime, chain: chainStr() },
                    error as Error
                );
            }
        );
    }

    private createResolver(chain: Identifier<any>[]): Resolver {
        return {
            get: (id) => this.resolveWithChain(id, chain),
            has: (id) => this.has(id),
        };
    }

    /**
     * Returns true if an identifier has a registered entry.
     * Note: does not guarantee resolution will succeed — the factory may still throw.
     */
    has<T>(identifier: Identifier<T>): boolean {
        return this.registry.has(identifier);
    }

    public createScope(): Container {
        return new Container(this.root ?? this, new Map(this.registry));
    }

    async dispose(): Promise<void> {
        const disposers = this.disposables.splice(0).reverse();
        const errors: unknown[] = [];

        for (const dispose of disposers) {
            try {
                await dispose();
            } catch (error) {
                errors.push(error);
            }
        }

        if (errors.length > 0) throw new AggregateError(errors, `${errors.length} disposer(s) failed`);
    }

    async [Symbol.asyncDispose](): Promise<void> {
        await this.dispose();
    }
}

function getIdentifierString(identifier: Identifier<any>): string {
    if (identifier instanceof Token) return identifier.toString();
    return identifier.name || "(anonymous)";
}