import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface TestTmpdir {
  path: string;
  close(): Promise<void>;
}

export async function createTestTmpdir(): Promise<TestTmpdir> {
  const path = await mkdtemp(join(tmpdir(), "inpagerun-test-"));

  return {
    async close() {
      await rm(path, { force: true, recursive: true });
    },
    path,
  };
}
