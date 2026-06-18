import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export type TestTmpdir = {
  path: string;
  close(): Promise<void>;
};

export async function createTestTmpdir(): Promise<TestTmpdir> {
  const path = await mkdtemp(join(tmpdir(), "inpagerun-test-"));

  return {
    path,
    async close() {
      await rm(path, { force: true, recursive: true });
    },
  };
}
