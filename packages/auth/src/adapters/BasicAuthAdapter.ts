import { Adapter } from "./Adapter.ts";
import type { AuthUser, BasicAuthOptions } from "../types.ts";

class BasicAuthAdapter extends Adapter {
    constructor(private readonly options: BasicAuthOptions) {
        super();
    }

    async authenticate(request: Request): Promise<AuthUser | null> {
        const header = request.headers.get('Authorization') ?? '';
        if (!header.startsWith('Basic ')) return null;

        const decoded = atob(header.slice(6));
        const colonIndex = decoded.indexOf(':');
        if (colonIndex === -1) return null;

        const username = decoded.slice(0, colonIndex);
        const password = decoded.slice(colonIndex + 1);

        return this.options.verify(username, password);
    }
}

export { BasicAuthAdapter };