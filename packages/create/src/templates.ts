import type { UserChoices, Runtime, AuthStrategy } from './types.js';

// ── package.json ──────────────────────────────────────────────────────────────

export function genPackageJson(choices: UserChoices): string {
    const { projectName, runtime, packages, authStrategies } = choices;

    const scripts: Record<string, string> = {
        dev: devScript(runtime),
        start: startScript(runtime),
    };

    const dependencies: Record<string, string> = {
        '@blue.ts/core': 'latest',
    };

    if (packages.auth) {
        dependencies['@blue.ts/auth'] = 'latest';
    }
    if (packages.auth && authStrategies.includes('jwt')) {
        dependencies['jose'] = '^6.0.0';

    }
    if (packages.logging) {
        dependencies['@blue.ts/logging'] = 'latest';
    }
    if (packages.middleware) {
        dependencies['@blue.ts/middleware'] = 'latest';
    }
    if (runtime === 'node') {
        dependencies['tsx'] = 'latest';
    }

    const devDependencies: Record<string, string> = {
        typescript: '^5',
    };
    if (runtime === 'bun') {
        devDependencies['@types/bun'] = 'latest';
    }
    if (runtime === 'node') {
        devDependencies['@types/node'] = 'latest';
    }

    return JSON.stringify(
        { 
            name: projectName, 
            version: '0.1.0', 
            type: 'module', 
            scripts, 
            dependencies, 
            devDependencies 
        },
        null,
        2
    );
}

function devScript(runtime: Runtime): string {
    if (runtime === 'bun') {
        return 'bun run --watch index.ts';
    }
    if (runtime === 'node') {
        return 'npx tsx --watch index.ts';
    }
    return 'deno run --watch --allow-net index.ts';
}

function startScript(runtime: Runtime): string {
    if (runtime === 'bun') {
        return 'bun run index.ts';
    }
    if (runtime === 'node') {
        return 'npx tsx index.ts';
    }
    return 'deno run --allow-net index.ts';
}

// ── tsconfig.json ─────────────────────────────────────────────────────────────

export function genTsConfig(): string {
    return JSON.stringify(
        {
            compilerOptions: {
                lib: ['ESNext'],
                target: 'ESNext',
                module: 'Preserve',
                moduleDetection: 'force',
                allowJs: true,
                moduleResolution: 'bundler',
                allowImportingTsExtensions: true,
                verbatimModuleSyntax: true,
                noEmit: true,
                strict: true,
                skipLibCheck: true,
                noFallthroughCasesInSwitch: true,
                noUncheckedIndexedAccess: true,
                noImplicitOverride: true,
            },
        },
        null,
        2
    );
}

// ── index.ts ──────────────────────────────────────────────────────────────────

export function genIndexTs(choices: UserChoices): string {
    const adapters: Record<Runtime, { name: string; expr: string }> = {
        bun: {
            name: 'BunAdapter',
            expr: 'new BunAdapter()'
        },
        node: {
            name: 'NodeAdapter',
            expr: 'new NodeAdapter()'
        },
        deno: {
            name: 'DenoAdapter',
            expr: 'new DenoAdapter()'
        },
    };

    const { name, expr } = adapters[choices.runtime];

    return `import { ${name} } from '@blue.ts/core';
import { app } from './src/app.ts';

const PORT = 3000;

await app.boot();
app.listen(${expr}, { port: PORT });
`;
}

// ── src/handlers/IndexHandler.ts ──────────────────────────────────────────────

export function genHandlerTs(): string {
    return `import type { HandlerInterface } from '@blue.ts/core';
import type { Context } from '@blue.ts/core';

export class IndexHandler implements HandlerInterface {
    handle(_ctx: Context): Response {
        return Response.json({ message: 'Welcome to blue.ts' });
    }
}
`;
}

// ── src/app.ts ────────────────────────────────────────────────────────────────

