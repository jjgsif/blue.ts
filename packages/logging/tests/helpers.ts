import type {Transport, LogEntry} from '../src/types.ts';

/**
 * In-memory transport for testing — captures entries in an array instead of
 * writing to stdout. Useful in your own application tests too.
 */
export class MemoryTransport implements Transport {
    readonly entries: LogEntry[] = [];

    write(entry: LogEntry): void {
        this.entries.push(entry);
    }

    /** Clear captured entries between test cases. */
    clear(): void {
        this.entries.length = 0;
    }

    get last(): LogEntry | undefined {
        return this.entries[this.entries.length - 1];
    }
}