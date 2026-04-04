import type {Adapter, ServeOptions} from '../types.ts';

export class BunAdapter implements Adapter {
    serve(handler: (req: Request) => Promise<Response>, options: ServeOptions): ReturnType<typeof Bun.serve> {
        const server = Bun.serve({
            port: options.port ?? 3000,
            hostname: options.hostname,
            fetch: handler,
            tls: options.tls,
        });

        const scheme = options.tls ? 'https' : 'http';
        console.log(`blue.ts listening on ${scheme}://${server.hostname}:${server.port}`);
        return server;
    }
}