import {Context} from '@blue.ts/core';
import type {Middleware} from '@blue.ts/core';
import type {SchemaLike} from './types.ts';

/**
 * Returns a Middleware constructor with the schema baked in via closure.
 *
 * Usage:
 *   const BodyValidator = validate(MyZodSchema);
 *   app.registerDependency(BodyValidator, { lifetime: 'transient', factory: () => new BodyValidator() });
 *   app.post('/users', { middlewares: [BodyValidator], handler: CreateUserHandler });
 *
 * The handler can still call ctx.json() — the body is cached by Context.
 */
export function createValidationMiddleware<T>(schema: SchemaLike<T>): Middleware {
    class ValidationMiddleware {
        async handle(ctx: Context, next: () => Response | Promise<Response>): Promise<Response> {
            let body: unknown;

            try {
                body = await ctx.json();
            } catch {
                return Context.json(
                    {error: 'Invalid JSON', issues: []},
                    {status: 422}
                );
            }

            const result = schema.safeParse(body);

            if (!result.success) {
                return Context.json(
                    {
                        error: 'Validation failed',
                        issues: process.env.NODE_ENV === "production" ? [] : result.error.issues.map(i => ({
                            path: i.path.join('.'),
                            message: i.message,
                        })),
                    },
                    {status: 422}
                );
            }

            return next();
        }
    }

    return ValidationMiddleware as unknown as Middleware;
}