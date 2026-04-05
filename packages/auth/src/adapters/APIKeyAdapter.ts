import { Adapter } from "./Adapter.ts";
import type { APIKeyOptions, AuthUser } from "../types.ts";

class APIKeyAdapter extends Adapter {
    private readonly keys: Set<string>;
    private readonly header: string;

    constructor(options: APIKeyOptions) {
        super();
        this.keys = options.keys instanceof Set ? options.keys : new Set(options.keys);
        this.header = options.header ?? 'x-api-key';
    }

    async authenticate(request: Request): Promise<AuthUser | null> {
        const key = request.headers.get(this.header);
        if (!key || !this.keys.has(key)) return null;
        return { id: key };
    }
}

export { APIKeyAdapter };