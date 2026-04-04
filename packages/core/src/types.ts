import type {Container} from './container.ts';
import type {Context} from './context.ts';
import type {Serve} from "bun";

export type Identifier<T> = symbol | string | (new (...args: any[]) => T);

export type Registration<T> =
    | {
    lifetime: 'singleton',
    value?: T,
    factory: (c: Container) => T | Promise<T>,
} | {
    lifetime: 'scoped',
    factory: (c: Container) => T | Promise<T>,
} | {
    lifetime: 'transient',
    factory: (c: Container) => T | Promise<T>,
};

export interface HandlerInterface {
    handle(ctx: Context): Response | Promise<Response>;
}

export type Handler = new(...args: any[]) => HandlerInterface;

export interface MiddlewareInterface {
    handle(ctx: Context, next: () => Response | Promise<Response>): Response | Promise<Response>;
}

export type Middleware = new(...args: any[]) => MiddlewareInterface;

export type RouteParams<T extends string = string> = { [Key in keyof Serve.ExtractRouteParams<T>]: string };

export type FunctionHandler = (ctx: Context) => Response | Promise<Response>;

export type RouteCommon = { name?: string; middlewares?: readonly Middleware[] };

export type RouteImplementation =
    | (RouteCommon & { handler: Handler })
    | (RouteCommon & { fn: FunctionHandler });

export type FnRouteOptions = { name?: string; middlewares?: readonly Middleware[] };

export interface GroupBuilder {
    route(method: HttpMethod, path: string, implementation: RouteImplementation): void;

    group(prefix: string, callback: GroupCallback): void;

    group(prefix: string, middlewares: Middleware[], callback: GroupCallback): void;

    get(path: string, fn: FunctionHandler, opts?: FnRouteOptions): void;

    post(path: string, fn: FunctionHandler, opts?: FnRouteOptions): void;

    put(path: string, fn: FunctionHandler, opts?: FnRouteOptions): void;

    patch(path: string, fn: FunctionHandler, opts?: FnRouteOptions): void;

    delete(path: string, fn: FunctionHandler, opts?: FnRouteOptions): void;
}

export type GroupCallback = (r: GroupBuilder) => void;

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'OPTIONS' | 'HEAD';

export interface TlsOptions {
    /** PEM-encoded private key */
    key: string;
    /** PEM-encoded certificate */
    cert: string;
    /** PEM-encoded CA certificate(s) — for mutual TLS / client cert validation */
    ca?: string | string[];
    /** Passphrase for an encrypted private key */
    passphrase?: string;
}

export interface ServeOptions {
    port?: number;
    hostname?: string;
    tls?: TlsOptions;
}

export interface Adapter {
    serve(handler: (req: Request) => Promise<Response>, options: ServeOptions): unknown;
}