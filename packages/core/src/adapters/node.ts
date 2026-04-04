import {createServer as createHttpServer} from 'node:http';
import {createServer as createHttpsServer} from 'node:https';
import type {IncomingMessage, Server, ServerResponse} from 'node:http';
import {Readable} from 'node:stream';
import type {Adapter, ServeOptions} from '../types.ts';

function toRequest(req: IncomingMessage, secure: boolean): Request {
    const scheme = secure ? 'https' : 'http';
    const host = req.headers.host ?? 'localhost';
    const url = `${scheme}://${host}${req.url ?? '/'}`;

    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
        if (value === undefined) continue;
        if (Array.isArray(value)) {
            for (const v of value) headers.append(key, v);
        } else {
            headers.set(key, value);
        }
    }

    const method = req.method ?? 'GET';
    const hasBody = method !== 'GET' && method !== 'HEAD';

    return new Request(url, {
        method,
        headers,
        body: hasBody ? Readable.toWeb(req) as ReadableStream : null,
        duplex: 'half',
    });
}

async function sendResponse(nodeRes: ServerResponse, res: Response): Promise<void> {
    nodeRes.statusCode = res.status;
    nodeRes.statusMessage = res.statusText;

    for (const [key, value] of res.headers) {
        nodeRes.setHeader(key, value);
    }

    if (res.body) {
        const reader = res.body.getReader();
        while (true) {
            const {done, value} = await reader.read();
            if (done) break;
            nodeRes.write(value);
        }
    }

    nodeRes.end();
}

export class NodeAdapter implements Adapter {
    serve(handler: (req: Request) => Promise<Response>, options: ServeOptions): Server {
        const port = options.port ?? 3000;
        const hostname = options.hostname ?? '127.0.0.1';
        const secure = options.tls !== undefined;

        const requestListener = async (nodeReq: IncomingMessage, nodeRes: ServerResponse) => {
            try {
                const req = toRequest(nodeReq, secure);
                const res = await handler(req);
                await sendResponse(nodeRes, res);
            } catch (err) {
                nodeRes.statusCode = 500;
                nodeRes.end('Internal Server Error');
                console.error(err);
            }
        };

        const server = secure
            ? createHttpsServer(options.tls!, requestListener)
            : createHttpServer(requestListener);

        const scheme = secure ? 'https' : 'http';
        server.listen(port, hostname, () => {
            console.log(`blue.ts listening on ${scheme}://${hostname}:${port}`);
        });

        return server;
    }
}