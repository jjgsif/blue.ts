import type {Context, Middleware, MiddlewareInterface} from '@blue.ts/core';

export interface CorsOptions {
    /** Allowed origin(s). '*' permits any origin. Pass a function for dynamic logic. */
    origins: string | string[] | ((origin: string) => boolean);
    methods?: string[];
    headers?: string[];
    /** When true the actual request origin is always echoed — '*' is never used. */
    credentials?: boolean;
    /** Max age for preflight cache in seconds. Defaults to 86400 (24 h). */
    maxAge?: number;
}

const DEFAULT_METHODS = ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'];
const DEFAULT_HEADERS = ['Content-Type', 'Authorization'];

/**
 * Factory that returns a Middleware constructor with CORS options baked in.
 * Use this when different routes need different CORS policies.
 *
 * Each call produces a unique class, so each policy can be registered
 * independently in the DI container.
 *
 * @example
 * const PublicCors = cors({ origins: '*' });
 * const AdminCors  = cors({ origins: 'https://admin.example.com', credentials: true });
 *
 * app.registerDependency(PublicCors, { lifetime: 'singleton', factory: () => new (PublicCors as any)() });
 * app.registerDependency(AdminCors,  { lifetime: 'singleton', factory: () => new (AdminCors  as any)() });
 *
 * app.route('GET', '/public', { middlewares: [PublicCors], handler: PublicHandler });
 * app.route('GET', '/admin',  { middlewares: [AdminCors],  handler: AdminHandler  });
 */
export function createCorsMiddleware(options: CorsOptions): Middleware {
    class DynamicCors implements MiddlewareInterface{
        private readonly mw = new CorsMiddleware(options);

        handle(ctx: Context, next: () => Response | Promise<Response>): Response | Promise<Response> {
            return this.mw.handle(ctx, next);
        }
    }

    return DynamicCors;
}

export class CorsMiddleware {
    private readonly origins: CorsOptions['origins'];
    private readonly methods: string[];
    private readonly headers: string[];
    private readonly credentials: boolean;
    private readonly maxAge: number;

    constructor(options: CorsOptions) {
        this.origins = options.origins;
        this.methods = options.methods ?? DEFAULT_METHODS;
        this.headers = options.headers ?? DEFAULT_HEADERS;
        this.credentials = options.credentials ?? false;
        this.maxAge = options.maxAge ?? 86400;
    }

    handle(ctx: Context, next: () => Response | Promise<Response>): Response | Promise<Response> {
        const origin = ctx.req.headers.get('Origin') ?? '';
        const allowed = origin !== '' && this.isOriginAllowed(origin);

        // OPTIONS preflight — always short-circuit, never call next()
        if (ctx.req.method === 'OPTIONS') {
            const res = new Response(null, {status: 204});
            if (allowed) this.applyHeaders(res.headers, origin, true);
            return res;
        }

        // Regular request — call next() then annotate the response
        const downstream = next();
        if (downstream instanceof Promise) {
            return downstream.then(res => {
                if (allowed) this.applyHeaders(res.headers, origin, false);
                return res;
            });
        }
        if (allowed) this.applyHeaders(downstream.headers, origin, false);
        return downstream;
    }

    private isOriginAllowed(origin: string): boolean {
        const {origins} = this;
        if (typeof origins === 'function') return origins(origin);
        if (Array.isArray(origins)) return origins.includes(origin);
        return origins === '*' || origins === origin;
    }

    private applyHeaders(headers: Headers, origin: string, isPreflight: boolean): void {
        // CORS spec: '*' is forbidden when credentials mode is enabled
        const allowOrigin = this.origins === '*' && !this.credentials ? '*' : origin;
        headers.set('Access-Control-Allow-Origin', allowOrigin);

        if (this.credentials) {
            headers.set('Access-Control-Allow-Credentials', 'true');
        }

        if (isPreflight) {
            headers.set('Access-Control-Allow-Methods', this.methods.join(', '));
            headers.set('Access-Control-Allow-Headers', this.headers.join(', '));
            headers.set('Access-Control-Max-Age', String(this.maxAge));
        } else {
            headers.set('Access-Control-Expose-Headers', this.headers.join(', '));
        }
    }
}