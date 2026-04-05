/**
 * Bun Worker thread for off-main-thread file log writing.
 * Uses node:fs WriteStream — avoids Bun.file issues inside Worker contexts.
 *
 * Protocol:
 *   main → worker  { __init: true, path: string, append: boolean }  — open file (must be first message)
 *   main → worker  { level, time, pid, hostname, msg, ...fields }   — write entry
 *   main → worker  { __flush: true }                                 — flush signal
 *   main → worker  { __close: true }                                 — drain + close
 *   worker → main  { __flushed: true }                               — flush ack
 *   worker → main  { __closed: true }                                — close ack
 */

import {createWriteStream} from 'node:fs';
import type {WriteStream} from 'node:fs';

declare var self: Worker;

let stream: WriteStream | null = null;

self.onmessage = (event: MessageEvent<Record<string, unknown>>) => {
    const data = event.data;

    if (data['__init'] === true) {
        stream = createWriteStream(data['path'] as string, {
            flags: data['append'] !== false ? 'a' : 'w',
            encoding: 'utf8',
        });
        return;
    }

    if (data['__flush'] === true) {
        if (!stream || !stream.writableNeedDrain) {
            self.postMessage({__flushed: true});
        } else {
            stream.once('drain', () => self.postMessage({__flushed: true}));
        }
        return;
    }

    if (data['__close'] === true) {
        if (!stream) {
            self.postMessage({__closed: true});
            return;
        }
        stream.end(() => self.postMessage({__closed: true}));
        return;
    }

    stream?.write(JSON.stringify(data) + '\n');
};