import type {Context} from '@blue.ts/core';
import {resolve, join, extname, relative, isAbsolute} from 'node:path';

export interface StaticOptions {
    /** Absolute or relative path to the directory to serve from. */
    dir: string;
    /** URL prefix to strip before resolving the file path. e.g. '/static' */
    prefix?: string;
}

const MIME: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.htm': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.webp': 'image/webp',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
    '.pdf': 'application/pdf',
};

export class StaticMiddleware {
    private readonly absDir: string;
    private readonly prefix: string;

    constructor(options: StaticOptions) {
        // Resolve once at construction — avoid repeated syscalls per request
        this.absDir = resolve(options.dir);
        this.prefix = options.prefix ?? '';
    }

    async handle(ctx: Context, next: () => Response | Promise<Response>): Promise<Response> {
        const url = new URL(ctx.req.url);
        let pathname = decodeURIComponent(url.pathname);

        // Strip prefix — pass through immediately if it does not match
        if (this.prefix) {
            if (!pathname.startsWith(this.prefix)) return next();
            pathname = pathname.slice(this.prefix.length) || '/';
        }

        // Remove leading slashes so join() treats the path as relative
        const filePart = pathname.replace(/^\/+/, '');
        const fullPath = resolve(join(this.absDir, filePart));

        // Path traversal prevention — use relative() which is platform-aware.
        // Starts with '..' means the resolved path escapes the base dir.
        // isAbsolute() catches different-drive paths on Windows.
        const rel = relative(this.absDir, fullPath);
        if (rel.startsWith('..') || isAbsolute(rel)) {
            return new Response('Forbidden', {status: 403});
        }

        // Directory root request (rel === '') — pass through
        if (rel === '') return next();

        try {
            if (typeof Bun !== 'undefined') {
                const file = Bun.file(fullPath);
                const exists = await file.exists();
                if (!exists) return next();
                return new Response(file, {
                    headers: {'Content-Type': file.type || this.mimeType(fullPath)},
                });
            }

            // Node.js fallback — dynamic import keeps Bun from loading node:fs/promises
            const {readFile} = await import('node:fs/promises');
            const data = await readFile(fullPath);
            return new Response(data, {
                headers: {'Content-Type': this.mimeType(fullPath)},
            });
        } catch (e: unknown) {
            if (isNodeError(e) && (e.code === 'ENOENT' || e.code === 'EISDIR')) {
                return next();
            }
            throw e;
        }
    }

    private mimeType(filePath: string): string {
        return MIME[extname(filePath).toLowerCase()] ?? 'application/octet-stream';
    }
}

function isNodeError(e: unknown): e is NodeJS.ErrnoException {
    return typeof e === 'object' && e !== null && 'code' in e;
}