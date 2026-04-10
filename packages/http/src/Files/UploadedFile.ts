import {open, rename, unlink, writeFile} from 'node:fs/promises';

export enum UploadError {
    OK = 0,
    ExceedsMaxSize = 1,
    Partial = 3,
    NoFile = 4,
    IOError = 6,
    ExtensionBlocked = 7,
}

type StorageType = {
    type: "memory";
    file: File;
} | {
    type: "disk";
    path: string;
}

export class UploadedFile {
    private _moved = false;

    private constructor(
        private readonly _storage: StorageType,
        public readonly name: string | null,
        public readonly mediaType: string | null,
        public readonly size: number,
        public readonly error: UploadError
    ) {}

    static fromMemory(file: File): UploadedFile {
        return new UploadedFile(
            { type: "memory", file },
            file.name,
            file.type,
            file.size,
            UploadError.OK
        );
    }

    static fromDisk(path: string, name: string | null, mediaType: string | null, size: number): UploadedFile {
        return new UploadedFile(
            { type: 'disk', path },
            name,
            mediaType,
            size,
            UploadError.OK,
        );
    }

    static failed(error: UploadError): UploadedFile {
        return new UploadedFile(
            { type: 'memory', file: new File([], '') },
            null, null, 0, error,
        );
    }

    getStream(): ReadableStream {
        if (this._moved) throw new Error('Stream is no longer available after moveTo()');
        if (this.error !== UploadError.OK) throw new Error('Cannot stream a failed upload');
        if (this._storage.type === 'memory') {
            return this._storage.file.stream();
        }
        const path = this._storage.path;
        return new ReadableStream({
            async start(controller) {
                const handle = await open(path, 'r');
                const chunkSize = 64 * 1024;
                const buffer = new Uint8Array(chunkSize);
                try {
                    while (true) {
                        const { bytesRead } = await handle.read(buffer, 0, chunkSize);
                        if (bytesRead === 0) break;
                        controller.enqueue(buffer.slice(0, bytesRead));
                    }
                    controller.close();
                } catch (e) {
                    controller.error(e);
                } finally {
                    await handle.close();
                }
            }
        });
    }

    async moveTo(targetPath: string): Promise<void> {
        if (this._moved) throw new Error('File has already been moved');
        if (this.error !== UploadError.OK) throw new Error('Cannot move a failed upload');

        if (this._storage.type === 'disk') {
            await rename(this._storage.path, targetPath);
        } else {
            const buffer = await this._storage.file.arrayBuffer();
            await writeFile(targetPath, new Uint8Array(buffer));
        }

        this._moved = true;
    }

    async dispose(): Promise<void> {
        if (this._storage.type === 'disk' && !this._moved) {
            await unlink(this._storage.path).catch(() => {});
        }
    }
}