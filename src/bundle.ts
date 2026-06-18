import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { build } from "vite";
import { inpagerunDynamicImportPlugin } from "./inpagerun-dynamic-import-plugin";
import { inpagerunResolvePlugin, USER_MODULE_ID } from "./inpagerun-resolve-plugin";

export type BundleOptions = {
  code: string;
  cwd?: string;
  consoleFunctionName?: string;
  doneFunctionName?: string;
};

export type BundleArtifact = {
  file: string;
  dispose(): Promise<void>;
  [Symbol.asyncDispose](): Promise<void>;
};

const BUNDLE_FILE_NAME = "bundle.js";
const USER_MODULE_FILE_NAME = "__inpagerun_user_code__.ts";

export async function bundle(options: BundleOptions): Promise<BundleArtifact> {
  const cwd = options.cwd ? resolve(options.cwd) : process.cwd();
  const tempDir = await mkdtemp(join(tmpdir(), "inpagerun-"));
  const outDir = join(tempDir, "dist");
  const entryFile = join(tempDir, "entry.ts");
  const userModuleFile = join(cwd, USER_MODULE_FILE_NAME);

  try {
    await mkdir(outDir, { recursive: true });
    await writeFile(
      entryFile,
      createEntrySource({
        consoleFunctionName: options.consoleFunctionName ?? "__inpagerunConsole",
        doneFunctionName: options.doneFunctionName ?? "__inpagerunDone",
      }),
    );

    await build({
      appType: "custom",
      configFile: false,
      logLevel: "silent",
      publicDir: false,
      root: cwd,
      plugins: [
        inpagerunResolvePlugin({ code: options.code, userModuleFile }),
        inpagerunDynamicImportPlugin(),
      ],
      build: {
        dynamicImportVarsOptions: {
          exclude: [/.*/],
        },
        emptyOutDir: true,
        lib: {
          entry: entryFile,
          fileName: () => BUNDLE_FILE_NAME,
          formats: ["es"],
        },
        minify: false,
        outDir,
        rolldownOptions: {
          output: {
            codeSplitting: false,
          },
        },
        sourcemap: false,
        target: "esnext",
        write: true,
      },
    });
  } catch (error) {
    await rm(tempDir, { force: true, recursive: true });
    throw error;
  }

  let disposed = false;

  const dispose = async () => {
    if (disposed) {
      return;
    }

    disposed = true;
    await rm(tempDir, { force: true, recursive: true });
  };

  return {
    file: join(outDir, BUNDLE_FILE_NAME),
    dispose,
    [Symbol.asyncDispose]: dispose,
  };
}

function createEntrySource(options: {
  consoleFunctionName: string;
  doneFunctionName: string;
}): string {
  return `
const doneFunctionName = ${JSON.stringify(options.doneFunctionName)};
const consoleFunctionName = ${JSON.stringify(options.consoleFunctionName)};

async function runModule() {
  await import("${USER_MODULE_ID}");
}

async function report(payload) {
  await window[doneFunctionName](payload);
}

function formatValue(value) {
  if (typeof value === "string") {
    return value;
  }

  if (value instanceof Error) {
    return value.stack ?? value.name + ": " + value.message;
  }

  try {
    const serialized = JSON.stringify(value, null, 2);

    if (serialized !== undefined) {
      return serialized;
    }
  } catch {
  }

  return String(value);
}

async function forwardConsole(type, args) {
  const text = args.map((value) => formatValue(value)).join(" ");
  await window[consoleFunctionName]({ type, text });
}

async function withForwardedConsole(run) {
  const originalConsole = globalThis.console;
  const forwardedConsole = Object.create(originalConsole);
  const pending = new Set();

  for (const type of ["debug", "error", "info", "log", "warn"]) {
    forwardedConsole[type] = (...args) => {
      const task = forwardConsole(type, args);
      pending.add(task);
      void task.finally(() => {
        pending.delete(task);
      });
    };
  }

  globalThis.console = forwardedConsole;

  try {
    await run();
    await Promise.all(pending);
  } finally {
    globalThis.console = originalConsole;
  }
}

void (async () => {
  try {
    await withForwardedConsole(async () => {
      await runModule();
    });
    await report({ ok: true });
  } catch (error) {
    const normalized = error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { name: "Error", message: String(error), stack: undefined };

    await report({ ok: false, error: normalized });
  }
})();
`;
}
