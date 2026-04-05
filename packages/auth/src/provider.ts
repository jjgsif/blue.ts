import { ConfigProvider } from "@blue.ts/core";
import type { App, Middleware } from "@blue.ts/core";
import type { AuthOptions } from "./types.ts";
import { JWTAdapter } from "./adapters/JWTAdapter.ts";
import { SessionAdapter } from "./adapters/SessionAdapter.ts";
import { APIKeyAdapter } from "./adapters/APIKeyAdapter.ts";
import { BasicAuthAdapter } from "./adapters/BasicAuthAdapter.ts";
import { createAuthMiddleware } from "./middleware/AuthMiddleware.ts";

export class AuthProvider extends ConfigProvider {
    private _jwtMiddleware?: Middleware;
    private _sessionMiddleware?: Middleware;
    private _apiKeyMiddleware?: Middleware;
    private _basicMiddleware?: Middleware;

    constructor(private readonly options: AuthOptions) {
        super();
    }

    /**
     * Middleware that authenticates requests via JWT.
     * Apply this to routes or groups that require authentication.
     */
    get jwtMiddleware(): Middleware {
        if (!this._jwtMiddleware) throw new Error('JWT is not configured in AuthProvider');
        return this._jwtMiddleware;
    }

    /**
     * Middleware that authenticates requests via session cookie.
     * Apply this to routes or groups that require authentication.
     */
    get sessionMiddleware(): Middleware {
        if (!this._sessionMiddleware) throw new Error('Session is not configured in AuthProvider');
        return this._sessionMiddleware;
    }

    /**
     * Middleware that authenticates requests via API key header.
     * Apply this to routes or groups that require authentication.
     */
    get apiKeyMiddleware(): Middleware {
        if (!this._apiKeyMiddleware) throw new Error('API key is not configured in AuthProvider');
        return this._apiKeyMiddleware;
    }

    /**
     * Middleware that authenticates requests via HTTP Basic auth.
     * Apply this to routes or groups that require authentication.
     */
    get basicMiddleware(): Middleware {
        if (!this._basicMiddleware) throw new Error('Basic auth is not configured in AuthProvider');
        return this._basicMiddleware;
    }

    override registerDependency(app: App): void {
        if (this.options.jwt) {
            const adapter = new JWTAdapter(this.options.jwt);
            if (this.options.jwt.header) adapter.setHeader(this.options.jwt.header);

            this._jwtMiddleware = createAuthMiddleware(adapter);
            app.registerDependency(this._jwtMiddleware, {
                lifetime: 'singleton',
                factory: () => new this._jwtMiddleware!(),
            });
        }

        if (this.options.session) {
            const adapter = new SessionAdapter(this.options.session);
            this._sessionMiddleware = createAuthMiddleware(adapter);
            app.registerDependency(this._sessionMiddleware, {
                lifetime: 'singleton',
                factory: () => new this._sessionMiddleware!(),
            });
        }

        if (this.options.apiKey) {
            const adapter = new APIKeyAdapter(this.options.apiKey);
            this._apiKeyMiddleware = createAuthMiddleware(adapter);
            app.registerDependency(this._apiKeyMiddleware, {
                lifetime: 'singleton',
                factory: () => new this._apiKeyMiddleware!(),
            });
        }

        if (this.options.basic) {
            const adapter = new BasicAuthAdapter(this.options.basic);
            this._basicMiddleware = createAuthMiddleware(adapter);
            app.registerDependency(this._basicMiddleware, {
                lifetime: 'singleton',
                factory: () => new this._basicMiddleware!(),
            });
        }
    }

    override async boot(): Promise<void> {
        if (!this.options.jwt && !this.options.session && !this.options.apiKey && !this.options.basic) {
            throw new Error('AuthProvider requires at least one auth strategy (jwt, session, apiKey, or basic)');
        }
    }
}