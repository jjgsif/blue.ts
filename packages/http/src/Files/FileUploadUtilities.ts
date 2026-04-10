import {UploadedFile} from "./UploadedFile.ts";
import {join} from "node:path";
import {tmpdir} from "node:os";
import {writeFile} from 'node:fs/promises';

const SPOOL_THRESHOLD = 256 * 1024;

export async function handleUploadedFile(f: File): Promise<UploadedFile> {
    if (f.size > SPOOL_THRESHOLD) {
        const path = join(tmpdir(), `blue-upload-${globalThis.crypto.randomUUID()}`);
        await writeFile(path, new Uint8Array(await f.arrayBuffer()));
        return UploadedFile.fromDisk(path, f.name, f.type, f.size);
    }
    return UploadedFile.fromMemory(f);
}