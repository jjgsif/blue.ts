import { Context } from "@blue.ts/core";
import type { Middleware, MiddlewareInterface } from "@blue.ts/core";
import { getAuthUser } from "../auth-store.ts";

export function requireRole(...roles: string[]): Middleware {
    class RoleGuard implements MiddlewareInterface {
        async handle(ctx: Context, next: () => Response | Promise<Response>): Promise<Response> {
            const user = getAuthUser(ctx.req);
            if (!user) {
                return Context.json({ error: 'Unauthorized' }, { status: 401 });
            }
            const hasRole = roles.some(r => user.roles?.includes(r));
            if (!hasRole) {
                return Context.json({ error: 'Forbidden' }, { status: 403 });
            }
            return next();
        }
    }
    return RoleGuard as unknown as Middleware;
}