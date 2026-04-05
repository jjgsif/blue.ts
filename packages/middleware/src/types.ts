// Generic schema interface — compatible with Zod, Valibot, ArkType, etc.
// Only requires safeParse() returning a discriminated union.
// For Zod: schema.safeParse(data) is native.
// For Valibot: wrap as { safeParse: (d) => safeParse(MySchema, d) }.

export interface SchemaLike<T> {
    safeParse(
        data: unknown
    ): { success: true; data: T } | {
        success: false;
        error: { issues: Array<{ path: (string | number)[]; message: string }> }
    };
}

// Pluggable store interface for RateLimitMiddleware.
// Implement this to back rate limiting with Redis, a database, etc.
// The in-memory default is provided by the middleware itself.

export interface RateLimitStore {
    increment(key: string, windowMs: number): { count: number; resetMs: number } | Promise<{
        count: number;
        resetMs: number
    }>;
}