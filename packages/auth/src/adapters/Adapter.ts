import type { AuthUser } from "../types.ts";

abstract class Adapter {
    abstract authenticate(request: Request): Promise<AuthUser | null>;
}

export {Adapter};