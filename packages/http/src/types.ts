export type Constructor<T> = new (...args: any[]) => T;
export type Identifier<T> = Constructor<T> | symbol | string;