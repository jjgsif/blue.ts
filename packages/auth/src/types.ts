import type { JWK } from "jose"

interface AuthUser {
    id: string;
    roles?: string[];
    [claim: string]: unknown;
}

interface JWKey extends JWK {
    alg: string;
}

interface JWTOptions {
    url?: string;
    keys?: JWKey[];
    issuer?: string;
    audience?: string;
    /** Header to read the token from. Defaults to 'Authorization' (Bearer). */
    header?: string;
}

interface SessionStore {
    get(id: string): Promise<AuthUser | null>;
    set(id: string, user: AuthUser, ttlSeconds?: number): Promise<void>;
    delete(id: string): Promise<void>;
}

interface SessionOptions {
    store: SessionStore;
    /** Cookie name to read the session ID from. Defaults to 'session'. */
    cookie?: string;
}

interface APIKeyOptions {
    keys: string[] | Set<string>;
    /** Header to read the API key from. Defaults to 'x-api-key'. */
    header?: string;
}

interface BasicAuthOptions {
    verify: (username: string, password: string) => Promise<AuthUser | null>;
}

interface AuthOptions {
    jwt?: JWTOptions;
    session?: SessionOptions;
    apiKey?: APIKeyOptions;
    basic?: BasicAuthOptions;
}

export type {
    AuthOptions,
    AuthUser,
    APIKeyOptions,
    BasicAuthOptions,
    JWTOptions,
    SessionOptions,
    SessionStore,
};
