/**
 * Bun Worker thread for off-main-thread log writing.
 *
 * Protocol:
 *   main → worker  { level, time, pid, hostname, msg, ...fields }  — write entry
 *   main → worker  { __flush: true }                                — flush signal
 *   worker → main  { __flushed: true }                              — flush ack
 *
 * Because postMessage delivers messages in order, all log entries queued before
 * a __flush signal are guaranteed to be written before the ack is sent back.
 */

declare var self: Worker;

interface FlushSignal {
    __flush: true;
}

self.onmessage = (event: MessageEvent<Record<string, unknown>>) => {
    const data = event.data;

    if (data['__flush'] === true) {
        // All prior entries have already been processed (message order is FIFO).
        // Acknowledge so the main thread knows it's safe to close.
        self.postMessage({__flushed: true});
        return;
    }

    // Structured clone produces a plain object — just serialize and write.
    process.stdout.write(JSON.stringify(data) + '\n');
};