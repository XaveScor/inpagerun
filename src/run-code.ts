import type { RunFileConsoleMessage } from "./run-file";
import { bundle } from "./bundle";
import { runFile } from "./run-file";

export type RunCodeOptions = {
  url: string;
  code: string;
  cwd?: string;
  onConsole?(message: RunFileConsoleMessage): Promise<void> | void;
};

export async function runCode(options: RunCodeOptions): Promise<void> {
  await using artifact = await bundle({ code: options.code, cwd: options.cwd });

  return await runFile({
    file: artifact.file,
    onConsole: options.onConsole,
    url: options.url,
  });
}
