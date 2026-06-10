import { Writable } from "node:stream";

export type MemoryWritable = {
  stream: Writable;
  output(): string;
};

export function createMemoryWritable(): MemoryWritable {
  const chunks: Buffer[] = [];

  return {
    stream: new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        callback();
      },
    }),
    output() {
      return Buffer.concat(chunks).toString("utf8");
    },
  };
}
