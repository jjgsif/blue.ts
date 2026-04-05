import type { AuthUser, SessionStore } from "../types.ts";

interface SessionEntry {
    user: AuthUser;
    expiresAt?: number;
}

export class MemorySessionStore implements SessionStore {
    private readonly sessions = new Map<string, SessionEntry>();

    async get(id: string): Promise<AuthUser | null> {
        const entry = this.sessions.get(id);
        if (!entry) return null;

        if (entry.expiresAt !== undefined && Date.now() > entry.expiresAt) {
            this.sessions.delete(id);
            return null;
        }

        return entry.user;
    }

    async set(id: string, user: AuthUser, ttlSeconds?: number): Promise<void> {
        this.sessions.set(id, {
            user,
            expiresAt: ttlSeconds !== undefined ? Date.now() + ttlSeconds * 1000 : undefined,
        });
    }

    async delete(id: string): Promise<void> {
        this.sessions.delete(id);
    }
}