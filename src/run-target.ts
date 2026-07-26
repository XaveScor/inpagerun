import { bundle } from "./bundle";
import { type RunFileConsoleMessage, createRunFileCallbackNames, runFileInPage } from "./run-file";
import type { Page } from "playwright";

export interface RunTargetOptions {
  code: string;
  cwd?: string;
  onConsole?(message: RunFileConsoleMessage): Promise<void> | void;
  page: Page;
}

export async function runTarget(options: RunTargetOptions): Promise<void> {
  const callbackNames = createRunFileCallbackNames();
  await using artifact = await bundle({
    code: options.code,
    consoleFunctionName: callbackNames.consoleFunctionName,
    cwd: options.cwd,
    doneFunctionName: callbackNames.doneFunctionName,
  });

  await runFileInPage({
    callbackNames,
    file: artifact.file,
    onConsole: options.onConsole,
    page: options.page,
  });
}
