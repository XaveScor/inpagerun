import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export interface TestTmpdir {
  path: string;
  close: () => Promise<void>;
}

export async function createTestTmpdir(): Promise<TestTmpdir> {
  const dirPath = await mkdtemp(path.join(tmpdir(), "inpagerun-test-"));

  return {
    async close() {
      await rm(dirPath, { force: true, recursive: true });
    },
    path: dirPath,
  };
}
