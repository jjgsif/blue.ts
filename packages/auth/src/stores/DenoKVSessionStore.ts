import type { AuthUser, SessionStore } from "../types.ts";

// Deno.Kv is only available on Deno / Deno Deploy.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type DenoKv = any;

/**
 * Session store backed by Deno KV. Suitable for Deno Deploy where
 * MemorySessionStore would not persist across isolate instances.
 *
 * @example
 * import { DenoKVSessionStore, AuthProvider } from '@blue.ts/auth';
 *
 * const auth = new AuthProvider({
 *     session: { store: new DenoKVSessionStore(), cookie: 'sid' },
 * });
 */
export class DenoKVSessionStore implements SessionStore {
    private kv: DenoKv | null = null;

    private async getKv(): Promise<DenoKv> {
        if (!this.kv) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const Deno = (globalThis as any).Deno;
            if (!Deno?.openKv) {
                throw new Error('DenoKVSessionStore requires the Deno runtime with KV access.');
            }
            this.kv = await Deno.openKv();
        }
        return this.kv;
    }

    async get(id: string): Promise<AuthUser | null> {
        const kv = await this.getKv();
        const result = await kv.get(['sessions', id]);
        return result.value as AuthUser | null;
    }

    async set(id: string, user: AuthUser, ttlSeconds = 3600): Promise<void> {
        const kv = await this.getKv();
        await kv.set(['sessions', id], user, { expireIn: ttlSeconds * 1000 });
    }

    async delete(id: string): Promise<void> {
        const kv = await this.getKv();
        await kv.delete(['sessions', id]);
    }
}