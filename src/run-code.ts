import type { RunFileConsoleMessage } from "./run-file";
import { closeSession, openSession, runCodeInSession } from "./session";

export interface RunCodeOptions {
  url: string;
  code: string;
  cwd?: string;
  onConsole?: (message: RunFileConsoleMessage) => Promise<void> | void;
  tmpdir?: string;
}

export async function runCode(options: RunCodeOptions): Promise<void> {
  const { id } = await openSession({
    headed: false,
    tmpdir: options.tmpdir,
    url: options.url,
  });
  let primaryError: unknown;

  try {
    await runCodeInSession({
      code: options.code,
      cwd: options.cwd,
      id,
      onConsole: options.onConsole,
      tmpdir: options.tmpdir,
    });
  } catch (error) {
    primaryError = error;
  }

  try {
    await closeSession(id, { tmpdir: options.tmpdir });
  } catch (error) {
    if (!primaryError) {
      primaryError = error;
    }
  }

  if (primaryError) {
    throw primaryError;
  }
}
