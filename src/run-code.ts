import type { RunFileConsoleMessage } from "./run-file";
import {
  closePersistentPage,
  openPersistentPage,
  runCodeInPersistentPage,
} from "./persistent-page";

export type RunCodeOptions = {
  url: string;
  code: string;
  cwd?: string;
  onConsole?(message: RunFileConsoleMessage): Promise<void> | void;
  tmpdir?: string;
};

export async function runCode(options: RunCodeOptions): Promise<void> {
  const { id } = await openPersistentPage({
    headed: false,
    tmpdir: options.tmpdir,
    url: options.url,
  });
  let primaryError: unknown;

  try {
    await runCodeInPersistentPage({
      code: options.code,
      cwd: options.cwd,
      id,
      onConsole: options.onConsole,
      tmpdir: options.tmpdir,
    });
  } catch (error) {
    primaryError = error;
    throw error;
  } finally {
    try {
      await closePersistentPage(id, { tmpdir: options.tmpdir });
    } catch (error) {
      if (!primaryError) {
        throw error;
      }
    }
  }
}
