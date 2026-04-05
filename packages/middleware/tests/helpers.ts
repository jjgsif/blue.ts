import {Context} from '@blue.ts/core';

export interface MakeCtxOptions {
    url?: string;
    method?: string;
    body?: string | null;
    headers?: Record<string, string>;
    params?: Record<string, string>;
}

/** Build a Context for middleware tests — no App, Container, or Router needed. */
export function makeCtx(options: MakeCtxOptions = {}): Context {
    const headers = new Headers(options.headers);

    const req = new Request(options.url ?? 'http://localhost/', {
        method: options.method ?? 'GET',
        headers,
        body: options.body ?? null,
    });

    // generateUrl is unused by middleware — stub throws if accidentally called
    const noopGenerate = (_name: string) => {
        throw new Error('generateUrl is not available in middleware tests');
    };
    return new Context(req, options.params ?? {}, noopGenerate);
}

/** Call middleware.handle() and always return a Promise<Response>. */
export function callMw(
    middleware: { handle(ctx: Context, next: () => Response | Promise<Response>): Response | Promise<Response> },
    ctx: Context,
    next: () => Response | Promise<Response> = () => new Response('ok', {status: 200}),
): Promise<Response> {
    return Promise.resolve(middleware.handle(ctx, next));
}