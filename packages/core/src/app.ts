import {Container} from './container.ts';
import {Context} from './context.ts';
import type {Router} from './router.ts';
import type {
    Adapter,
    FnRouteOptions,
    FunctionHandler,
    GroupBuilder,
    GroupCallback,
    HttpMethod,
    Identifier,
    Middleware,
    Registration,
    RouteImplementation,
    RouteParams,
    ServeOptions
} from './types.ts';
import type {ConfigProvider} from "./providers.ts";
import {BootError, HandlerError} from "./errors";

export class App {
    private readonly middleware: Middleware[] = [];
    private readonly _providers: ConfigProvider[] = [];
    private errorHandler?: (ctx: Context, error: HandlerError) => Promise<Response> | Response;

    constructor(
        private readonly container: Container,
        private readonly router: Router
    ) {
    }

    registerProvider(...providers: ConfigProvider[]): this {
        this._providers.push(...providers);
        for (const provider of providers) provider.registerDependency(this);
        for (const provider of providers) provider.registerRoutes(this);
        return this;
    }

    async boot(): Promise<void> {
        for (const provider of this._providers) {
            try {
                await provider.boot();
            } catch (e) {
                if ((e instanceof BootError && e.isFatal) || !(e instanceof BootError)) {
                    throw e;
                } else {
                    console.log(`[ERROR] Boot Error - Config Provider: ${e.providerName} - ${e.message}`);
                    console.log(`Error Stack: ${e.stack}`);
                }
            }
        }
    }

    use(...middleware: Middleware[]): this {
        this.middleware.push(...middleware);
        for (const middlewareConstructor of middleware) {
            if (!this.container.hasRegistration(middlewareConstructor)) {
                this.container.register(middlewareConstructor, {
                    factory: () => new middlewareConstructor(),
                    lifetime: 'singleton'
                });
            }
        }
        return this;
    }

    group(prefix: string, callback: GroupCallback): this;
    group(prefix: string, middlewares: Middleware[], callback: GroupCallback): this;
    group(prefix: string, middlewaresOrCallback: Middleware[] | GroupCallback, callback?: GroupCallback): this {
        const [middlewares, cb] = typeof middlewaresOrCallback === 'function'
            ? [[] as Middleware[], middlewaresOrCallback]
            : [middlewaresOrCallback, callback!];
        cb(this.makeGroupBuilder(prefix, middlewares));
        return this;
    }

    private makeGroupBuilder(prefix: string, groupMiddlewares: Middleware[]): GroupBuilder {
        const route = (method: HttpMethod, path: string, impl: RouteImplementation) => {
            this.router.route(method, `${prefix}${path}`, {
                ...impl,
                middlewares: [...groupMiddlewares, ...(impl.middlewares ?? [])],
            });
        };

        return {
            route,
            group: (nestedPrefix: string, middlewaresOrCallback: Middleware[] | GroupCallback, callback?: GroupCallback) => {
                const [nestedMiddlewares, cb] = typeof middlewaresOrCallback === 'function'
                    ? [[] as Middleware[], middlewaresOrCallback]
                    : [middlewaresOrCallback, callback!];
                cb(this.makeGroupBuilder(`${prefix}${nestedPrefix}`, [...groupMiddlewares, ...nestedMiddlewares]));
            },
            get: (path, fn, opts) => route('GET', path, {fn, ...opts}),
            post: (path, fn, opts) => route('POST', path, {fn, ...opts}),
            put: (path, fn, opts) => route('PUT', path, {fn, ...opts}),
            patch: (path, fn, opts) => route('PATCH', path, {fn, ...opts}),
            delete: (path, fn, opts) => route('DELETE', path, {fn, ...opts}),
        };
    }

    async fetch(req: Request): Promise<Response> {
        const scoped = this.container.createScope();

        const implementation = this.router.match(req.method as HttpMethod, req.url);

        if (!implementation) {
            return new Response(JSON.stringify({error: "Not Found"}), {
                status: 404,
                headers: new Headers({'Content-Type': 'application/json'})
            })
        }

        const context = new Context(req, implementation.params ?? {}, this.router.generate.bind(this.router));

        try {
            const composedMiddleware = await Promise.all([...this.middleware, ...(implementation.middlewares ?? [])].map(middleware => scoped.get(middleware)));

            let handlerFn: (ctx: Context) => Response | Promise<Response>;
            if ('fn' in implementation) {
                handlerFn = implementation.fn;
            } else {
                const handler = await scoped.get(implementation.handler);
                handlerFn = handler.handle.bind(handler);
            }

            const pipeline = composedMiddleware.reduceRight(
                (next, middleware) => {
                    return (ctx: Context) => middleware.handle(ctx, () => next(ctx));
                }, handlerFn
            );
            return await pipeline(context);
        } catch (e) {
            if (this.errorHandler) {
                const handlerError = new HandlerError(e as Error, context);
                return this.errorHandler(context, handlerError);
            } else {
                console.log(`[ERROR] Error: ${(e as Error).message}`);
                return new Response(JSON.stringify({"error": "Internal Server Error"}), {status: 500});
            }
        }
    };

    get(path: string, fn: FunctionHandler, opts?: FnRouteOptions): this {
        return this.route('GET', path, {fn, ...opts}), this;
    }

    post(path: string, fn: FunctionHandler, opts?: FnRouteOptions): this {
        return this.route('POST', path, {fn, ...opts}), this;
    }

    put(path: string, fn: FunctionHandler, opts?: FnRouteOptions): this {
        return this.route('PUT', path, {fn, ...opts}), this;
    }

    patch(path: string, fn: FunctionHandler, opts?: FnRouteOptions): this {
        return this.route('PATCH', path, {fn, ...opts}), this;
    }

    delete(path: string, fn: FunctionHandler, opts?: FnRouteOptions): this {
        return this.route('DELETE', path, {fn, ...opts}), this;
    }

    url<T extends string = string>(name: string, params?: RouteParams<T>): string {
        return this.router.generate(name, params);
    }

    route(method: HttpMethod, path: string, implementation: RouteImplementation): void {
        if ("handler" in implementation && !this.container.hasRegistration(implementation.handler)) {
            this.container.register(implementation.handler, {
                lifetime: 'transient',
                factory: () => new implementation.handler()
            });

            for (const middleware of implementation.middlewares ?? []) {
                if (!this.container.hasRegistration(middleware)) {
                    this.container.register(middleware, {
                        lifetime: 'transient',
                        factory: () => new middleware()
                    });
                }
            }
        }

        return this.router.route(method, path, implementation);
    }

    registerDependency<T>(identifier: Identifier<T>, registration: Registration<T>): void {
        this.container.register(identifier, registration);
    }

    onError(errorHandler: (ctx: Context, error: HandlerError) => Promise<Response> | Response): App {
        this.errorHandler = errorHandler;
        return this;
    }

    listen(adapter: Adapter, options: ServeOptions = {}): unknown {
        return adapter.serve(this.fetch.bind(this), options);
    }
}