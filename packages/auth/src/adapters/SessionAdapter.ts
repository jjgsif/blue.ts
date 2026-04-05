import { Adapter } from "./Adapter.ts";
import type { AuthUser, SessionOptions } from "../types.ts";

export class SessionAdapter extends Adapter {
    private readonly cookieName: string;

    constructor(private readonly options: SessionOptions) {
        super();
        this.cookieName = options.cookie ?? 'session';
    }

    async authenticate(request: Request): Promise<AuthUser | null> {
        const cookieHeader = request.headers.get('Cookie');
        if (!cookieHeader) return null;

        const sessionId = this.parseCookie(cookieHeader, this.cookieName);
        if (!sessionId) return null;

        return this.options.store.get(sessionId);
    }

    private parseCookie(header: string, name: string): string | null {
        for (const part of header.split(';')) {
            const [key, value] = part.trim().split('=');
            if (key?.trim() === name && value) {
                return decodeURIComponent(value.trim());
            }
        }
        return null;
    }
}