import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { UserChoices } from './types.js';
import { genPackageJson, genTsConfig, genIndexTs, genAppTs, genHandlerTs } from './templates.js';

export async function generate(choices: UserChoices): Promise<void> {
    const root = join(process.cwd(), choices.projectName);

    await mkdir(join(root, 'src', 'handlers'), { recursive: true });

    await Promise.all([
        writeFile(
            join(root, 'package.json'),
            genPackageJson(choices),
            'utf8'
        ),
        writeFile(
            join(root, 'tsconfig.json'),
            genTsConfig(),
            'utf8'
        ),
        writeFile(
            join(root, 'index.ts'),
            genIndexTs(choices),
            'utf8'
        ),
        writeFile(
            join(root, 'src', 'app.ts'),
            genAppTs(choices),
            'utf8'
        ),
        writeFile(
            join(root, 'src', 'handlers', 'IndexHandler.ts'),
            genHandlerTs(),
            'utf8'
        ),
    ]);
}