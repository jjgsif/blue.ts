/**
 * Type-safe identifier for container registrations.
 * Prefer Token over Constructor when the class cannot or should not be used as its own key.
 *
 * @example
 * const DB = new Token<Database>("Database");
 * container.register(DB, { lifetime: "singleton", factory: (r) => new Database() });
 * const db = await container.get(DB); // inferred as Database
 */
export class Token<T> {
    declare readonly _type: T; // phantom type — never set at runtime, only used for inference
    constructor(readonly description: string) {}
    toString(): string { return `Token(${this.description})`; }
}

export type Constructor<T> = new (...args: any[]) => T;

/**
 * The resolver passed into every factory. Intentionally narrower than Container —
 * factories should resolve dependencies, not register new ones.
 */
export interface Resolver {
    get<T>(identifier: Identifier<T>): Promise<T>;
    has<T>(identifier: Identifier<T>): boolean;
}

export type Factory<T> = (resolver: Resolver) => T | Promise<T>;

export type ContainerRegistration<T> = ValueRegistration<T> | FactoryRegistration<T>;

export interface ValueRegistration<T> {
    lifetime: "singleton";
    value: T;
    dispose?: (instance: T) => Promise<void> | void;
}

export interface FactoryRegistration<T> {
    lifetime: "singleton" | "scoped" | "transient";
    factory: Factory<T>;
    dispose?: (instance: T) => Promise<void> | void;
}

export type Identifier<T> = Token<T> | Constructor<T>;