export function genAppTs(choices: UserChoices): string {
    const { packages, authStrategies } = choices;
    const lines: string[] = [];

    // Imports
    lines.push(`import { App, Container, Router, Context } from '@blue.ts/core';`);
    lines.push(`import { IndexHandler } from './handlers/IndexHandler.ts';`);

    if (packages.auth) {
        const imports = ['AuthProvider'];
        if (authStrategies.includes('session')) imports.push('MemorySessionStore');
        lines.push(`import { ${imports.join(', ')} } from '@blue.ts/auth';`);
    }
    if (packages.logging) {
        lines.push(`import { LoggingModule, ConsoleTransport } from '@blue.ts/logging';`);
    }
    if (packages.middleware) {
        lines.push(`import { createCorsMiddleware } from '@blue.ts/middleware';`);
    }

    lines.push('');

    // App bootstrap
    lines.push(`export const app = new App(new Container(new Map()), new Router());`);
    lines.push('');

    // Logging
    if (packages.logging) {
        lines.push(`app.registerProvider(new LoggingModule({ transports: [new ConsoleTransport()] }));`);
        lines.push('');
    }

    // CORS
    if (packages.middleware) {
        lines.push(`const Cors = createCorsMiddleware({ origins: '*' });`);
        lines.push(`app.use(Cors);`);
        lines.push('');
    }

    // Auth
    if (packages.auth) {
        if (authStrategies.includes('session')) {
            lines.push(`const sessionStore = new MemorySessionStore();`);
            lines.push('');
        }

        lines.push(`const auth = new AuthProvider({`);

        if (authStrategies.includes('jwt')) {
            lines.push(`    jwt: {`);
            lines.push(`        // url: 'https://your-auth-server/.well-known/jwks.json',`);
            lines.push(`        // keys: [/* your JWK key objects */],`);
            lines.push(`        issuer: '${choices.projectName}',`);
            lines.push(`        audience: '${choices.projectName}-api',`);
            lines.push(`    },`);
        }

        if (authStrategies.includes('session')) {
            lines.push(`    session: {`);
            lines.push(`        store: sessionStore,`);
            lines.push(`        cookie: 'sid',`);
            lines.push(`    },`);
        }

        if (authStrategies.includes('apikey')) {
            lines.push(`    apiKey: {`);
            lines.push(`        keys: ['your-api-key-here'],`);
            lines.push(`    },`);
        }

        if (authStrategies.includes('basic')) {
            lines.push(`    basic: {`);
            lines.push(`        verify: async (_username, _password) => {`);
            lines.push(`            // TODO: look up user in database and verify password`);
            lines.push(`            return null;`);
            lines.push(`        },`);
            lines.push(`    },`);
        }

        lines.push(`});`);
        lines.push('');
        lines.push(`app.registerProvider(auth);`);
        lines.push('');
    }

    // Routes
    lines.push(`// Health check`);
    lines.push(`app.get('/health', () => Context.json({ status: 'ok' }));`);
    lines.push('');
    lines.push(`// Index — class-based handler`);
    lines.push(`app.route('GET', '/', { handler: IndexHandler });`);

    // Protected example
    if (packages.auth && authStrategies.length > 0) {
        const strategy = authStrategies[0] as AuthStrategy;
        const prop = middlewareProp(strategy);
        lines.push('');
        lines.push(`// Protected route example — requires ${strategy} auth`);
        lines.push(`app.group('/protected', [auth.${prop}], (r) => {`);
        lines.push(`    r.get('/me', (_ctx) => Context.json({ message: 'Authenticated!' }));`);
        lines.push(`});`);
    }

    lines.push('');
    return lines.join('\n');
}

function middlewareProp(strategy: AuthStrategy): string {
    const map: Record<AuthStrategy, string> = {
        jwt:     'jwtMiddleware',
        session: 'sessionMiddleware',
        apikey:  'apiKeyMiddleware',
        basic:   'basicMiddleware',
    };
    return map[strategy];
}