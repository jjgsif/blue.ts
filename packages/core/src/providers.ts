import type {App} from "./app.ts";

export abstract class ConfigProvider {

    // Registers services into the container.
    // Called before registerRoutes so all services are available when routes are registered.
    registerDependency(app: App): void {}

    // Registers routes onto the router.
    // Called after all providers have registered their dependencies.
    registerRoutes(app: App): void {}

    // Optional async lifecycle — runs after all registrations, before the server starts.
    // Use this to open DB connections, validate config, warm caches, etc.
    async boot(): Promise<void> {}
}