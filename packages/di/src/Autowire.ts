import type {Constructor, Factory, Identifier} from "./types.ts";

export function autowire<T>(constructor: Constructor<T>, dependencies: Identifier<Constructor<T>['arguments']>[]): Factory<T> {
    return async (container) => {
        const resolved = await Promise.all(dependencies.map((id) => container.get(id)));
        return new constructor(...resolved);
    };
}