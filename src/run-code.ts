import { bundle } from "./bundle";
import { runFile } from "./run-file";

export type RunCodeOptions = {
  url: string;
  code: string;
  cwd?: string;
};

export async function runCode(options: RunCodeOptions): Promise<unknown> {
  await using artifact = await bundle({ code: options.code, cwd: options.cwd });

  return await runFile({
    file: artifact.file,
    url: options.url,
  });
}
