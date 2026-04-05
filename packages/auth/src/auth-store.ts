import type { AuthUser } from "./types.ts";

const store = new WeakMap<Request, AuthUser>();

export const setAuthUser = (req: Request, user: AuthUser): void => {
    store.set(req, user);
};

export const getAuthUser = (req: Request): AuthUser | undefined => {
    return store.get(req);
};