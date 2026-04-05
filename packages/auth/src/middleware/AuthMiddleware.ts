import { Context } from "@blue.ts/core";
import type { Middleware, MiddlewareInterface } from "@blue.ts/core";
import type { Adapter } from "../adapters/Adapter.ts";
import { setAuthUser } from "../auth-store.ts";

export function createAuthMiddleware(adapter: Adapter): Middleware {
    class AuthMiddleware implements MiddlewareInterface {
        async handle(ctx: Context, next: () => Response | Promise<Response>): Promise<Response> {
            const user = await adapter.authenticate(ctx.req);
            if (!user) {
                return Context.json({ error: 'Unauthorized' }, { status: 401 });
            }
            setAuthUser(ctx.req, user);
            return next();
        }
    }
    return AuthMiddleware as unknown as Middleware;
}