import { chromium } from "playwright";

export type RunFileOptions = {
  url: string;
  file: string;
};

type RunFileError = {
  name: string;
  message: string;
  stack?: string;
};

type RunFileResult =
  | {
      ok: true;
      value: unknown;
    }
  | {
      ok: false;
      error: RunFileError;
    };

export async function runFile(options: RunFileOptions): Promise<unknown> {
  const browser = await chromium.launch();

  await using browserHandle = {
    async [Symbol.asyncDispose]() {
      await browser.close();
    },
  };

  const page = await browser.newPage();
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

      await page.goto(options.url, { waitUntil: "load" });
      await page.addScriptTag({ path: options.file });
    } catch (error) {
      finish(() => reject(error));
    }
  });

  if (result.ok) {
    return result.value;
  }

  throw createRunFileError(result.error);
}

function createRunFileError(error: RunFileError): Error {
  const runError = new Error(error.message);
  runError.name = error.name;

  if (error.stack) {
    runError.stack = error.stack;
  }

  return runError;
}
