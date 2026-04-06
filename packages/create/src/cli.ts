import * as p from '@clack/prompts';
import { generate } from './generator.js';
import type { UserChoices, Runtime, AuthStrategy } from './types.ts';

export async function run(): Promise<void> {
    p.intro('create-blue — scaffold a new blue.ts project');

    const projectName = await p.text({
        message: 'Project name',
        placeholder: 'my-app',
        defaultValue: 'my-app',
        validate: (v) => {
            if (!v) return 'Project name is required';
            if (!/^[a-z0-9_-]+$/i.test(v)) return 'Use only letters, numbers, hyphens, and underscores';
        },
    });
    if (p.isCancel(projectName)) { p.cancel('Cancelled.'); process.exit(0); }

    const runtime = await p.select({
        message: 'Runtime',
        options: [
            { value: 'bun', label: 'Bun'},
            { value: 'node', label: 'Node.js'},
            { value: 'deno', label: 'Deno'},
        ],
    });
    if (p.isCancel(runtime)) { p.cancel('Cancelled.'); process.exit(0); }

    const selectedPackages = await p.multiselect({
        message: 'Optional packages  (space to toggle, enter to confirm)',
        options: [
            { value: 'auth', label: '@blue.ts/auth'      },
            { value: 'logging', label: '@blue.ts/logging'   },
            { value: 'middleware', label: '@blue.ts/middleware' },
        ],
        required: false,
    });
    if (p.isCancel(selectedPackages)) { p.cancel('Cancelled.'); process.exit(0); }

    const pkgSet = new Set(selectedPackages as string[]);

    let authStrategies: AuthStrategy[] = [];
    if (pkgSet.has('auth')) {
        const selected = await p.multiselect({
            message: 'Auth strategies  (space to toggle, enter to confirm)',
            options: [
                { value: 'jwt',     label: 'JWT'       },
                { value: 'session', label: 'Session'   },
                { value: 'apikey',  label: 'API Key'   },
                { value: 'basic',   label: 'Basic Auth' },
            ],
            required: false,
        });
        if (p.isCancel(selected)) { p.cancel('Cancelled.'); process.exit(0); }
        authStrategies = (selected as string[]) as AuthStrategy[];
        if (authStrategies.length === 0) authStrategies = ['jwt', 'session', 'apikey', 'basic'];
    }

    const choices: UserChoices = {
        projectName: projectName as string,
        runtime:     runtime as Runtime,
        packages: {
            auth:       pkgSet.has('auth'),
            logging:    pkgSet.has('logging'),
            middleware: pkgSet.has('middleware'),
        },
        authStrategies,
    };

    const s = p.spinner();
    s.start('Generating project...');
    await generate(choices);
    s.stop('Done');

    const next = nextSteps(choices.runtime, choices.projectName);
    p.outro(`Project created in ./${choices.projectName}\n\n  ${next}`);
}

function nextSteps(runtime: Runtime, name: string): string {
    if (runtime === 'bun')  return `cd ${name} && bun install && bun run dev`;
    if (runtime === 'node') return `cd ${name} && npm install && npm run dev`;
    return `cd ${name} && deno run --watch --allow-net index.ts`;
}