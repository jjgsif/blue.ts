import type {Adapter, ServeOptions} from '../types.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const runtime: any = globalThis;

export class DenoAdapter implements Adapter {
    serve(handler: (req: Request) => Promise<Response>, options: ServeOptions): unknown {
        const port = options.port ?? 3000;
        const hostname = options.hostname ?? '0.0.0.0';

        const opts: Record<string, unknown> = {port, hostname, handler};

        if (options.tls) {
            opts.cert = options.tls.cert;
            opts.key = options.tls.key;
        }

        return runtime.Deno.serve(opts);
    }
}