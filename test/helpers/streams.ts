import { Writable } from "node:stream";

export interface MemoryWritable {
  stream: Writable;
  output(): string;
}

export function createMemoryWritable(): MemoryWritable {
  const chunks: Buffer[] = [];

  return {
    output() {
      return Buffer.concat(chunks).toString("utf8");
    },
    stream: new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
    }),
  };
}
