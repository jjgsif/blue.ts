import {describe, it, expect, beforeEach} from 'bun:test';
import {Logger, type LoggerOptions} from '../src/logger.ts';
import {LOG_LEVEL_VALUES} from '../src/types.ts';
import {MemoryTransport} from './helpers.ts';

// ── Helpers ──────────────────────────────────────────────────────────────────

// @ts-ignore
function makeLogger(opts: { level?: LoggerOptions['level']; fields?: Record<string, unknown> } = {}) {
    const transport = new MemoryTransport();
    const logger = new Logger({transports: [transport], ...opts});
    return {logger, transport};
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Logger', () => {

    describe('pino-compatible entry shape', () => {
        it('entry has numeric level', () => {
            const {logger, transport} = makeLogger();
            logger.info('hello');
            expect(transport.last!.level).toBe(LOG_LEVEL_VALUES['info']); // 30
        });

        it('entry has time as epoch ms', () => {
            const before = Date.now();
            const {logger, transport} = makeLogger();
            logger.info('hello');
            const after = Date.now();
            expect(transport.last!.time).toBeGreaterThanOrEqual(before);
            expect(transport.last!.time).toBeLessThanOrEqual(after);
        });

        it('entry has pid', () => {
            const {logger, transport} = makeLogger();
            logger.info('hello');
            expect(transport.last!.pid).toBe(process.pid);
        });

        it('entry has hostname', () => {
            const {logger, transport} = makeLogger();
            logger.info('hello');
            expect(typeof transport.last!.hostname).toBe('string');
            expect((transport.last!.hostname as string).length).toBeGreaterThan(0);
        });

        it('entry has msg', () => {
            const {logger, transport} = makeLogger();
            logger.info('hello world');
            expect(transport.last!.msg).toBe('hello world');
        });
    });

    describe('log levels', () => {
        it('trace() emits level 10', () => {
            const {logger, transport} = makeLogger({level: 'trace'});
            logger.trace('t');
            expect(transport.last!.level).toBe(10);
        });

        it('debug() emits level 20', () => {
            const {logger, transport} = makeLogger({level: 'debug'});
            logger.debug('d');
            expect(transport.last!.level).toBe(20);
        });

        it('info() emits level 30', () => {
            const {logger, transport} = makeLogger();
            logger.info('i');
            expect(transport.last!.level).toBe(30);
        });

        it('warn() emits level 40', () => {
            const {logger, transport} = makeLogger();
            logger.warn('w');
            expect(transport.last!.level).toBe(40);
        });

        it('error() emits level 50', () => {
            const {logger, transport} = makeLogger();
            logger.error('e');
            expect(transport.last!.level).toBe(50);
        });

        it('fatal() emits level 60', () => {
            const {logger, transport} = makeLogger();
            logger.fatal('f');
            expect(transport.last!.level).toBe(60);
        });
    });

    describe('level filtering', () => {
        it('drops entries below minLevel', () => {
            const {logger, transport} = makeLogger({level: 'warn'});
            logger.debug('nope');
            logger.info('nope');
            expect(transport.entries.length).toBe(0);
        });

        it('emits entries at exactly minLevel', () => {
            const {logger, transport} = makeLogger({level: 'warn'});
            logger.warn('yes');
            expect(transport.entries.length).toBe(1);
        });

        it('emits entries above minLevel', () => {
            const {logger, transport} = makeLogger({level: 'warn'});
            logger.error('yes');
            logger.fatal('yes');
            expect(transport.entries.length).toBe(2);
        });

        it('default minLevel is info — drops trace and debug', () => {
            const {logger, transport} = makeLogger();
            logger.trace('no');
            logger.debug('no');
            logger.info('yes');
            expect(transport.entries.length).toBe(1);
        });
    });

    describe('context fields', () => {
        it('constructor fields appear in every entry', () => {
            const {logger, transport} = makeLogger({fields: {service: 'api', version: '1.0'}});
            logger.info('hello');
            expect(transport.last!['service']).toBe('api');
            expect(transport.last!['version']).toBe('1.0');
        });

        it('per-call fields are merged into entry', () => {
            const {logger, transport} = makeLogger();
            logger.info('click', {userId: 'u1', action: 'buy'});
            expect(transport.last!['userId']).toBe('u1');
            expect(transport.last!['action']).toBe('buy');
        });

        it('per-call fields override constructor fields', () => {
            const {logger, transport} = makeLogger({fields: {env: 'prod'}});
            logger.info('override', {env: 'test'});
            expect(transport.last!['env']).toBe('test');
        });

        it('msg is never shadowed by a field named "msg"', () => {
            const {logger, transport} = makeLogger();
            logger.info('real message', {msg: 'sneaky'});
            expect(transport.last!.msg).toBe('real message');
        });
    });

    describe('child()', () => {
        it('child entries carry parent fields', () => {
            const {logger, transport} = makeLogger({fields: {service: 'api'}});
            const child = logger.child({reqId: 'abc'});
            child.info('hello');
            expect(transport.last!['service']).toBe('api');
            expect(transport.last!['reqId']).toBe('abc');
        });

        it('child fields override parent fields', () => {
            const {logger, transport} = makeLogger({fields: {env: 'prod'}});
            const child = logger.child({env: 'staging'});
            child.info('hello');
            expect(transport.last!['env']).toBe('staging');
        });

        it('parent and child share the same transport', () => {
            const {logger, transport} = makeLogger();
            const child = logger.child({reqId: 'abc'});
            logger.info('parent');
            child.info('child');
            expect(transport.entries.length).toBe(2);
        });

        it('child inherits minLevel from parent', () => {
            const {logger, transport} = makeLogger({level: 'warn'});
            const child = logger.child({reqId: 'abc'});
            child.debug('dropped');
            expect(transport.entries.length).toBe(0);
        });

        it('parent is not affected by child fields', () => {
            const {logger, transport} = makeLogger();
            logger.child({reqId: 'abc'});
            logger.info('parent');
            expect(transport.last!['reqId']).toBeUndefined();
        });

        it('grandchild merges all ancestor fields', () => {
            const {logger, transport} = makeLogger({fields: {service: 'api'}});
            const child = logger.child({reqId: 'abc'});
            const grandchild = child.child({userId: 'u1'});
            grandchild.info('deep');
            expect(transport.last!['service']).toBe('api');
            expect(transport.last!['reqId']).toBe('abc');
            expect(transport.last!['userId']).toBe('u1');
        });
    });

    describe('multiple transports', () => {
        it('writes to all transports', () => {
            const t1 = new MemoryTransport();
            const t2 = new MemoryTransport();
            const logger = new Logger({transports: [t1, t2]});
            logger.info('hello');
            expect(t1.entries.length).toBe(1);
            expect(t2.entries.length).toBe(1);
        });
    });

});