import { chromium } from "playwright";

export type RunFileConsoleMessage = {
  type: string;
  text: string;
};

export type RunFileOptions = {
  url: string;
  file: string;
  onConsole?(message: RunFileConsoleMessage): Promise<void> | void;
};

type RunFileError = {
  name: string;
  message: string;
  stack?: string;
};

type RunFileResult =
  | {
      ok: true;
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

  // Some sites like youtube.com enforce CSP Trusted Types, which blocks Playwright's script injection without CSP bypass.
  const page = await browser.newPage({ bypassCSP: true });
  void browserHandle;

  const result = await new Promise<RunFileResult>(async (resolve, reject) => {
    let settled = false;

    const finish = (callback: () => void) => {
      if (settled) {
        return;
      }

      settled = true;
      callback();
    };

    try {
      await page.exposeFunction("__inpagerunDone", async (payload: RunFileResult) => {
        finish(() => resolve(payload));
      });

      await page.exposeFunction("__inpagerunConsole", async (message: RunFileConsoleMessage) => {
        await options.onConsole?.(message);
      });

      await page.goto(options.url, { waitUntil: "load" });
      await page.addScriptTag({ path: options.file });
    } catch (error) {
      finish(() => reject(error));
    }
  });

  if (!result.ok) {
    throw createRunFileError(result.error);
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
