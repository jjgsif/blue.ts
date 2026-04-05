import { createRemoteJWKSet, importJWK, jwtVerify, type CryptoKey } from "jose";
import { Adapter } from "./Adapter.ts";
import type { AuthUser, JWTOptions } from "../types.ts";

type KeyLike = CryptoKey | Uint8Array<ArrayBufferLike>;

class JWTAdapter extends Adapter {
    private header: string = 'Authorization';
    private jwks: ReturnType<typeof createRemoteJWKSet> | null = null;
    private staticKeys: KeyLike[] | null = null;

    constructor(private readonly jwtOptions: JWTOptions) {
        super();
    }

    setHeader(header: string): void {
        this.header = header;
    }

    private async getKeys(): Promise<ReturnType<typeof createRemoteJWKSet> | KeyLike[]> {
        if (this.jwtOptions.url) {
            if (!this.jwks) {
                this.jwks = createRemoteJWKSet(new URL(this.jwtOptions.url));
            }
            return this.jwks;
        }

        if (this.jwtOptions.keys) {
            if (!this.staticKeys) {
                this.staticKeys = await Promise.all(
                    this.jwtOptions.keys.map(k => importJWK(k) as Promise<KeyLike>)
                );
            }
            return this.staticKeys!;
        }

        throw new Error('JWTAdapter requires either `url` or `keys` in JWTOptions');
    }

    async authenticate(request: Request): Promise<AuthUser | null> {
        const headerValue = request.headers.get(this.header);
        if (!headerValue) return null;

        const token = headerValue.startsWith('Bearer ')
            ? headerValue.slice(7)
            : headerValue;

        if (!token) return null;

        try {
            const keys = await this.getKeys();
            const verifyOptions = {
                issuer: this.jwtOptions.issuer,
                audience: this.jwtOptions.audience,
            };

            if (Array.isArray(keys)) {
                for (const key of keys) {
                    try {
                        const { payload } = await jwtVerify(token, key, verifyOptions);
                        const sub = payload.sub ?? (payload as Record<string, unknown>)['id'];
                        return {
                            id: typeof sub === 'string' ? sub : String(sub ?? 'unknown'),
                            roles: Array.isArray(payload['roles']) ? payload['roles'] as string[] : undefined,
                            ...payload,
                        };
                    } catch {
                        // try next key
                    }
                }
                return null;
            }

            const { payload } = await jwtVerify(token, keys, verifyOptions);
            const sub = payload.sub ?? (payload as Record<string, unknown>)['id'];
            return {
                id: typeof sub === 'string' ? sub : String(sub ?? 'unknown'),
                roles: Array.isArray(payload['roles']) ? payload['roles'] as string[] : undefined,
                ...payload,
            };
        } catch {
            return null;
        }
    }
}

export { JWTAdapter };