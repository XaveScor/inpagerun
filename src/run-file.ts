import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { type Page, chromium } from "playwright";
import { normalizePageUrl } from "./url";

export interface RunFileConsoleMessage {
  type: string;
  text: string;
}

export interface RunFileOptions {
  url: string;
  file: string;
  callbackNames?: RunFileCallbackNames;
  onConsole?(message: RunFileConsoleMessage): Promise<void> | void;
}

export interface RunFileInPageOptions {
  page: Page;
  file: string;
  callbackNames?: RunFileCallbackNames;
  onConsole?(message: RunFileConsoleMessage): Promise<void> | void;
}

export interface RunFileCallbackNames {
  consoleFunctionName: string;
  doneFunctionName: string;
}

interface RunFileError {
  name: string;
  message: string;
  stack?: string;
}

type RunFileResult<TValue = unknown> =
  | {
      ok: true;
      value?: TValue;
    }
  | {
      ok: false;
      error: RunFileError;
    };

export async function runFile(options: RunFileOptions): Promise<void> {
  const browser = await chromium.launch();

  await using browserHandle = {
    async [Symbol.asyncDispose]() {
      await browser.close();
    },
  };

  const page = await browser.newPage({ bypassCSP: true });
  void browserHandle;

  await page.goto(normalizePageUrl(options.url), { waitUntil: "load" });

  return await runFileInPage({
    callbackNames: options.callbackNames,
    file: options.file,
    onConsole: options.onConsole,
    page,
  });
}

export async function runFileInPage<TValue = void>(options: RunFileInPageOptions): Promise<TValue> {
  const callbackNames = options.callbackNames ?? createRunFileCallbackNames();

  const result = await new Promise<RunFileResult<TValue>>(async (resolve, reject) => {
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      callback();
    };

    try {
      await options.page.exposeFunction(
        callbackNames.doneFunctionName,
        async (payload: RunFileResult<TValue>) => {
          finish(() => resolve(payload));
        },
      );

      await options.page.exposeFunction(
        callbackNames.consoleFunctionName,
        async (message: RunFileConsoleMessage) => {
          await options.onConsole?.(message);
        },
      );

      await evaluateFileInPage(options.page, options.file);
    } catch (error) {
      finish(() => reject(error));
    }
  });

  if (!result.ok) {
    throw createRunFileError(result.error);
  }

  return result.value as TValue;
}

export function createRunFileCallbackNames(): RunFileCallbackNames {
  const runId = randomUUID().replaceAll("-", "_");

  return {
    consoleFunctionName: `__inpagerunConsole_${runId}`,
    doneFunctionName: `__inpagerunDone_${runId}`,
  };
}

async function evaluateFileInPage(page: Page, file: string): Promise<void> {
  const session = await page.context().newCDPSession(page);

  try {
    const result = (await session.send("Runtime.evaluate", {
      awaitPromise: false,
      expression: await readFile(file, "utf8"),
      userGesture: true,
    })) as { exceptionDetails?: { exception?: { description?: string }; text?: string } };

    if (result.exceptionDetails) {
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.text ??
          "Failed to evaluate bundled code.",
      );
    }
  } finally {
    await session.detach().catch(() => {});
  }
}

function createRunFileError(error: RunFileError): Error {
  const runError = new Error(error.message);
  runError.name = error.name;

  if (error.stack) {
    runError.stack = error.stack;
  }

  return runError;
}
