import {describe, it, expect, afterEach} from 'bun:test';
import {mkdtemp, rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {FileTransport} from '../src/transports/file.ts';
import {Logger} from '../src/logger.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

let tmpDir = '';

async function makeTempPath(): Promise<string> {
    tmpDir = await mkdtemp(join(tmpdir(), 'blue-logging-'));
    return join(tmpDir, 'test.log');
}

async function readLines(path: string): Promise<Record<string, unknown>[]> {
    const text = await Bun.file(path).text();
    return text.trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>);
}

afterEach(async () => {
    if (tmpDir) {
        await rm(tmpDir, {recursive: true, force: true});
        tmpDir = '';
    }
});

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FileTransport', () => {

    describe('writing', () => {
        it('writes NDJSON to the file', async () => {
            const path = await makeTempPath();
            const t = new FileTransport({path});
            const logger = new Logger({transports: [t]});

            logger.info('hello');
            await t.close();

            const lines = await readLines(path);
            expect(lines.length).toBe(1);
            expect(lines[0]!['msg']).toBe('hello');
        });

        it('each entry is on its own line', async () => {
            const path = await makeTempPath();
            const t = new FileTransport({path});
            const logger = new Logger({transports: [t]});

            logger.info('one');
            logger.info('two');
            logger.info('three');
            await t.close();

            const lines = await readLines(path);
            expect(lines.length).toBe(3);
        });

        it('entries have the expected pino fields', async () => {
            const path = await makeTempPath();
            const t = new FileTransport({path});
            const logger = new Logger({transports: [t]});

            logger.warn('careful');
            await t.close();

            const [entry] = await readLines(path);
            expect(entry!['level']).toBe(40);   // warn
            expect(typeof entry!['time']).toBe('number');
            expect(entry!['pid']).toBe(process.pid);
            expect(typeof entry!['hostname']).toBe('string');
            expect(entry!['msg']).toBe('careful');
        });

        it('context fields appear in file entries', async () => {
            const path = await makeTempPath();
            const t = new FileTransport({path});
            const logger = new Logger({transports: [t], fields: {service: 'api'}});

            logger.info('start');
            await t.close();

            const [entry] = await readLines(path);
            expect(entry!['service']).toBe('api');
        });
    });

    describe('append mode (default)', () => {
        it('appends to an existing file', async () => {
            const path = await makeTempPath();

            const t1 = new FileTransport({path});
            new Logger({transports: [t1]}).info('first');
            await t1.close();

            const t2 = new FileTransport({path});
            new Logger({transports: [t2]}).info('second');
            await t2.close();

            const lines = await readLines(path);
            expect(lines.length).toBe(2);
            expect(lines[0]!['msg']).toBe('first');
            expect(lines[1]!['msg']).toBe('second');
        });
    });

    describe('truncate mode (append: false)', () => {
        it('truncates an existing file on open', async () => {
            const path = await makeTempPath();

            const t1 = new FileTransport({path});
            new Logger({transports: [t1]}).info('old entry');
            await t1.close();

            const t2 = new FileTransport({path, append: false});
            new Logger({transports: [t2]}).info('new entry');
            await t2.close();

            const lines = await readLines(path);
            expect(lines.length).toBe(1);
            expect(lines[0]!['msg']).toBe('new entry');
        });
    });

    describe('flush()', () => {
        it('resolves without error', async () => {
            const path = await makeTempPath();
            const t = new FileTransport({path});
            new Logger({transports: [t]}).info('hello');
            await expect(t.flush()).resolves.toBeUndefined();
            await t.close();
        });
    });

});