import {describe, it, expect} from 'bun:test';
import {App} from '@blue.ts/core';
import {Container} from '@blue.ts/core';
import {Router} from '@blue.ts/core';
import {LoggingModule, LoggerToken, RequestLoggerToken} from '../src/provider.ts';
import type {ILogger} from '../src/logger.ts';
import {MemoryTransport} from './helpers.ts';

function makeApp() {
    return new App(new Container(new Map()), new Router());
}

describe('LoggingModule', () => {

    describe('LoggerToken', () => {
        it('registers a singleton Logger', async () => {
            const app = makeApp();
            app.registerProvider(new LoggingModule({transports: [new MemoryTransport()]}));
            const container = (app as unknown as {container: Container}).container;
            const a = await container.get<ILogger>(LoggerToken);
            const b = await container.get<ILogger>(LoggerToken);
            expect(a).toBe(b);
        });

        it('returned logger has info/warn/error methods', async () => {
            const app = makeApp();
            app.registerProvider(new LoggingModule({transports: [new MemoryTransport()]}));
            const container = (app as unknown as {container: Container}).container;
            const logger = await container.get<ILogger>(LoggerToken);
            expect(typeof logger.info).toBe('function');
            expect(typeof logger.warn).toBe('function');
            expect(typeof logger.error).toBe('function');
        });

        it('logger writes to the provided transport', async () => {
            const transport = new MemoryTransport();
            const app = makeApp();
            app.registerProvider(new LoggingModule({transports: [transport]}));
            const container = (app as unknown as {container: Container}).container;
            const logger = await container.get<ILogger>(LoggerToken);
            logger.info('test message');
            expect(transport.entries.length).toBe(1);
            expect(transport.last!.msg).toBe('test message');
        });

        it('static fields from options appear in entries', async () => {
            const transport = new MemoryTransport();
            const app = makeApp();
            app.registerProvider(new LoggingModule({
                transports: [transport],
                fields: {service: 'payments', version: '2.0'},
            }));
            const container = (app as unknown as {container: Container}).container;
            const logger = await container.get<ILogger>(LoggerToken);
            logger.info('hello');
            expect(transport.last!['service']).toBe('payments');
            expect(transport.last!['version']).toBe('2.0');
        });
    });

    describe('RequestLoggerToken', () => {
        it('resolves a logger from a scoped container', async () => {
            const app = makeApp();
            app.registerProvider(new LoggingModule({transports: [new MemoryTransport()]}));
            const container = (app as unknown as {container: Container}).container;
            const scope = container.createScope();
            const logger = await scope.get<ILogger>(RequestLoggerToken);
            expect(typeof logger.info).toBe('function');
        });

        it('each scope gets a different reqId', async () => {
            const transport = new MemoryTransport();
            const app = makeApp();
            app.registerProvider(new LoggingModule({transports: [transport]}));
            const container = (app as unknown as {container: Container}).container;

            const scope1 = container.createScope();
            const scope2 = container.createScope();
            const log1 = await scope1.get<ILogger>(RequestLoggerToken);
            const log2 = await scope2.get<ILogger>(RequestLoggerToken);

            log1.info('req1');
            log2.info('req2');

            const [entry1, entry2] = transport.entries;
            expect(entry1!['reqId']).toBeDefined();
            expect(entry2!['reqId']).toBeDefined();
            expect(entry1!['reqId']).not.toBe(entry2!['reqId']);
        });

        it('same scope resolves the same logger instance', async () => {
            const app = makeApp();
            app.registerProvider(new LoggingModule({transports: [new MemoryTransport()]}));
            const container = (app as unknown as {container: Container}).container;
            const scope = container.createScope();
            const a = await scope.get<ILogger>(RequestLoggerToken);
            const b = await scope.get<ILogger>(RequestLoggerToken);
            expect(a).toBe(b);
        });
    });

});