import {Container} from './container.ts';
import {Context} from './context.ts';
import type {Router} from './router.ts';
import type {
    Adapter,
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
        return {
            route: (method, path, impl) => {
                this.router.route(method, `${prefix}${path}`, {
                    ...impl,
                    middlewares: [...groupMiddlewares, ...(impl.middlewares ?? [])],
                });
            },
            group: (nestedPrefix: string, middlewaresOrCallback: Middleware[] | GroupCallback, callback?: GroupCallback) => {
                const [nestedMiddlewares, cb] = typeof middlewaresOrCallback === 'function'
                    ? [[] as Middleware[], middlewaresOrCallback]
                    : [middlewaresOrCallback, callback!];
                cb(this.makeGroupBuilder(`${prefix}${nestedPrefix}`, [...groupMiddlewares, ...nestedMiddlewares]));
            },
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
            const handler = await scoped.get(implementation.handler);

            const pipeline = composedMiddleware.reduceRight(
                (next, middleware) => {
                 return (ctx: Context) => middleware.handle(ctx, () => next(ctx));
                }, handler.handle.bind(handler)
            );
            return await pipeline(context);
        } catch (e) {
            if (this.errorHandler) {
                const handlerError = new HandlerError(e as Error, context);
                return this.errorHandler(context, handlerError);
            } else {
                console.log(`[ERROR] Error: ${(e as Error).message}`);
                return new Response(JSON.stringify({ "error": "Internal Server Error" }), {status: 500});
            }
        }
    };

    url<T extends string = string>(name: string, params?: RouteParams<T>): string
    {
        return this.router.generate(name, params);
    }

    route(method: HttpMethod, path: string, implementation: RouteImplementation): void
    {
        return this.router.route(method, path, implementation);
    }

    registerDependency<T>(identifier: Identifier<T>, registration: Registration<T>): void {
        this.container.register(identifier, registration);
    }

    onError(errorHandler: (ctx: Context, error: HandlerError) => Promise<Response> | Response): App
    {
        this.errorHandler = errorHandler;
        return this;
    }

    listen(adapter: Adapter, options: ServeOptions = {}): unknown {
        return adapter.serve(this.fetch.bind(this), options);
    }
}